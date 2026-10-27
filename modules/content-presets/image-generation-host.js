import { createDefaultTableImageService } from '../image-generation/table-image-host.js';
import { getTableData } from '../phone-core/data-api.js';
import { resolveStableChatId } from '../integration/chat-identity.js';
import { getPhoneSettings, normalizeImageGenerationSettings, subscribePhoneSettingsUpdates } from '../settings.js';
import { buildTableNavigationCatalog } from '../table-navigation/catalog.js';
import { buildActiveContentPresetDisplayDirectory, contentPresetDisplayModelId } from './display-directory.js';
import { buildActiveContentPresetImageGenerationDirectory } from './image-generation-directory.js';
import { createContentPresetImageActions } from './image-actions.js';
import { getContentPresetIndexSnapshot } from './index-state.js';
import { listPresetRecords } from './repository.js';

function text(value) { return String(value ?? '').trim(); }
function asMap(value) { return value instanceof Map ? value : new Map(Object.entries(value || {})); }

function normalizeConfig(getSettings) {
    return normalizeImageGenerationSettings(getSettings()?.imageGeneration);
}

function tableDisplayEnabled(config, sheetKey) {
    const choices = config?.tableDisplayEnabledBySheetKey;
    return !choices || typeof choices !== 'object' || choices[sheetKey] !== false;
}

function pageBindingIsActive(index, source) {
    const binding = asMap(index?.pageByTable || index?.activeByTable).get(source.originSheetKey);
    return text(binding?.presetId) === text(source.presetId)
        && text(binding?.itemId) === text(source.itemId);
}

function displayBindingIsActive(index, rawData, source) {
    const directory = buildActiveContentPresetDisplayDirectory(rawData, asMap(index?.popupByTable));
    const modelId = text(source.modelId) || contentPresetDisplayModelId(source.presetId, source.displayId);
    const definition = directory.byModelId.get(modelId);
    return Boolean(definition
        && text(definition.presetId) === text(source.presetId)
        && text(definition.displayId) === text(source.displayId));
}


/**
 * Host composition for page and inline display image actions.
 *
 * It is the only place where image configuration, QQ's shared prompt path,
 * stable ownership persistence, currently applied bindings and the author
 * action layer meet. Renderers merely ask it for actions.
 */
export function createContentPresetImageGenerationHost(options = {}) {
    const getSettings = options.getPhoneSettings || getPhoneSettings;
    const getIndex = options.getContentPresetIndexSnapshot || getContentPresetIndexSnapshot;
    const getRawData = options.getRawData || getTableData;
    const getChatScope = options.getChatScope || resolveStableChatId;
    const listRecords = options.listPresetRecords || listPresetRecords;
    const subscribeSettings = options.subscribeSettings || subscribePhoneSettingsUpdates;
    const imageGenerationService = options.imageGenerationService || createDefaultTableImageService({
        ...options,
        getPhoneSettings: getSettings,
    });

    const isImageGenerationEnabled = async () => normalizeConfig(getSettings)?.enabled === true;
    const isTableEnabled = async ({ sheetKey }) => tableDisplayEnabled(normalizeConfig(getSettings), sheetKey);
    const isSourceActive = async ({ source }) => {
        const index = getIndex?.() || {};
        return source?.kind === 'page'
            ? pageBindingIsActive(index, source)
            : source?.kind === 'display'
                ? displayBindingIsActive(index, getRawData?.() || {}, source)
                : false;
    };
    const makeActions = ({ declaration, source, isCurrent }) => createContentPresetImageActions({
        declaration,
        source,
        getRawData,
        getChatScope,
        isSourceActive,
        isCurrent,
        isImageGenerationEnabled,
        isTableEnabled,
        subscribeSettings,
        imageGenerationService,
    });

    return Object.freeze({
        createPageActions({ item, presetId, itemId, sheetKey, isCurrent } = {}) {
            if (!item?.imageGeneration) return Object.freeze({});
            return makeActions({
                declaration: item,
                source: Object.freeze({
                    kind: 'page',
                    presetId: text(presetId),
                    itemId: text(itemId),
                    originSheetKey: text(sheetKey),
                }),
                isCurrent,
            });
        },
        createInlineDisplayActions({ display, presetId, displayId, modelId, isCurrent } = {}) {
            if (display?.kind !== 'inline' || !display?.imageGeneration) return Object.freeze({});
            return makeActions({
                declaration: display,
                source: Object.freeze({
                    kind: 'display',
                    presetId: text(presetId),
                    displayId: text(displayId),
                    modelId: text(modelId),
                }),
                isCurrent,
            });
        },
        async getTableDisplaySources({ rawData = getRawData?.() || {} } = {}) {
            let records;
            try {
                records = await listRecords();
            } catch {
                return Object.freeze([]);
            }
            const index = getIndex?.() || {};
            const directory = buildActiveContentPresetImageGenerationDirectory(
                rawData,
                records,
                asMap(index.pageByTable || index.activeByTable),
                asMap(index.popupByTable),
            );
            if (!directory.bySheetKey.size) return Object.freeze([]);
            const tableNames = new Map(buildTableNavigationCatalog(rawData).map(entry => [entry.sheetKey, entry.tableName]));
            return Object.freeze([...directory.bySheetKey.entries()].map(([sheetKey, registrations]) => Object.freeze({
                sheetKey,
                tableName: tableNames.get(sheetKey) || sheetKey,
                usageCount: registrations.length,
            })));
        },
    });
}

export const contentPresetImageGenerationHost = createContentPresetImageGenerationHost();
