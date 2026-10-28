import { t } from '../i18n/index.js';
import {
    getPhoneSettings as getStoredPhoneSettings,
    savePhoneSetting as persistPhoneSetting,
    normalizeImageGenerationSettings,
} from '../settings.js';
import { createImageGenerationOrchestrator } from './orchestration.js';

function cloneValue(value) {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function emptyMappingModel() {
    return {
        tables: [],
        resolvedMappings: [],
    };
}

function text(value) {
    return String(value ?? '').trim();
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function tableDisplaySourceRows(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.tables)) return value.tables;

    const bySheetKey = value.bySheetKey;
    const entries = bySheetKey instanceof Map
        ? [...bySheetKey.entries()]
        : bySheetKey && typeof bySheetKey === 'object'
            ? Object.entries(bySheetKey)
            : [];
    return entries.map(([sheetKey, sources]) => {
        const source = asArray(sources)[0] || {};
        return {
            sheetKey,
            tableName: text(source.tableName) || text(source.canvas?.tableName),
        };
    });
}

function normalizeTableDisplaySources(value, config) {
    const enabledBySheetKey = config?.tableDisplayEnabledBySheetKey || {};
    const seen = new Set();
    return tableDisplaySourceRows(value).reduce((sources, source) => {
        const sheetKey = text(source?.sheetKey);
        const tableName = text(source?.tableName);
        if (!sheetKey || !tableName || seen.has(sheetKey)) return sources;
        seen.add(sheetKey);
        sources.push({
            sheetKey,
            tableName,
            enabled: enabledBySheetKey[sheetKey] !== false,
        });
        return sources;
    }, []);
}

function cloneSharedResources(result) {
    const source = result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : {};
    return {
        status: text(source.status) || 'ready',
        ...(source.error ? { error: text(source.error?.message || source.error) } : {}),
        apiPresets: cloneValue(asArray(source.apiPresets)),
        imageGenerationPresets: cloneValue(asArray(source.imageGenerationPresets)),
    };
}

