import { getPhoneSettings, savePhoneSetting, subscribePhoneSettingsUpdates } from '../settings.js';
import { getFreshSillyTavernContext } from '../integration/context-bridge.js';
import { onEvent, EventTypes } from '../integration/event-bridge.js';
import { showNotification } from '../integration/toast-bridge.js';
import { getQQV2Facade } from '../qq-v2/runtime/default-runtime.js';
import { normalizeBodyDialogue, BODY_DIALOGUE_NUMBERS, selectBodyDialogueFloors, composeBodyDialoguePrompt, bodyDialogueSpeech, bodyDialogueSpeechControls, bodyDialogueUsesPersonLanguages } from './config.js';
import { bodyDialogueRepository as repository } from './repository.js';
import { createBodyDialogueProjection } from './worldbook.js';
import { renderDialogueFloor, isDialogueProseMutation } from './renderer.js';
import { createBodyDialogueVoice, dialogueDigest } from './voice.js';
import { closeDialogueResources, readDialogueVoiceConnection } from './resources.js';
import { exportBodyDialoguePeoplePack } from './people-pack.js';
import { BODY_MODULE_KEY, BODY_TIME_ID, BODY_MODULE_BYTES, normalizeBodyModuleLibrary, readBodyModulePack,
    exportBodyModulePack, bodyModulePrompt, prepareBodyModules } from './beautify-modules.js';

export function getBodyDialogueScope() {
    const context = getFreshSillyTavernContext();
    const character = context?.characters?.[context?.characterId ?? context?.character_id];
    const group = context?.groupId ?? context?.group_id;
    // A character-list index is not a persistent identity. Never use it as a storage key.
    const card = !group ? String(character?.avatar || '') : '';
    let file = '';
    try { file = context?.getCurrentChatId?.() || ''; } catch { /* Host is changing chats. */ }
    file = String(file || context?.chatId || context?.chat_file || '').replace(/\.jsonl$/i, '');
    return { card, file, chat: file ? JSON.stringify([card || `group:${group || ''}`, file]) : '',
        name: character?.name || '', userName: String(context?.name1 || ''), context };
}

