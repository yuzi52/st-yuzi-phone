import { normalizeBodyDialogueLanguage } from './config.js';

let database;
function openDatabase() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
        const request = indexedDB.open('yuzi-phone-body-dialogue', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of ['people', 'media', 'audio']) {
                const store = db.createObjectStore(name, { keyPath: 'id' });
                store.createIndex('card', 'card');
                if (name === 'audio') store.createIndex('chat', 'chat');
            }
            db.createObjectStore('meta');
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); database = null; };
            resolve(db);
        };
        request.onerror = () => { database = null; reject(request.error); };
        request.onblocked = () => { database = null; reject(new Error('正文资料库升级被其他窗口阻止，请关闭旧窗口后重试')); };
    });
    return database;
}
const result = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

async function transaction(stores, mode, operation) {
    const db = await openDatabase();
    const tx = db.transaction(stores, mode);
    const completed = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error('正文资料保存事务已取消'));
        tx.onerror = () => {};
    });
    try {
        const value = await operation(name => tx.objectStore(name));
        await completed;
        return value;
    } catch (error) {
        try { tx.abort(); } catch { /* Already completed. */ }
        await completed.catch(() => {});
        throw error;
    }
}

function personName(draft) {
    const name = String(draft.name || '').trim();
    if (!name || /[|「」\r\n]/u.test(name)) throw new Error('姓名不能为空，也不能包含对白格式分隔符');
    return name;
}