function createDefaultTestFilename() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return `settings-test-${globalThis.crypto.randomUUID()}`;
    }
    return `settings-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createImageGenerationSettingsService(options = {}) {
    const getPhoneSettings = typeof options.getPhoneSettings === 'function'
        ? options.getPhoneSettings
        : getStoredPhoneSettings;
    const savePhoneSetting = typeof options.savePhoneSetting === 'function'
        ? options.savePhoneSetting
        : persistPhoneSetting;
    const tableReader = typeof options.tableReader === 'function'
        ? options.tableReader
        : async () => ({});
    const getTableDisplaySources = typeof options.getTableDisplaySources === 'function'
        ? options.getTableDisplaySources
        : async () => [];
    const characterMapping = options.characterMapping
        && typeof options.characterMapping === 'object'
        ? options.characterMapping
        : {};
    const imageGenerationService = options.imageGenerationService
        && typeof options.imageGenerationService === 'object'
        ? options.imageGenerationService
        : {};
    const qqV2PresetService = options.qqV2PresetService
        && typeof options.qqV2PresetService === 'object'
        ? options.qqV2PresetService
        : null;
    const now = typeof options.now === 'function' ? options.now : Date.now;

    function readConfig(override) {
        if (override && typeof override === 'object' && !Array.isArray(override)) {
            return normalizeImageGenerationSettings(override);
        }
        const settings = getPhoneSettings();
        return normalizeImageGenerationSettings(settings?.imageGeneration);
    }

    async function readSharedResources() {
        if (typeof qqV2PresetService?.readSharedResources !== 'function') return null;
        try {
            const result = await qqV2PresetService.readSharedResources();
            if (result?.ok === false) {
                return {
                    status: text(result.status) || 'failed',
                    error: text(result.error?.message || result.error) || '生图预设读取失败',
                    apiPresets: [],
                    imageGenerationPresets: [],
                };
            }
            return cloneSharedResources(result);
        } catch (error) {
            return {
                status: 'failed',
                error: text(error?.message) || '生图预设读取失败',
                apiPresets: [],
                imageGenerationPresets: [],
            };
        }
    }

    async function loadViewModel(input = {}) {
        const config = readConfig(input?.config);
        const shouldReadSharedResources = input.includeSharedResources === true
            || !Object.prototype.hasOwnProperty.call(input, 'testInput');
        const [rawData, sharedResources] = await Promise.all([
            Promise.resolve().then(() => tableReader()).catch(() => ({})),
            shouldReadSharedResources ? readSharedResources() : Promise.resolve(null),
        ]);
        const model = typeof characterMapping.buildCharacterMappingModel === 'function'
            ? characterMapping.buildCharacterMappingModel(rawData, config.roleMappings)
            : emptyMappingModel();
        let tableDisplaySources = [];
        try {
            tableDisplaySources = normalizeTableDisplaySources(
                await getTableDisplaySources({ rawData }),
                config,
            );
        } catch {
            tableDisplaySources = [];
        }
        const viewModel = {
            config: normalizeImageGenerationSettings(config),
            tables: cloneValue(Array.isArray(model?.tables) ? model.tables : []),
            resolvedMappings: cloneValue(
                Array.isArray(model?.resolvedMappings) ? model.resolvedMappings : [],
            ),
            tableDisplaySources: cloneValue(tableDisplaySources),
        };
        if (sharedResources) viewModel.sharedResources = sharedResources;
        if (input?.testInput && typeof input.testInput === 'object') {
            const names = text(input.testInput.names ?? input.testInput.explicitNames);
            const description = text(input.testInput.description);
            const composition = typeof characterMapping.composeCharacterImagePrompt === 'function'
                ? characterMapping.composeCharacterImagePrompt({
                    rawData,
                    mappings: config.roleMappings,
                    explicitNames: names,
                    description,
                    scanDescription: true,
                })
                : null;
            viewModel.testInput = {
                names,
                description,
                finalPrompt: text(composition?.prompt),
            };
        }
        return viewModel;
    }

    async function saveConfig(nextConfig) {
        const normalized = normalizeImageGenerationSettings(nextConfig);
        try {
            const saved = await savePhoneSetting(
                'imageGeneration',
                normalizeImageGenerationSettings(normalized),
            );
            if (saved === false) {
                return {
                    ok: false,
                    status: 'failed',
                    config: normalizeImageGenerationSettings(normalized),
                };
            }
            return {
                ok: true,
                status: 'saved',
                config: normalizeImageGenerationSettings(normalized),
            };
        } catch {
            return {
                ok: false,
                status: 'failed',
                config: normalizeImageGenerationSettings(normalized),
            };
        }
    }

    async function testGenerate(input = {}) {
        if (
            typeof characterMapping.composeCharacterImagePrompt !== 'function'
            || typeof imageGenerationService.generateAndStore !== 'function'
        ) {
            return {
                ok: false,
                status: 'unavailable',
                error: { code: 'image-generation-unavailable' },
            };
        }

        const config = readConfig(input?.config);
        if (!config.enabled) {
            return {
                ok: false,
                status: 'disabled',
                error: { code: 'image-generation-disabled', message: t("请先选择生图接口。") },
            };
        }
        const requestConfig = normalizeImageGenerationSettings({
            ...config,
            timeoutMs: input.timeoutMs ?? config.timeoutMs,
        });
        let rawData;
        try {
            rawData = await tableReader();
        } catch {
            rawData = {};
        }
        const composition = characterMapping.composeCharacterImagePrompt({
            rawData,
            mappings: config.roleMappings,
            explicitNames: text(input.explicitNames ?? input.names),
            description: text(input.description),
            scanDescription: true,
        }) || {};
        const naturalPrompt = text(composition.prompt);
        const shouldTranslate = config.promptTranslationEnabled
            && text(config.promptTranslationApiPresetId)
            && text(config.promptTranslationPresetId)
            && typeof qqV2PresetService?.translateImagePrompt === 'function';
        const orchestrator = createImageGenerationOrchestrator({
            // Test the selected draft provider without rereading saved settings mid-request.
            generateAndStore: request => imageGenerationService.generateAndStore({
                ...request,
                provider: requestConfig.provider,
                folder: text(input.folder) || 'yuzi-phone-generated',
                filename: text(input.filename) || createDefaultTestFilename(),
            }),
            translateImagePrompt: shouldTranslate
                ? request => qqV2PresetService.translateImagePrompt(request)
                : null,
            now,
        });
        const { naturalPrompt: _naturalPrompt, ...generationResult } = await orchestrator.generate({
            naturalPrompt,
            timeoutMs: requestConfig.timeoutMs,
            negativePrompt: input.negativePrompt,
            change: input.change,
            ...(shouldTranslate ? {
                translation: {
                    apiPresetId: config.promptTranslationApiPresetId,
                    imageGenerationPresetId: config.promptTranslationPresetId,
                },
            } : {}),
            filterSettings: config,
            signal: input.signal,
        });

        return {
            ...cloneValue(generationResult),
            prompt: naturalPrompt,
            characters: cloneValue(Array.isArray(composition.characters) ? composition.characters : []),
            unmatchedNames: cloneValue(
                Array.isArray(composition.unmatchedNames) ? composition.unmatchedNames : [],
            ),
            mappingDiagnostics: cloneValue(
                Array.isArray(composition.mappingDiagnostics) ? composition.mappingDiagnostics : [],
            ),
        };
    }

    return Object.freeze({
        loadViewModel,
        saveConfig,
        testGenerate,
    });
}
