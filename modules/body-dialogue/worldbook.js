import { getFreshSillyTavernContext } from '../integration/context-bridge.js';
import { getCurrentCharacterWorldbooks } from '../integration/tavern-helper-bridge.js';
import { withWorldbookWrite } from '../integration/worldbook-write.js';
import { qqV2WorldbookPlacement } from '../qq-v2/worldbook/placement.js';
import { composeBodyDialoguePrompt, bodyDialogueUsesPersonLanguages } from './config.js';
import { bodyDialogueRepository as repository } from './repository.js';

const MARKER = 'yuziPhoneBodyDialogue';
const COMMENT = 'Yuzi正文｜对话气泡｜body-dialogue-v1';
const owned = entry => entry?.extensions?.[MARKER] === 1 || entry?.comment === COMMENT;

export function createBodyDialogueProjection() {
    let pending = Promise.resolve();
    let status = { state: 'idle', message: '尚未同步', book: '' };
    const listeners = new Set();
    const publish = next => { status = next; for (const listener of listeners) listener(status); };
    return {
        getStatus: () => status,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        sync(config, isCurrent = () => true) {
            const task = pending.then(async () => {
                if (!isCurrent()) return status;
                let target = '';
                try {
                    publish({ state: 'syncing', message: '正在同步世界书…', book: '' });
                    const context = getFreshSillyTavernContext();
                    if (!context?.loadWorldInfo || !context?.saveWorldInfo) throw new Error('宿主世界书接口不可用');
                    const character = context.characters?.[context.characterId ?? context.character_id];
                    if (config.enabled && character?.avatar && !context.groupId && !context.group_id) {
                        target = (await getCurrentCharacterWorldbooks({ strict: true }))?.primary || '';
                    }
                    if (!isCurrent()) return status;
                    const people = target && bodyDialogueUsesPersonLanguages(config) ? await repository.listPeople(String(character.avatar)) : [];
                    if (!isCurrent()) return status;
                    const content = composeBodyDialoguePrompt(config, people);
                    const tracked = await repository.getMeta('worldbooks') || [];
                    const books = [...new Set([...tracked, target].filter(Boolean))];
                    // Record intent before writing: interruption or failed cleanup remains recoverable.
                    await repository.setMeta('worldbooks', books);
                    for (const name of books) {
                        if (!isCurrent()) return status;
                        await withWorldbookWrite(name, async () => {
                            if (!isCurrent()) return;
                            const original = await context.loadWorldInfo(name);
                            if (!original) { if (name === target) throw new Error('主世界书不存在'); return; }
                            const book = structuredClone(original);
                            book.entries ||= {};
                            const matches = Object.entries(book.entries).filter(([, entry]) => owned(entry));
                            for (const [key] of matches) delete book.entries[key];
                            if (name === target) {
                                let uid = matches[0]?.[1]?.uid;
                                if (uid === undefined || Object.hasOwn(book.entries, String(uid))) {
                                    uid = 0; while (Object.hasOwn(book.entries, String(uid))) uid++;
                                }
                                book.entries[String(uid)] = {
                                    uid, key: [], keysecondary: [], comment: COMMENT,
                                    content, constant: true, selective: false,
                                    disable: false, addMemo: true, order: 999, ...qqV2WorldbookPlacement(0),
                                    probability: 100, useProbability: true, excludeRecursion: true,
                                    extensions: { [MARKER]: 1 },
                                };
                            }
                            if (!isCurrent() || JSON.stringify(book) === JSON.stringify(original)) return;
                            await context.saveWorldInfo(name, book, true);
                        });
                    }
                    if (!isCurrent()) return status;
                    await repository.setMeta('worldbooks', target ? [target] : []);
                    publish({ state: target ? 'synced' : 'inactive', book: target,
                        message: target ? `已同步：${target} · D0 · 999 · 蓝灯`
                            : config.enabled ? '未注入：未绑定角色卡主世界书（宿主群聊不自动选书）' : '已关闭：受管世界书条目已清理' });
                } catch (error) {
                    if (isCurrent()) publish({ state: 'error', book: target, message: `未同步：${error.message}` });
                }
                return status;
            });
            pending = task.catch(() => {});
            return task;
        },
    };
}