function writePerson(store, card, draft, old) {
    const id = old?.id || globalThis.crypto?.randomUUID?.() || `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const person = { id, card, name: personName(draft), language: normalizeBodyDialogueLanguage(draft.language), voice: draft.voice || null };
    for (const slot of ['avatar', 'frame', 'bubble']) {
        const asset = draft[slot], id = `${person.id}:${slot}`;
        if (asset?.blob instanceof Blob) {
            store('media').put({ id, card, blob: asset.blob });
            const { blob: _blob, ...metadata } = asset;
            person[slot] = { ...metadata, mediaId: id };
        } else if (asset?.mediaId && asset.mediaId === old?.[slot]?.mediaId) person[slot] = old[slot];
        else { person[slot] = null; store('media').delete(id); }
    }
    store('people').put(person);
    return { person, previous: old };
}

async function invalidatePeopleAudio(store, card, changes) {
    const ids = new Set(changes.filter(({ person, previous }) => previous
        && (previous.name !== person.name || previous.voice?.voiceId !== person.voice?.voiceId)).map(({ person }) => person.id));
    if (!ids.size) return;
    for (const entry of await result(store('audio').index('card').getAll(card))) {
        if (ids.has(entry.personId)) { store('audio').delete(entry.id); store('media').delete(entry.id); }
    }
}

export const bodyDialogueRepository = {
    listPeople(card) {
        return transaction(['people'], 'readonly', store => result(store('people').index('card').getAll(card)));
    },
    readPeopleWithMedia(card) {
        return transaction(['people', 'media'], 'readonly', async store => {
            const people = await result(store('people').index('card').getAll(card));
            // One consistent snapshot; never load unrelated generated audio or other cards.
            return Promise.all(people.map(async person => {
                for (const slot of ['avatar', 'frame', 'bubble']) if (person[slot]) {
                    const media = await result(store('media').get(person[slot].mediaId));
                    person[slot] = { ...person[slot], blob: media?.blob };
                }
                return person;
            }));
        });
    },
    getMeta(key) { return transaction(['meta'], 'readonly', store => result(store('meta').get(key))); },
    setMeta(key, value) { return transaction(['meta'], 'readwrite', store => result(store('meta').put(value, key))); },
    updateMeta(key, update) {
        return transaction(['meta'], 'readwrite', async store => {
            const value = update(await result(store('meta').get(key)));
            await result(store('meta').put(value, key));
            return value;
        });
    },
    getMedia(id) { return transaction(['media'], 'readonly', store => result(store('media').get(id))); },
    async savePerson(card, draft, canSave = () => true) {
        if (!card) throw new Error('请先打开一张角色卡');
        const name = personName(draft);
        return transaction(['people', 'media', 'audio'], 'readwrite', async store => {
            const people = await result(store('people').index('card').getAll(card));
            if (people.some(person => person.name === name && person.id !== draft.id)) throw new Error('这个姓名已经存在');
            const old = people.find(person => person.id === draft.id);
            if (!canSave()) throw new Error('角色卡已切换或删除，未保存人物');
            if (draft.id && !old) throw new Error('人物已被删除，请重新打开人物管理');
            const change = writePerson(store, card, draft, old);
            await invalidatePeopleAudio(store, card, [change]);
            if (!canSave()) throw new Error('角色卡已切换或删除，未保存人物');
            // Before/after metadata lets the runtime decide whether prompts changed without rereading the database.
            return change;
        });
    },
    importPeople(card, drafts, overwrite = false, canSave = () => true) {
        if (!card) throw new Error('请先打开一张角色卡');
        return transaction(['people', 'media', 'audio'], 'readwrite', async store => {
            const byName = new Map((await result(store('people').index('card').getAll(card))).map(person => [person.name, person]));
            if (!canSave()) throw new Error('角色卡已切换或页面已关闭，未导入人物');
            const changes = [], names = new Set();
            let added = 0, replaced = 0, skipped = 0;
            for (const draft of drafts) {
                const name = personName(draft);
                if (names.has(name)) throw new Error(`配置包内存在重复姓名：${name}`);
                names.add(name);
                const old = byName.get(name);
                if (old && !overwrite) { skipped++; continue; }
                changes.push({ ...writePerson(store, card, draft, old), mediaChanged: true });
                if (old) replaced++; else added++;
            }
            await invalidatePeopleAudio(store, card, changes);
            if (!canSave()) throw new Error('角色卡已切换或页面已关闭，未导入人物');
            return { added, replaced, skipped, changes };
        });
    },
    deletePerson(card, id) {
        return transaction(['people', 'media', 'audio'], 'readwrite', async store => {
            const person = await result(store('people').get(id));
            if (person?.card !== card) return;
            store('people').delete(id);
            for (const slot of ['avatar', 'frame', 'bubble']) store('media').delete(`${id}:${slot}`);
            for (const entry of await result(store('audio').index('card').getAll(card))) {
                if (entry.personId === id) { store('audio').delete(entry.id); store('media').delete(entry.id); }
            }
            return person;
        });
    },
    putAudio(entry, blob) {
        return transaction(['audio', 'media'], 'readwrite', store => {
            store('audio').put(entry); store('media').put({ id: entry.id, card: entry.card, blob });
        });
    },
    pruneAudio(chat, keep, window = null) {
        return transaction(['audio', 'media', 'meta'], 'readwrite', async store => {
            const query = chat ? store('audio').index('chat').getAll(chat) : store('audio').getAll();
            for (const entry of await result(query)) {
                if (!keep(entry)) { store('audio').delete(entry.id); store('media').delete(entry.id); }
            }
            if (window) store('meta').put({ ...window, kind: 'window' }, `window:${chat}`);
        });
    },
    resizeAudioWindows(layers) {
        return transaction(['meta', 'audio', 'media'], 'readwrite', async store => {
            const windows = await result(store('meta').getAll());
            for (const window of windows.filter(value => value?.kind === 'window')) {
                const floors = window.floors.slice(-layers);
                if (floors.length === window.floors.length) continue;
                for (const entry of await result(store('audio').index('chat').getAll(window.chat))) {
                    if (!floors.includes(entry.floor)) { store('audio').delete(entry.id); store('media').delete(entry.id); }
                }
                store('meta').put({ ...window, floors }, `window:${window.chat}`);
            }
        });
    },
    async deleteChat(card, file) {
        const chat = JSON.stringify([card, file]);
        await this.pruneAudio(chat, () => false);
        await transaction(['meta'], 'readwrite', store => result(store('meta').delete(`window:${chat}`)));
    },
    deleteCard(card) {
        return transaction(['people', 'audio', 'media', 'meta'], 'readwrite', async store => {
            for (const name of ['people', 'audio', 'media']) {
                const keys = await result(store(name).index('card').getAllKeys(card));
                for (const id of keys) store(name).delete(id);
            }
            for (const value of await result(store('meta').getAll())) {
                if (value?.kind === 'window' && value.card === card) store('meta').delete(`window:${value.chat}`);
            }
        });
    },
};
