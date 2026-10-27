import { QQ_OUTPUT_PROTOCOLS } from '../prompt/output-protocols.js';
import { createAssistantPromptPreset } from '../prompt/assistant-preset.js';
import { createChatPromptPresets } from '../prompt/chat-presets.js';
import { normalizeQQV2OpenAIBaseUrl } from '../api-endpoint-policy.js';
import { createQQV2ApiKeyStore } from './api-key-store.js';
import { createQQVoicePresetStore } from '../voice/presets.js';
import { QQ_VOICE_API_KEY_ID } from '../voice/settings.js';
import {
    QQ_VOICE_LIBRARY_STORAGE_KEY,
    mergeQQVoiceLibrary,
    normalizeQQVoiceEntry,
    normalizeQQVoiceLibrary,
} from '../voice/library.js';

const API_PRESETS_STORAGE_KEY = 'qq-v2.resources.api-presets';
const PROMPT_PRESETS_STORAGE_KEY = 'qq-v2.resources.prompt-presets-v3';
const STICKERS_STORAGE_KEY = 'qq-v2.resources.stickers';
const IMAGE_GENERATION_PRESETS_STORAGE_KEY = 'qq-v2.resources.image-generation-presets';
const PROMPT_MESSAGE_ROLES = new Set(['system', 'user', 'assistant']);
const IMAGE_GENERATION_PRESET_KEYS = new Set(['entries']);
const IMAGE_GENERATION_ENTRY_KEYS = new Set([
    'id',
    'name',
    'role',
    'content',
    'enabled',
    'triggerMode',
    'triggerWords',
    'andTriggerWords',
]);

/** 内置预设的文案在 prompt/ 下按场景组装；这里只负责注入各场景的输出协议。 */
const BUILT_IN_PROMPT_PRESETS = Object.freeze([
    ...createChatPromptPresets(QQ_OUTPUT_PROTOCOLS),
    createAssistantPromptPreset(QQ_OUTPUT_PROTOCOLS.assistantReply),
]);

function resourceError(code, message) {
    const error = new Error(message);
    error.name = 'QQV2ResourceError';
    error.code = code;
    return error;
}

function clonePromptMessages(messages) {
    if (!Array.isArray(messages)) {
        throw resourceError('invalid_prompt_messages', 'Prompt preset messages must be an array');
    }

    return messages.map((block) => {
        const role = String(block?.role ?? '').trim();
        if (!PROMPT_MESSAGE_ROLES.has(role)) {
            throw resourceError('invalid_prompt_message_role', 'Prompt message role is not supported');
        }
        return {
            id: String(block?.id ?? ''),
            name: String(block?.name ?? ''),
            role,
            content: String(block?.content ?? ''),
        };
    });
}

function requireStorage(storage) {
    if (!storage
        || typeof storage.get !== 'function'
        || typeof storage.set !== 'function'
        || typeof storage.delete !== 'function') {
        throw new TypeError('QQ v2 resource service needs async get, set, and delete storage methods');
    }
    return storage;
}

function createId(cryptoApi) {
    if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeApiEndpoint(value) {
    try {
        return normalizeQQV2OpenAIBaseUrl(value);
    } catch (error) {
        throw resourceError('invalid_api_endpoint', error?.message || 'API 地址无效');
    }
}

function numberOrDefault(value, fallback) {
    return value === undefined ? fallback : Number(value);
}

function suppliedApiKey(input) {
    if (input?.apiKey === undefined || input?.apiKey === null) return null;
    const value = String(input.apiKey);
    return value.trim() ? value : null;
}

function publicApiPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        endpoint: record.endpoint,
        model: record.model,
        temperature: record.temperature,
        maxOutput: record.maxOutput,
        hasApiKey: record.hasApiKey,
    });
}

function publicPromptPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: Object.freeze(record.messages.map((block) => Object.freeze({ ...block }))),
    });
}

function clonePromptPreset(record) {
    return {
        id: record.id,
        name: record.name,
        isBuiltIn: record.isBuiltIn,
        messages: record.messages.map((block) => ({ ...block })),
    };
}

