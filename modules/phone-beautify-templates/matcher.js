import {
    DEFAULT_GENERIC_MIN_SCORE,
    PHONE_TEMPLATE_TYPE_GENERIC,
} from './constants.js';
import {
    clampNumber,
    deepClone,
    normalizeString,
    sanitizeId,
} from './core.js';
import {
    normalizeHeadersSet,
    scoreTemplateMatcher,
} from './matcher-helpers.js';
import {
    getCachedPhoneBeautifyTemplateById,
    getCachedPhoneBeautifyTemplateStore,
} from './cache.js';
import {
    getActiveBeautifyTemplateIdByType,
    getBeautifyTemplateSourceModeRuntime,
} from './repository.js';
import { createBeautifyUserTemplateWriteDisabledResult } from './policy.js';

function getTemplateById(templateId) {
    const safeId = sanitizeId(templateId, '');
    if (!safeId) return null;
    return getCachedPhoneBeautifyTemplateById(safeId, { includeDisabled: true });
}

export function detectGenericTemplateForTable({ sheetKey, tableName, headers = [] } = /** @type {any} */ ({}) ) {
    const safeSheetKey = normalizeString(sheetKey, 80);
    if (!safeSheetKey) return null;

    const safeTableName = normalizeString(tableName, 80);

    const activeTemplateId = getActiveBeautifyTemplateIdByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        withFallback: true,
        persist: false,
    });
    const sourceRuntime = getBeautifyTemplateSourceModeRuntime(PHONE_TEMPLATE_TYPE_GENERIC, {
        enabledOnly: true,
    });
    const genericTemplates = sourceRuntime.templates;

    if (genericTemplates.length <= 0) return null;

    const store = getCachedPhoneBeautifyTemplateStore();

    const boundTemplateId = sanitizeId(store.bindings?.[safeSheetKey], '');
    if (boundTemplateId) {
        const boundTemplate = getTemplateById(boundTemplateId);
        if (boundTemplate?.enabled !== false
            && boundTemplate?.templateType === PHONE_TEMPLATE_TYPE_GENERIC
            && boundTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(boundTemplate),
                score: 999,
                reason: 'manual_binding',
            };
        }
    }

    const templateMap = new Map(genericTemplates.map(t => [t.id, t]));
    if (activeTemplateId && templateMap.has(activeTemplateId)) {
        const activeTemplate = templateMap.get(activeTemplateId);
        if (activeTemplate?.render?.rendererKey === 'generic_table') {
            return {
                sheetKey: safeSheetKey,
                tableName: safeTableName,
                template: deepClone(activeTemplate),
                score: 999,
                threshold: 0,
                reason: 'active_template',
                sourceMode: sourceRuntime.effectiveMode,
                sourceModePreferred: sourceRuntime.preferredMode,
                sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
            };
        }
    }

    const headerSet = normalizeHeadersSet(headers);
    const scored = [];

    genericTemplates.forEach((template) => {
        if (template?.render?.rendererKey !== 'generic_table') return;

        const score = scoreTemplateMatcher(template.matcher, safeTableName, headerSet);
        const threshold = clampNumber(
            template.matcher?.minScore,
            0,
            100,
            DEFAULT_GENERIC_MIN_SCORE,
        );

        if (score < threshold) return;

        scored.push({
            template,
            score,
            threshold,
            sourcePriority: template.source === 'user' ? 2 : 1,
            updatedAt: Number(template.meta?.updatedAt || 0),
        });
    });

    if (scored.length <= 0) return null;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sourcePriority !== a.sourcePriority) return b.sourcePriority - a.sourcePriority;
        return b.updatedAt - a.updatedAt;
    });

    const best = scored[0];
    return {
        sheetKey: safeSheetKey,
        tableName: safeTableName,
        template: deepClone(best.template),
        score: best.score,
        threshold: best.threshold,
        reason: sourceRuntime.fallbackApplied ? 'matcher_builtin_fallback' : 'matcher',
        sourceMode: sourceRuntime.effectiveMode,
        sourceModePreferred: sourceRuntime.preferredMode,
        sourceModeFallbackApplied: sourceRuntime.fallbackApplied,
    };
}

export function bindSheetToBeautifyTemplate(sheetKey, templateId) {
    void sheetKey;
    void templateId;
    return createBeautifyUserTemplateWriteDisabledResult();
}

export function clearSheetBeautifyBinding(sheetKey) {
    void sheetKey;
    return createBeautifyUserTemplateWriteDisabledResult();
}