export const readBodyDialogueConfig = () => normalizeBodyDialogue(getPhoneSettings().bodyDialogue);
const projection = createBodyDialogueProjection();
const changes = new Set();
let running = false, generation = 0, timer = null, streaming = false, streamFloor = -1, configVersion = 0;
let cleanups = [], qqCleanup = () => {}, observer = null, observing = null, voice = null;
let loadedCard = null, people = new Map(), retained = new Map(), activeChat = '';
let refreshPending = null, refreshRequested = false, refreshRevision = 0;
let floorDigests = new Map(), audioWindowKey = '', dirtyRoots = new WeakSet();
let settingsSnapshot = null, settingsPending = Promise.resolve(), projectionVersion = 0;
let moduleEntries = normalizeBodyModuleLibrary(), moduleLoad = null, modulesLoaded = false;
let moduleWrites = Promise.resolve(), preparedModules = null, moduleRevision = 0;
const moduleErrors = new Map();
const moduleViewKey = entries => JSON.stringify(entries.filter(entry => entry.enabled).map(entry => [entry.id, entry.controls.map(control => [control.id, control.value])]));
const moduleSettingsSnapshot = () => moduleEntries.map(({ id, name, description, enabled, prompt, controls }) => structuredClone({ id, name, description, enabled, prompt, controls }));
const publish = () => { for (const listener of changes) listener(); };
function reportModuleError(id, error) {
    const message = error?.message || '模块运行失败';
    if (moduleErrors.get(id) === message) return;
    moduleErrors.set(id, message); console.warn('[玉子手机] 正文美化模块', id, error); publish();
}
function loadModules() {
    if (modulesLoaded) return Promise.resolve(moduleEntries);
    if (!moduleLoad) moduleLoad = repository.getMeta(BODY_MODULE_KEY).then(saved => {
        moduleEntries = normalizeBodyModuleLibrary(saved); modulesLoaded = true;
        moduleErrors.delete('library'); publish(); return moduleEntries;
    }).finally(() => { moduleLoad = null; });
    return moduleLoad;
}
function saveModules(update) {
    const task = moduleWrites.then(async () => {
        await loadModules();
        const previousPrompt = bodyModulePrompt(moduleEntries);
        const previousView = moduleViewKey(moduleEntries);
        const next = await repository.updateMeta(BODY_MODULE_KEY, saved => {
            const next = update(normalizeBodyModuleLibrary(saved));
            if (new Blob([JSON.stringify(exportBodyModulePack(next), null, 2)]).size > BODY_MODULE_BYTES) throw new Error('模块库超过 32MB，未保存；请先删除不再使用的模块');
            return next;
        });
        moduleEntries = next;
        if (previousView !== moduleViewKey(next)) {
            moduleRevision++; preparedModules = null; moduleErrors.clear();
            configVersion++; refreshRevision++; schedule();
        }
        publish();
        if (previousPrompt !== bodyModulePrompt(next)) { projectionVersion++; await syncProjection(); }
        return next;
    });
    moduleWrites = task.catch(() => {});
    return task;
}
const readEffectiveConfig = () => {
    const settings = getPhoneSettings(), config = normalizeBodyDialogue(settings.bodyDialogue);
    return { ...config, enabled: settings.enabled !== false && config.enabled };
};
const effectiveConfig = () => settingsSnapshot || readEffectiveConfig();
const restoreFloors = () => {
    observer?.disconnect();
    for (const entry of retained.values()) entry.dispose();
    retained.clear(); voice?.stop();
};
function observeChat() {
    observer?.disconnect();
    if (!observer || !running || streaming || !effectiveConfig().enabled) return;
    observing = document.getElementById('chat');
    if (observing) observer.observe(observing, { childList: true, characterData: true, subtree: true });
}
function handleProseMutations(records) {
    // Our delayed image/audio UI changes are not new host prose; never rescan for them.
    if (streaming) return;
    let changed = false;
    for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const root = target?.closest('.mes_text');
        if (root) {
            if (!isDialogueProseMutation(record, root)) continue;
            dirtyRoots.add(root);
            changed = true;
        } else if ([...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
            && (node.matches('.mes, .mes_text') || node.querySelector('.mes, .mes_text')))) changed = true;
    }
    if (changed) schedule();
}
function mutateProse(update) {
    // Preserve pending host edits before hiding our own restoration from the observer.
    handleProseMutations(observer?.takeRecords() || []);
    observer?.disconnect();
    try { update(); } finally { observeChat(); }
}
function schedule() {
    if (!running || !effectiveConfig().enabled) return;
    refreshRevision++;
    if (timer !== null) return;
    timer = setTimeout(() => {
        timer = null;
        refreshRequested = true;
        if (!refreshPending) refreshPending = (async () => {
            while (running && refreshRequested) {
                refreshRequested = false;
                try { await refresh(); }
                catch (error) { console.warn('[玉子手机] 正文气泡刷新失败', error); }
            }
        })().finally(() => { refreshPending = null; });
    }, 40);
}
async function syncProjection() {
    const token = generation, version = projectionVersion, card = getBodyDialogueScope().card;
    await loadModules().catch(error => reportModuleError('library', error));
    return projection.sync(effectiveConfig(), () => running && token === generation && version === projectionVersion && card === getBodyDialogueScope().card, bodyModulePrompt(moduleEntries));
}