function cloneImageGenerationEntry(entry) {
    return {
        id: String(entry?.id ?? ''),
        name: String(entry?.name ?? ''),
        role: String(entry?.role ?? ''),
        content: String(entry?.content ?? ''),
        enabled: entry?.enabled !== false,
        triggerMode: String(entry?.triggerMode ?? 'always'),
        triggerWords: String(entry?.triggerWords ?? ''),
        andTriggerWords: String(entry?.andTriggerWords ?? ''),
    };
}

function publicImageGenerationPreset(record) {
    return Object.freeze({
        id: record.id,
        name: record.name,
        entries: Object.freeze(record.entries.map(entry => Object.freeze(cloneImageGenerationEntry(entry))),
        ),
    });
}

function cloneImageGenerationPreset(record) {
    return {
        id: String(record?.id ?? ''),
        name: String(record?.name ?? ''),
        entries: Array.isArray(record?.entries)
            ? record.entries.map(cloneImageGenerationEntry)
            : [],
    };
}

function validateImageGenerationPresetSource(source) {
    if (!source
        || typeof source !== 'object'
        || Array.isArray(source)
        || Object.getPrototypeOf(source) !== Object.prototype) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入必须是 st-chatu8 顶层预设对象',
        );
    }

    const names = Object.keys(source);
    if (names.length === 0) {
        throw resourceError(
            'invalid_image_generation_preset_import',
            '生图预设导入至少需要一份预设',
        );
    }

    return names.map((name) => {
        const preset = source[name];
        const normalizedName = String(name ?? '').trim();
        if (!normalizedName || normalizedName === '__proto__'
            || normalizedName === 'constructor' || normalizedName === 'prototype'
            || !preset || typeof preset !== 'object'
            || Array.isArray(preset)
            || Object.getPrototypeOf(preset) !== Object.prototype
            || !Array.isArray(preset.entries)
            || Object.keys(preset).some(key => !IMAGE_GENERATION_PRESET_KEYS.has(key))) {
            throw resourceError(
                'invalid_image_generation_preset_import',
                '生图预设必须包含合法的 entries 数组',
            );
        }

        const entries = preset.entries.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块必须是对象',
                );
            }
            if (Object.getPrototypeOf(entry) !== Object.prototype
                || Object.keys(entry).some(key => !IMAGE_GENERATION_ENTRY_KEYS.has(key))) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块包含未知字段',
                );
            }
            const role = String(entry.role ?? '').trim();
            if (!PROMPT_MESSAGE_ROLES.has(role)
                || typeof entry.content !== 'string'
                || (entry.id !== undefined && typeof entry.id !== 'string')
                || (entry.name !== undefined && typeof entry.name !== 'string')
                || (entry.triggerMode !== undefined && typeof entry.triggerMode !== 'string')
                || (entry.triggerWords !== undefined && typeof entry.triggerWords !== 'string')
                || (entry.andTriggerWords !== undefined && typeof entry.andTriggerWords !== 'string')) {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 role 或 content 无效',
                );
            }
            if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') {
                throw resourceError(
                    'invalid_image_generation_preset_import',
                    '生图预设消息块的 enabled 必须是布尔值',
                );
            }
            return {
                id: String(entry.id ?? ''),
                name: String(entry.name ?? ''),
                role,
                content: entry.content,
                enabled: entry.enabled !== false,
                triggerMode: String(entry.triggerMode ?? 'always'),
                triggerWords: String(entry.triggerWords ?? ''),
                andTriggerWords: String(entry.andTriggerWords ?? ''),
            };
        });

        return { name: normalizedName, entries };
    });
}

function nextImageGenerationPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported image preset';
    const usedNames = new Set(presets.map(preset => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function nextPromptPresetCopyName(requestedName, presets) {
    const baseName = String(requestedName ?? '').trim() || 'Imported preset';
    const usedNames = new Set(presets.map((preset) => String(preset?.name ?? '').trim()));
    if (!usedNames.has(baseName)) return baseName;

    let copyNumber = 1;
    let candidate = `${baseName} (copy)`;
    while (usedNames.has(candidate)) {
        copyNumber += 1;
        candidate = `${baseName} (copy ${copyNumber})`;
    }
    return candidate;
}

function uniquePromptPresetName(value, presets, ignoredId = '') {
    const name = String(value ?? '').trim();
    if (!name) {
        throw resourceError('prompt_preset_name_required', 'AI 指令预设名称不能为空');
    }
    const conflict = presets.some((preset) => (
        preset.id !== ignoredId
        && String(preset.name ?? '').trim() === name
    ));
    const reservedConflict = BUILT_IN_PROMPT_PRESETS.some((preset) => (
        preset.id !== ignoredId
        && preset.name === name
    ));
    if (conflict || reservedConflict) {
        throw resourceError('prompt_preset_name_conflict', '已经存在同名 AI 指令预设');
    }
    return name;
}

function publicSticker(record) {
    return Object.freeze({
        id: record.id,
        description: record.description,
        mimeType: record.mimeType,
        size: record.size,
        order: record.order,
    });
}

function isBlob(value) {
    return typeof globalThis.Blob === 'function' && value instanceof globalThis.Blob;
}

function orderedStickers(stickers) {
    return [...stickers].sort((left, right) => left.order - right.order);
}

/**
 * Extension-wide QQ v2 resources. Storage is intentionally injected so the
 * future IndexedDB adapter stays outside this domain service.
 */
export function createQQV2ResourceService(options = {}) {
    const storage = requireStorage(options.storage);
    const readMedia = typeof options.readMedia === 'function'
        ? options.readMedia
        : async () => null;
    const cryptoApi = options.cryptoApi ?? globalThis.crypto;
    const apiKeys = createQQV2ApiKeyStore({ storage, cryptoApi });
    const voicePresets = createQQVoicePresetStore({ storage, apiKeys, cryptoApi });

    const readApiState = async () => {
        const stored = await storage.get(API_PRESETS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.presets)
            ? { presets: [...stored.presets] }
            : { presets: [] };
    };

    const readVoiceApiKey = async () => {
        const connection = await voicePresets.connection();
        if (connection) return connection.apiKey;
        try {
            return await apiKeys.get(QQ_VOICE_API_KEY_ID);
        } catch (error) {
            // A missing key is a normal state, not a broken account setting.
            if (error?.code === 'api_key_reentry_required') return '';
            throw error;
        }
    };

    const readPromptState = async (mapPreset = clonePromptPreset) => {
        const stored = await storage.get(PROMPT_PRESETS_STORAGE_KEY);
        if (stored && typeof stored === 'object' && Array.isArray(stored.presets)) {
            return { presets: stored.presets.map(mapPreset) };
        }
        return { presets: BUILT_IN_PROMPT_PRESETS.map(mapPreset) };
    };

    const readStickerState = async () => {
        const stored = await storage.get(STICKERS_STORAGE_KEY);
        return stored && typeof stored === 'object' && Array.isArray(stored.stickers)
            ? { stickers: stored.stickers.map((sticker) => ({ ...sticker })) }
            : { stickers: [] };
    };

    const deleteStickerRecords = async (ids) => {
        if (!Array.isArray(ids)) {
            throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
        }
        const requestedIds = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (requestedIds.length === 0) return { deletedStickerIds: [] };

        const state = await readStickerState();
        const existingIds = new Set(state.stickers.map((sticker) => sticker.id));
        const deletedStickerIds = requestedIds.filter((id) => existingIds.has(id));
        if (deletedStickerIds.length === 0) return { deletedStickerIds };

        const deleted = new Set(deletedStickerIds);
        state.stickers = orderedStickers(state.stickers.filter((sticker) => !deleted.has(sticker.id)))
            .map((sticker, order) => ({ ...sticker, order }));
        await storage.set(STICKERS_STORAGE_KEY, state);
        return { deletedStickerIds };
    };

    const readImageGenerationPresetState = async () => {
        const stored = await storage.get(IMAGE_GENERATION_PRESETS_STORAGE_KEY);
        if (!stored || typeof stored !== 'object' || !Array.isArray(stored.presets)) {
            return { presets: [] };
        }
        return {
            presets: stored.presets
                .filter(preset => preset && typeof preset === 'object')
                .map(cloneImageGenerationPreset),
        };
    };

    const saveStickerIntoState = (input, state) => {
        const requestedId = String(input?.id ?? '').trim();
        const existingIndex = requestedId
            ? state.stickers.findIndex((sticker) => sticker.id === requestedId)
            : -1;
        if (requestedId && existingIndex === -1) {
            throw resourceError('sticker_not_found', 'Sticker does not exist');
        }

        const existing = existingIndex === -1 ? null : state.stickers[existingIndex];
        const description = String(input?.description ?? existing?.description ?? '').trim();
        if (!description) {
            throw resourceError('sticker_description_required', 'Sticker description is required');
        }
        const blob = isBlob(input?.blob) ? input.blob : null;
        if (!blob && !existing?.mediaKey && !isBlob(existing?.blob)) {
            throw resourceError('invalid_sticker_blob', 'Sticker must contain a Blob');
        }
        const storedBlob = blob || (isBlob(existing?.blob) ? existing.blob : null);

        const record = {
            id: existing?.id ?? createId(cryptoApi),
            description,
            mimeType: storedBlob?.type || existing?.mimeType || '',
            size: Math.max(0, Number(storedBlob?.size ?? existing?.size) || 0),
            order: existing?.order ?? state.stickers.length,
            ...(existing?.mediaKey ? { mediaKey: existing.mediaKey } : {}),
            ...(storedBlob ? { blob: storedBlob } : {}),
        };
        if (existingIndex === -1) {
            state.stickers.push(record);
        } else {
            state.stickers[existingIndex] = record;
        }
        return record;
    };

    return Object.freeze({
        async listStickers() {
            const state = await readStickerState();
            return Object.freeze(orderedStickers(state.stickers).map(publicSticker));
        },
        async saveSticker(input) {
            const state = await readStickerState();
            const record = saveStickerIntoState(input, state);
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(record);
        },
        async saveStickers(inputs) {
            if (!Array.isArray(inputs)) {
                throw resourceError('invalid_sticker_batch', 'Sticker batch must be an array');
            }

            const state = await readStickerState();
            const records = inputs.map((input) => saveStickerIntoState(input, state));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return Object.freeze(records.map(publicSticker));
        },
        async getStickerBlob(id) {
            const state = await readStickerState();
            const sticker = state.stickers.find((item) => item.id === id);
            if (!sticker) return null;
            if (isBlob(sticker.blob)) return sticker.blob;
            return readMedia(sticker.mediaKey);
        },
        async moveSticker(id, targetIndex) {
            const state = await readStickerState();
            const stickers = orderedStickers(state.stickers);
            const sourceIndex = stickers.findIndex((sticker) => sticker.id === id);
            if (sourceIndex === -1) return null;
            if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= stickers.length) {
                throw resourceError('invalid_sticker_order', 'Sticker target order is out of range');
            }

            const [moved] = stickers.splice(sourceIndex, 1);
            stickers.splice(targetIndex, 0, moved);
            state.stickers = stickers.map((sticker, order) => ({ ...sticker, order }));
            await storage.set(STICKERS_STORAGE_KEY, state);
            return publicSticker(state.stickers[targetIndex]);
        },
        async deleteSticker(id) {
            const { deletedStickerIds } = await deleteStickerRecords([id]);
            return deletedStickerIds.length > 0;
        },
        async deleteStickers(ids) {
            return deleteStickerRecords(ids);
        },
        async listPromptPresets() {
            const state = await readPromptState(publicPromptPreset);
            return Object.freeze(state.presets);
        },
        async getPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async savePromptPreset(input) {
            const state = await readPromptState();
            const requestedId = String(input?.id ?? '').trim();
            const index = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && index === -1) {
                throw resourceError('prompt_preset_not_found', 'Prompt preset does not exist');
            }

            const existing = index === -1 ? null : state.presets[index];
            const name = uniquePromptPresetName(
                input?.name ?? existing?.name,
                state.presets,
                existing?.id,
            );
            const messages = Array.isArray(input?.messages)
                ? clonePromptMessages(input.messages)
                : existing?.messages.map((block) => ({ ...block })) ?? [];
            const record = {
                id: existing?.id ?? createId(cryptoApi),
                name,
                isBuiltIn: existing?.isBuiltIn ?? false,
                messages,
            };
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreBuiltInPromptPreset(id) {
            const factoryPreset = BUILT_IN_PROMPT_PRESETS.find((preset) => preset.id === id);
            if (!factoryPreset) {
                throw resourceError('built_in_prompt_preset_not_found', 'Built-in prompt preset does not exist');
            }

            const state = await readPromptState();
            uniquePromptPresetName(factoryPreset.name, state.presets, id);
            const record = clonePromptPreset(factoryPreset);
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) {
                state.presets.push(record);
            } else {
                state.presets[index] = record;
            }
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return publicPromptPreset(record);
        },
        async restoreAllBuiltInPromptPresets() {
            const state = await readPromptState();
            const customPresets = state.presets.filter((preset) => !preset.isBuiltIn);
            const restoredPresets = BUILT_IN_PROMPT_PRESETS.map(clonePromptPreset);
            restoredPresets.forEach((preset) => uniquePromptPresetName(preset.name, customPresets, preset.id));
            state.presets = [...restoredPresets, ...customPresets];
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(restoredPresets.map(publicPromptPreset));
        },
        async importPromptPresets(source) {
            const importedSource = Array.isArray(source)
                ? source
                : Array.isArray(source?.presets) ? source.presets : null;
            if (!importedSource) {
                throw resourceError('invalid_prompt_import', 'Prompt preset import must contain presets');
            }

            const state = await readPromptState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextPromptPresetCopyName(preset?.name, state.presets),
                    isBuiltIn: false,
                    messages: Array.isArray(preset?.messages)
                        ? clonePromptMessages(preset.messages)
                        : [],
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicPromptPreset));
        },
        async exportPromptPreset(id) {
            const state = await readPromptState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicPromptPreset(record) : null;
        },
        async exportAllPromptPresets() {
            const state = await readPromptState(publicPromptPreset);
            return Object.freeze(state.presets);
        },
        async deletePromptPreset(id) {
            const state = await readPromptState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;
            if (state.presets[index].isBuiltIn) {
                throw resourceError('built_in_prompt_preset', 'Built-in prompt presets cannot be deleted');
            }

            state.presets.splice(index, 1);
            await storage.set(PROMPT_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listImageGenerationPresets() {
            const state = await readImageGenerationPresetState();
            return Object.freeze(state.presets.map(publicImageGenerationPreset));
        },
        async getImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            return record ? publicImageGenerationPreset(record) : null;
        },
        async importImageGenerationPresets(source) {
            const importedSource = validateImageGenerationPresetSource(source);
            const state = await readImageGenerationPresetState();
            const imported = importedSource.map((preset) => {
                const record = {
                    id: createId(cryptoApi),
                    name: nextImageGenerationPresetCopyName(preset.name, state.presets),
                    entries: preset.entries.map(cloneImageGenerationEntry),
                };
                state.presets.push(record);
                return record;
            });
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return Object.freeze(imported.map(publicImageGenerationPreset));
        },
        async exportImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return null;
            const state = await readImageGenerationPresetState();
            const record = state.presets.find(preset => preset.id === normalizedId);
            if (!record) return null;
            return {
                [record.name]: {
                    entries: record.entries.map(cloneImageGenerationEntry),
                },
            };
        },
        async deleteImageGenerationPreset(id) {
            const normalizedId = String(id ?? '').trim();
            if (!normalizedId) return false;
            const state = await readImageGenerationPresetState();
            const index = state.presets.findIndex(preset => preset.id === normalizedId);
            if (index === -1) return false;
            state.presets.splice(index, 1);
            await storage.set(IMAGE_GENERATION_PRESETS_STORAGE_KEY, state);
            return true;
        },
        async listApiPresets() {
            const state = await readApiState();
            return Object.freeze(state.presets.map(publicApiPreset));
        },
        async saveApiPreset(input) {
            const state = await readApiState();
            const requestedId = String(input?.id ?? '').trim();
            const existingIndex = requestedId
                ? state.presets.findIndex((preset) => preset.id === requestedId)
                : -1;
            if (requestedId && existingIndex === -1) {
                throw resourceError('api_preset_not_found', 'API preset does not exist');
            }

            const existing = existingIndex === -1 ? null : state.presets[existingIndex];
            const apiKey = suppliedApiKey(input);
            const id = existing?.id ?? createId(cryptoApi);
            const record = {
                id,
                name: String(input?.name ?? existing?.name ?? ''),
                endpoint: normalizeApiEndpoint(input?.endpoint ?? existing?.endpoint),
                model: String(input?.model ?? existing?.model ?? ''),
                temperature: numberOrDefault(input?.temperature, existing?.temperature ?? 1),
                maxOutput: numberOrDefault(input?.maxOutput, existing?.maxOutput ?? 4096),
                hasApiKey: apiKey !== null ? true : Boolean(existing?.hasApiKey),
                ...(apiKey === null && existing?.iv && existing?.ciphertext
                    ? { iv: existing.iv, ciphertext: existing.ciphertext }
                    : {}),
            };
            if (apiKey !== null) await apiKeys.set(id, apiKey);
            if (existingIndex === -1) {
                state.presets.push(record);
            } else {
                state.presets[existingIndex] = record;
            }
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            return publicApiPreset(record);
        },
        async getApiPreset(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            return record ? publicApiPreset(record) : null;
        },
        async getApiPresetForRequest(id) {
            const state = await readApiState();
            const record = state.presets.find((preset) => preset.id === id);
            if (!record) return null;
            if (!record.hasApiKey) {
                return Object.freeze({
                    ...publicApiPreset(record),
                    apiKey: '',
                });
            }

            const apiKey = await apiKeys.get(record.id, record);
            if (record.iv || record.ciphertext) {
                delete record.iv;
                delete record.ciphertext;
                await storage.set(API_PRESETS_STORAGE_KEY, state);
            }
            return Object.freeze({
                ...publicApiPreset(record),
                apiKey,
            });
        },
        async deleteApiPreset(id) {
            const state = await readApiState();
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) return false;

            state.presets.splice(index, 1);
            await storage.set(API_PRESETS_STORAGE_KEY, state);
            await apiKeys.delete(id);
            return true;
        },
        /**
         * The voice API key never enters a preset record or an exportable
         * settings blob; it lives beside the API preset secrets.
         */
        async getVoiceApiKey() {
            return readVoiceApiKey();
        },
        async hasVoiceApiKey() {
            return Boolean(await readVoiceApiKey());
        },
        async setVoiceApiKey(apiKey) {
            return voicePresets.setApiKey(apiKey);
        },
        initializeVoicePresets: voicePresets.initialize,
        listVoicePresets: voicePresets.snapshot,
        getVoiceConnection: voicePresets.connection,
        saveVoicePreset: voicePresets.save,
        selectVoicePreset: voicePresets.select,
        deleteVoicePreset: voicePresets.delete,
        updateVoicePresetSettings: voicePresets.updateSettings,
        async listVoiceEntries() {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            return Object.freeze(library.entries.map((entry) => Object.freeze({ ...entry })));
        },
        async saveVoiceEntry(input = {}) {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const entry = normalizeQQVoiceEntry(input);
            if (!entry) throw resourceError('voice_entry_invalid', '音色 ID 不能为空');
            const requestedId = String(input?.entryId ?? '').trim();
            const index = requestedId ? library.entries.findIndex((item) => item.entryId === requestedId) : -1;
            if (requestedId && index === -1) throw resourceError('voice_entry_not_found', '音色不存在');
            const duplicate = library.entries.findIndex((item) => item.voiceId === entry.voiceId && item.entryId !== requestedId);
            if (duplicate !== -1) {
                if (requestedId) throw resourceError('voice_entry_duplicate', '仓库中已有这个音色 ID');
                library.entries[duplicate] = { ...library.entries[duplicate], name: entry.name, category: entry.category, note: entry.note };
                await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, library);
                return Object.freeze({ ...library.entries[duplicate] });
            }
            if (index === -1) library.entries.push(entry);
            else library.entries[index] = { ...entry, entryId: library.entries[index].entryId };
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, library);
            return Object.freeze({ ...(index === -1 ? entry : library.entries[index]) });
        },
        async deleteVoiceEntry(entryId) {
            const id = String(entryId ?? '').trim();
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const next = library.entries.filter((entry) => entry.entryId !== id);
            if (next.length === library.entries.length) return false;
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, { entries: next });
            return true;
        },
        async mergeVoiceEntries(entries) {
            const library = normalizeQQVoiceLibrary(await storage.get(QQ_VOICE_LIBRARY_STORAGE_KEY));
            const merged = mergeQQVoiceLibrary(library, entries);
            await storage.set(QQ_VOICE_LIBRARY_STORAGE_KEY, { entries: merged.entries });
            return Object.freeze({
                entries: Object.freeze(merged.entries.map((entry) => Object.freeze({ ...entry }))),
                added: merged.added,
                updated: merged.updated,
            });
        },
    });
}
