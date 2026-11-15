import { t } from '../i18n/index.js';
import { createImageFileBridge } from '../integration/image-file-bridge.js';
import { getPhoneSettings, normalizeImageGenerationSettings } from '../settings.js';
import { createImageGenerationOrchestrator } from './orchestration.js';
import { sharedPhoneImageGenerationRuntime } from './runtime.js';
import { createStableImageOwnershipRepository } from './stable-image-ownership-repository.js';
import { createStableImageOwnershipService } from './stable-image-ownership.js';
import { createTableDisplayImageGenerationService } from './table-display-image-generation-service.js';
import { getTableImageSessionSignal } from './table-image-session.js';
import { getQQV2Facade } from '../qq-v2/runtime/default-runtime.js';

const OWNERSHIP_DB_NAME = 'yuzi-phone-table-image-ownership';
const OWNERSHIP_DB_VERSION = 1;
const OWNERSHIP_STORE_NAME = 'ownership';

function text(value) {
    return String(value ?? '').trim();
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error(t("图片归属 IndexedDB 请求失败")));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error(t("图片归属 IndexedDB 事务失败")));
        transaction.onabort = () => reject(transaction.error || new Error(t("图片归属 IndexedDB 事务中止")));
    });
}

/**
 * 小而封闭的浏览器持久层；领域 ownership service 继续只依赖 read/write seam。
 * 无 IndexedDB 的 Node 环境仅在测试注入替身时使用，不把内存回退伪装成持久化。
 */
function createIndexedDbOwnershipStore(indexedDb = globalThis.indexedDB) {
    let databasePromise = null;
    const openDatabase = () => {
        if (databasePromise) return databasePromise;
        if (!indexedDb?.open) return Promise.reject(new Error(t("浏览器不支持图片归属 IndexedDB")));
        databasePromise = new Promise((resolve, reject) => {
            let request;
            try {
                request = indexedDb.open(OWNERSHIP_DB_NAME, OWNERSHIP_DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }
            request.onerror = () => reject(request.error || new Error(t("打开图片归属 IndexedDB 失败")));
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(OWNERSHIP_STORE_NAME)) {
                    database.createObjectStore(OWNERSHIP_STORE_NAME, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
        return databasePromise;
    };

    return Object.freeze({
        async read(key) {
            const database = await openDatabase();
            const transaction = database.transaction(OWNERSHIP_STORE_NAME, 'readonly');
            const result = await requestResult(transaction.objectStore(OWNERSHIP_STORE_NAME).get(key));
            await transactionDone(transaction);
            return result || null;
        },
        async write(record) {
            const database = await openDatabase();
            const transaction = database.transaction(OWNERSHIP_STORE_NAME, 'readwrite');
            transaction.objectStore(OWNERSHIP_STORE_NAME).put(record);
            await transactionDone(transaction);
        },
    });
}

function normalizeConfig(getSettings) {
    return normalizeImageGenerationSettings(getSettings()?.imageGeneration);
}

function tableEnabled(config, sheetKey) {
    return config?.enabled === true && tableDisplayEnabled(config, sheetKey);
}

function tableDisplayEnabled(config, sheetKey) {
    const choices = config?.tableDisplayEnabledBySheetKey;
    return !choices || typeof choices !== 'object' || choices[sheetKey] !== false;
}

function composeDescription(promptValues = {}) {
    return Object.entries(promptValues)
        .map(([field, value]) => {
            const rendered = text(value);
            return rendered ? `${text(field)}：${rendered}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

export function createDefaultTableImageService(options) {
    const getSettings = options.getPhoneSettings || getPhoneSettings;
    const imageRuntime = options.imageGenerationRuntime || sharedPhoneImageGenerationRuntime;
    const imageFiles = options.imageFiles || createImageFileBridge();
    const getFacade = options.getQQV2Facade || getQQV2Facade;
    const store = options.ownershipStore || createIndexedDbOwnershipStore(options.indexedDB);
    const repository = options.ownershipRepository || createStableImageOwnershipRepository({ store });
    const ownershipService = options.ownershipService || createStableImageOwnershipService({
        store: repository,
        now: options.now,
    });
    const translateImagePrompt = async input => {
        const facade = getFacade?.();
        if (typeof facade?.intent?.translateImagePrompt !== 'function') {
            return {
                ok: false,
                status: 'unavailable',
                error: { code: 'image-prompt-translation-unavailable', message: t("QQ 提示词转换服务不可用") },
            };
        }
        return facade.intent.translateImagePrompt(input);
    };
    const sharedOrchestrator = createImageGenerationOrchestrator({
        generateAndStore: imageRuntime?.generateAndStore?.bind(imageRuntime),
        translateImagePrompt,
        now: options.now,
    });
    const orchestrator = Object.freeze({
        async generate(input = {}) {
            const config = normalizeConfig(getSettings);
            return sharedOrchestrator.generate({
                ...input,
                timeoutMs: config.timeoutMs,
                ...(config.promptTranslationEnabled
                    ? {
                        translation: {
                            apiPresetId: config.promptTranslationApiPresetId,
                            imageGenerationPresetId: config.promptTranslationPresetId,
                        },
                    }
                    : {}),
                filterSettings: config,
            });
        },
    });

    return createTableDisplayImageGenerationService({
        getSessionSignal: options.getSessionSignal || getTableImageSessionSignal,
        async storeImage(image) {
            if (!(image instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type) || image.size === 0 || image.size > 8 * 1024 * 1024) {
                return { ok: false, status: 'invalid-input', reason: 'invalid-image' };
            }
            const bytes = new Uint8Array(await image.arrayBuffer());
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            return imageFiles.save({ imageData: btoa(binary), format: image.type.slice(6), folder: 'yuzi-phone-generated' });
        },
        ownershipService,
        orchestrator,
        isTableEnabled: options.isTableEnabled || (async ({ tableName }) => tableEnabled(normalizeConfig(getSettings), text(tableName))),
        isCurrentTarget: async ({ target, requestContext }) => {
            if (typeof requestContext?.isStillCurrent !== 'function') return false;
            return requestContext.isStillCurrent(target);
        },
        composePrompt: options.composePrompt || (async ({ promptValues, canvas }) => {
            const description = [composeDescription(promptValues), text(canvas?.promptSuffix)].filter(Boolean).join('\n');
            if (!description || typeof imageRuntime?.composeCharacterImagePrompt !== 'function') return '';
            const composition = await imageRuntime.composeCharacterImagePrompt({
                explicitNames: [],
                description,
                scanDescription: true,
            });
            return text(typeof composition === 'string' ? composition : composition?.prompt);
        }),
    });
}