// One settings path for both this page and external restores/imports. Appearance never writes prompts.
function applySettings() {
    const next = readEffectiveConfig(), previous = settingsSnapshot || next;
    settingsSnapshot = next;
    const keys = Object.keys(next).filter(key => key !== 'prompts' && previous[key] !== next[key]);
    const structural = keys.some(key => ['enabled', 'avatar', 'voice', 'bubble', 'bilingual'].includes(key));
    const speechChanged = keys.includes('prosody') || (keys.includes('readOriginal') && next.bilingual);
    if (structural) { configVersion++; voice?.stop(); }
    else if (speechChanged) voice?.stop();
    if (keys.includes('preGenerate') && !next.preGenerate) voice?.stopPreGeneration();
    if (!next.enabled) {
        if (previous.enabled) {
            refreshRevision++; clearTimeout(timer); timer = null; refreshRequested = false;
            restoreFloors(); floorDigests.clear(); audioWindowKey = '';
        }
    } else if (structural || keys.includes('layers') || keys.includes('preGenerate') || (speechChanged && next.preGenerate)) schedule();
    else if (keys.some(key => (key in BODY_DIALOGUE_NUMBERS && key !== 'layers')
        || ['align', 'avatarShape', 'quote', 'nameColor', 'textColor', 'bubbleColor', 'quoteColor'].includes(key))) {
        for (const entry of retained.values()) entry.updateStyle(next);
    }
    if (next.enabled && next.voice && (!previous.enabled || !previous.voice)) void checkVoiceConfiguration().finally(schedule);
    const projectionChanged = previous.enabled !== next.enabled || composeBodyDialoguePrompt(previous) !== composeBodyDialoguePrompt(next)
        || bodyDialogueUsesPersonLanguages(previous) !== bodyDialogueUsesPersonLanguages(next);
    if (projectionChanged) projectionVersion++;
    const tasks = [];
    if (next.layers < previous.layers) tasks.push(repository.resizeAudioWindows(next.layers));
    if (projectionChanged) tasks.push(syncProjection());
    settingsPending = tasks.length ? Promise.all(tasks).then(() => projectionChanged ? projection.getStatus() : null) : Promise.resolve(null);
    publish();
    return settingsPending;
}

async function refresh() {
    if (!running || !effectiveConfig().enabled) return;
    const token = generation, version = configVersion, revision = refreshRevision, scope = getBodyDialogueScope();
    let config = effectiveConfig();
    const currentScope = () => running && token === generation && version === configVersion && scope.chat === getBodyDialogueScope().chat;
    const valid = () => currentScope() && revision === refreshRevision;
    await loadModules();
    if (!valid()) return;
    if (!preparedModules) {
        const revision = moduleRevision;
        preparedModules = prepareBodyModules(moduleEntries, (id, error) => { if (revision === moduleRevision) reportModuleError(id, error); });
    }
    const modules = await preparedModules;
    if (!valid()) return;
    if (scope.chat !== activeChat) { restoreFloors(); activeChat = scope.chat; floorDigests.clear(); audioWindowKey = ''; }
    if (loadedCard !== scope.card) {
        const records = scope.card ? await repository.listPeople(scope.card) : [];
        if (!valid()) return;
        people = new Map(records.map(person => [person.name, person])); loadedCard = scope.card;
    }
    const chat = scope.context?.chat || [];
    const pendingIndex = streaming ? (streamFloor >= 0 ? streamFloor : chat.length - 1) : -1;
    const floors = selectBodyDialogueFloors(chat, config.layers, pendingIndex);
    const nextDigests = new Map(await Promise.all(floors.map(async ({ index, message }) => {
        const text = String(message.mes || ''), cached = floorDigests.get(index);
        return [index, cached?.text === text ? cached : { text, fingerprint: await dialogueDigest(text) }];
    })));
    if (!valid()) return;
    floorDigests = nextDigests;
    const fingerprints = new Map([...nextDigests].map(([index, value]) => [index, value.fingerprint]));
    const voices = new Map([...people.values()].map(person => [person.id, person.voice?.voiceId]));
    const nextWindowKey = JSON.stringify([scope.chat, [...fingerprints], [...voices]]);
    if (scope.chat && nextWindowKey !== audioWindowKey) {
        await repository.pruneAudio(scope.chat, entry => fingerprints.get(entry.floor) === entry.fingerprint
            && voices.get(entry.personId) === entry.voiceId, { card: scope.card, chat: scope.chat, floors: floors.map(floor => floor.index) });
        if (valid()) audioWindowKey = nextWindowKey;
    }
    if (!valid()) return;
    // Pure appearance saves do not schedule another pass; use their newest values after I/O.
    config = effectiveConfig();
    const selected = new Set(config.enabled ? floors.map(floor => floor.index) : []);
    observer?.disconnect();
    try {
        for (const [index, entry] of retained) {
            const host = document.querySelector(`#chat .mes[mesid="${index}"] .mes_text`);
            if (!selected.has(index) || host !== entry.root || !entry.root.isConnected
                || entry.fingerprint !== fingerprints.get(index) || entry.version !== version
                || entry.userName !== scope.userName || dirtyRoots.has(entry.root) || !entry.isIntact()) {
                entry.dispose(); retained.delete(index); voice?.stop();
            } else entry.updateStyle(config);
        }
        if (!config.enabled) return;
        for (const { index } of floors) {
            if (retained.has(index)) continue;
            const root = document.querySelector(`#chat .mes[mesid="${index}"] .mes_text`);
            if (!root || root.closest('[is_user="true"]')) continue;
            const fingerprint = fingerprints.get(index);
            const voiceInput = (dialogue, person, button) => ({ ...scope, floor: index, fingerprint, dialogue, person, button,
                speechText: bodyDialogueSpeech(dialogue, effectiveConfig()),
                speechControls: bodyDialogueSpeechControls(dialogue, effectiveConfig()),
                isCurrent: () => currentScope() && effectiveConfig().enabled && effectiveConfig().voice && retained.get(index)?.fingerprint === fingerprint });
            const view = renderDialogueFloor(root, {
                config, people, userName: scope.userName, modules, mutateProse,
                onPlay: (dialogue, person, button) => voice.play(voiceInput(dialogue, person, button)),
            });
            dirtyRoots.delete(root);
            retained.set(index, { root, fingerprint, version, userName: scope.userName, ...view,
                getVoiceRequests: () => view.voiceItems.map(({ dialogue, person, button }) => voiceInput(dialogue, person, button)) });
        }
        const latest = retained.get(floors.at(-1)?.index);
        if (!streaming && !voiceCheckPending && config.voice && config.preGenerate && latest) {
            void voice.preGenerate(latest, latest.getVoiceRequests).catch(error => console.warn('[玉子手机] 正文语音预生成失败', error));
        }
    } finally { observeChat(); }
}

async function checkVoiceConfigurationNow() {
    if (!running || !effectiveConfig().enabled || !effectiveConfig().voice) return;
    const token = generation;
    try {
        const connection = await readDialogueVoiceConnection();
        const signature = await dialogueDigest(JSON.stringify(connection.settings));
        if (!running || token !== generation || !effectiveConfig().enabled || !effectiveConfig().voice) return;
        const previous = await repository.getMeta('voiceSignature');
        if (previous !== signature) {
            voice?.stop(true);
            await repository.pruneAudio('', entry => entry.signature === signature);
            await repository.setMeta('voiceSignature', signature);
            if (running && token === generation) schedule();
        }
    } catch { /* Missing TTS configuration is reported only on an explicit play action. */ }
}

let voiceCheckPending = null, voiceCheckRequested = false;
function checkVoiceConfiguration() {
    voiceCheckRequested = true;
    if (!voiceCheckPending) voiceCheckPending = (async () => {
        while (running && voiceCheckRequested) { voiceCheckRequested = false; await checkVoiceConfigurationNow(); }
    })().finally(() => { voiceCheckPending = null; });
    return voiceCheckPending;
}

async function bindQQUpdates() {
    qqCleanup(); qqCleanup = () => {};
    const token = generation;
    const unsubscribe = await getQQV2Facade()?.subscribe(event => {
        if (event?.reason !== 'voice-settings-changed' || !effectiveConfig().enabled || !effectiveConfig().voice) return;
        voice?.stop(true);
        void checkVoiceConfiguration().finally(schedule);
    });
    if (!running || token !== generation) unsubscribe?.();
    else { qqCleanup = unsubscribe || (() => {}); void checkVoiceConfiguration().finally(schedule); }
}

async function peopleChanged(card, changes) {
    if (!changes.length || !running || getBodyDialogueScope().card !== card) return;
    const config = effectiveConfig();
    const promptChanged = changes.some(({ previous, person }) => composeBodyDialoguePrompt(config, previous ? [previous] : [])
        !== composeBodyDialoguePrompt(config, person ? [person] : []));
    if (promptChanged) projectionVersion++;
    if (changes.some(({ previous, person, mediaChanged }) => mediaChanged || JSON.stringify(previous) !== JSON.stringify(person))) {
        loadedCard = null;
        const visualKeys = ['id', 'name', 'avatar', 'frame', 'bubble', 'voice'];
        if (changes.some(({ previous, person, mediaChanged }) => mediaChanged
            || visualKeys.some(key => JSON.stringify(previous?.[key]) !== JSON.stringify(person?.[key])))) {
            configVersion++; voice?.stop();
        }
        schedule();
    }
    publish();
    if (promptChanged) await syncProjection();
}

export const bodyDialogueService = {
    readConfig: readBodyDialogueConfig,
    getScope: getBodyDialogueScope,
    getStatus: () => projection.getStatus(),
    getModules: moduleSettingsSnapshot,
    getModuleErrors: () => Object.fromEntries(moduleErrors),
    getModulePrompt: () => bodyModulePrompt(moduleEntries),
    async loadModules() { await loadModules(); return moduleSettingsSnapshot(); },
    async exportModules() {
        await moduleWrites; await loadModules();
        const pack = exportBodyModulePack(moduleEntries);
        if (new Blob([JSON.stringify(pack, null, 2)]).size > BODY_MODULE_BYTES) throw new Error('模块包超过 32MB，请先删除不再使用的模块');
        return pack;
    },
    async importModules(source) {
        const incoming = readBodyModulePack(source);
        await saveModules(entries => [...entries, ...incoming]);
        return incoming.length;
    },
    saveModule(id, patch) {
        return saveModules(entries => {
            const entry = entries.find(item => item.id === id);
            if (!entry) throw new Error('模块已删除');
            if (typeof patch.enabled === 'boolean') entry.enabled = patch.enabled;
            if (typeof patch.prompt === 'string') entry.prompt.value = patch.prompt;
            if (patch.controlId) {
                const control = entry.controls.find(item => item.id === patch.controlId);
                if (!control) throw new Error('模块开关不存在');
                if (typeof patch.controlValue === 'boolean') control.value = patch.controlValue;
                if (typeof patch.controlPrompt === 'string' && control.prompt) control.prompt.value = patch.controlPrompt;
            }
            return entries;
        });
    },
    deleteModule(id) {
        if (id === BODY_TIME_ID) return Promise.reject(new Error('自带时间栏作为模板保留，不能删除'));
        return saveModules(entries => entries.filter(entry => entry.id !== id));
    },
    subscribe(listener) { changes.add(listener); const off = projection.subscribe(listener); return () => { changes.delete(listener); off(); }; },
    async saveConfig(next) {
        if (!savePhoneSetting('bodyDialogue', normalizeBodyDialogue(next))) throw new Error('正文气泡设置保存失败');
        // savePhoneSetting publishes synchronously; its subscriber owns all side effects.
        return settingsPending;
    },
    sync: syncProjection,
    async listPeople() { const { card } = getBodyDialogueScope(); return card ? repository.listPeople(card) : []; },
    async exportPeople(card) {
        const token = generation;
        if (!card || getBodyDialogueScope().card !== card) throw new Error('请先打开目标角色卡');
        const records = await repository.readPeopleWithMedia(card);
        if (!records.length) throw new Error('当前角色卡还没有可导出的人物');
        const pack = await exportBodyDialoguePeoplePack(records);
        if (token !== generation || getBodyDialogueScope().card !== card) throw new Error('角色卡已切换，请重新导出');
        return pack;
    },
    async importPeople(card, drafts, overwrite = false, isCurrent = () => true) {
        const token = generation;
        const canSave = () => token === generation && getBodyDialogueScope().card === card && isCurrent();
        if (!canSave()) throw new Error('角色卡已切换或页面已关闭，未导入人物');
        const { changes, ...counts } = await repository.importPeople(card, drafts, overwrite, canSave);
        await peopleChanged(card, changes);
        return counts;
    },
    async savePerson(card, draft) {
        if (getBodyDialogueScope().card !== card) throw new Error('角色卡已切换，请重新打开人物管理');
        const token = generation;
        const snapshot = structuredClone(draft);
        const { person, previous } = await repository.savePerson(card, snapshot, () => token === generation && getBodyDialogueScope().card === card);
        await peopleChanged(card, [{ previous, person, mediaChanged: ['avatar', 'frame', 'bubble'].some(key => snapshot[key]?.blob instanceof Blob) }]);
        return person;
    },
    async deletePerson(card, id) {
        if (getBodyDialogueScope().card !== card) throw new Error('角色卡已切换');
        const previous = await repository.deletePerson(card, id);
        if (previous) await peopleChanged(card, [{ previous, person: null }]);
    },
};

export async function initializeBodyDialogue() {
    if (running) return;
    running = true; const token = ++generation;
    settingsSnapshot = readEffectiveConfig();
    await loadModules().catch(error => reportModuleError('library', error));
    if (!running || token !== generation) return;
    settingsSnapshot = readEffectiveConfig();
    const processor = getBodyDialogueScope().context?.streamingProcessor;
    streaming = Boolean(processor && !processor.isFinished && !processor.isStopped);
    streamFloor = streaming ? (processor.messageId >= 0 ? processor.messageId : getBodyDialogueScope().context.chat.length) : -1;
    voice = createBodyDialogueVoice();
    observer = new MutationObserver(handleProseMutations);
    const bind = async (type, handler) => {
        const off = await onEvent(type, handler);
        if (running && generation === token) cleanups.push(off); else off();
    };
    cleanups.push(subscribePhoneSettingsUpdates(({ key }) => {
        if (!key || ['bodyDialogue', 'enabled'].includes(key)) {
            void applySettings().catch(error => console.warn('[玉子手机] 正文气泡设置同步失败', error));
        }
    }));
    await Promise.all([
        ...[EventTypes.CHARACTER_MESSAGE_RENDERED, EventTypes.MESSAGE_RECEIVED, EventTypes.MESSAGE_UPDATED,
            EventTypes.MESSAGE_DELETED, EventTypes.MESSAGE_SWIPED, EventTypes.USER_MESSAGE_RENDERED].map(type => bind(type, schedule)),
        bind(EventTypes.GENERATION_STARTED, (type, options = {}, dryRun = false) => {
            if (dryRun || type === 'impersonate' || (type === 'quiet' && !options.quietToLoud)) return;
            streaming = true;
            const chat = getBodyDialogueScope().context?.chat || [];
            streamFloor = ['continue', 'swipe', 'regenerate'].includes(type) ? chat.length - 1 : chat.length;
            observer?.disconnect();
            const entry = retained.get(streamFloor); entry?.dispose(); retained.delete(streamFloor); voice?.stop();
            observeChat(); schedule();
        }),
        ...[EventTypes.GENERATION_ENDED, EventTypes.GENERATION_STOPPED].map(type => bind(type, () => { streaming = false; streamFloor = -1; schedule(); })),
        bind(EventTypes.CHAT_CHANGED, () => {
            generation++; streaming = false; streamFloor = -1; loadedCard = null;
            restoreFloors(); observeChat(); schedule(); publish(); void syncProjection(); void bindQQUpdates();
        }),
        bind(EventTypes.WORLDINFO_UPDATED, () => { void syncProjection(); }),
        bind(EventTypes.CHARACTER_PAGE_LOADED, () => { void syncProjection(); }),
        bind(EventTypes.CHAT_DELETED, file => {
            const { card } = getBodyDialogueScope();
            if (card) void repository.deleteChat(card, String(file || '').replace(/\.jsonl$/i, '')).catch(console.warn);
            audioWindowKey = ''; voice?.stop(); schedule();
        }),
        bind('characterDeleted', ({ character } = {}) => {
            generation++;
            const card = String(character?.avatar || '');
            if (card) void repository.deleteCard(card).catch(console.warn);
            loadedCard = null; configVersion++; restoreFloors(); schedule(); publish(); void syncProjection();
        }),
    ]);
    if (!running) return;
    observeChat(); schedule(); void syncProjection(); void bindQQUpdates();
}

export function destroyBodyDialogue() {
    running = false; generation++; clearTimeout(timer); timer = null; refreshRequested = false;
    streaming = false; streamFloor = -1;
    cleanups.splice(0).forEach(off => off()); qqCleanup(); qqCleanup = () => {};
    restoreFloors(); observer = null; observing = null; voice = null; loadedCard = null; activeChat = '';
    floorDigests.clear(); audioWindowKey = ''; dirtyRoots = new WeakSet(); settingsSnapshot = null;
    preparedModules = null; moduleRevision++;
    void projection.sync({ ...readBodyDialogueConfig(), enabled: false }).catch(error => showNotification(error.message, 'error'));
    void closeDialogueResources();
}
