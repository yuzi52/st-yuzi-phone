import { getPhoneSettings, savePhoneSetting } from '../settings.js';
import {
    BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC,
    BEAUTIFY_SOURCE_MODE_BUILTIN,
    BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC,
    BEAUTIFY_SOURCE_MODE_USER,
    PHONE_TEMPLATE_TYPE_GENERIC,
} from './constants.js';
import { normalizeString, sanitizeId } from './core.js';
import { normalizeTemplate, normalizeTemplateType } from './normalize.js';
import { createBeautifyUserTemplateWriteDisabledResult } from './policy.js';
import {
    getCachedAllPhoneBeautifyTemplates,
    getCachedBeautifyTemplateSourceRuntime,
    getCachedBuiltinPhoneBeautifyTemplates,
    getCachedPhoneBeautifyTemplatesByType,
    getCachedPhoneBeautifyTemplateStore,
    invalidatePhoneBeautifyTemplateCache,
} from './cache.js';

const ALLOWED_TEMPLATE_TYPES = new Set([PHONE_TEMPLATE_TYPE_GENERIC]);
const ALLOWED_RENDERER_KEYS = new Set(['generic_table']);

function buildSourceRuntimeCacheKey(templateType, options = {}) {
    const safeType = normalizeTemplateType(templateType, '');
    const settings = getPhoneSettings() || {};
    return JSON.stringify([
        safeType,
        options.enabledOnly === true ? 'enabled' : 'all',
        String(settings[BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC] || ''),
        String(settings[BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC] || ''),
    ]);
}

function normalizeBeautifySourceMode(rawMode, fallback = BEAUTIFY_SOURCE_MODE_BUILTIN) {
    const mode = normalizeString(rawMode, 24).toLowerCase();
    if (mode === BEAUTIFY_SOURCE_MODE_BUILTIN || mode === BEAUTIFY_SOURCE_MODE_USER) return mode;
    return fallback === BEAUTIFY_SOURCE_MODE_USER ? BEAUTIFY_SOURCE_MODE_USER : BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function normalizeSourceModeForTemplateType(templateType, sourceMode) {
    return normalizeTemplateType(templateType, '') === PHONE_TEMPLATE_TYPE_GENERIC
        ? normalizeBeautifySourceMode(sourceMode)
        : BEAUTIFY_SOURCE_MODE_BUILTIN;
}

function saveBeautifyTemplateSettingAndInvalidate(settingKey, value) {
    savePhoneSetting(settingKey, value);
    invalidatePhoneBeautifyTemplateCache();
}

function getGenericActiveTemplateIdRaw() {
    return sanitizeId(getPhoneSettings()?.[BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC], '');
}

function getDefaultGenericTemplateId() {
    const templates = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: false,
        enabledOnly: true,
    }).filter(template => template?.render?.rendererKey === 'generic_table');
    return sanitizeId(templates[0]?.id, '');
}

function ensureValidGenericActiveTemplateId(rawTemplateId) {
    const id = sanitizeId(rawTemplateId, '');
    if (!id) return '';

    const exists = getPhoneBeautifyTemplatesByType(PHONE_TEMPLATE_TYPE_GENERIC, {
        includeBuiltin: true,
        includeUser: true,
        enabledOnly: true,
    }).some(template => template.id === id && template?.render?.rendererKey === 'generic_table');
    return exists ? id : '';
}

function getEffectiveTemplatesBySourceMode(templates, sourceMode) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const mode = normalizeBeautifySourceMode(sourceMode);
    const builtin = safeTemplates.filter(template => template?.source === 'builtin');
    const user = safeTemplates.filter(template => template?.source !== 'builtin');

    if (mode === BEAUTIFY_SOURCE_MODE_USER && user.length > 0) {
        return { templates: user, fallbackApplied: false, mode: BEAUTIFY_SOURCE_MODE_USER };
    }
    if (mode === BEAUTIFY_SOURCE_MODE_USER) {
        return { templates: builtin, fallbackApplied: true, mode: BEAUTIFY_SOURCE_MODE_BUILTIN };
    }
    return { templates: builtin, fallbackApplied: false, mode: BEAUTIFY_SOURCE_MODE_BUILTIN };
}

export function getBeautifyTemplateSourceMode(templateType) {
    if (normalizeTemplateType(templateType, '') !== PHONE_TEMPLATE_TYPE_GENERIC) {
        return BEAUTIFY_SOURCE_MODE_BUILTIN;
    }
    return normalizeSourceModeForTemplateType(
        templateType,
        getPhoneSettings()?.[BEAUTIFY_SOURCE_MODE_SETTING_KEY_GENERIC],
    );
}

export function setBeautifyTemplateSourceMode(templateType, sourceMode) {
    void templateType;
    void sourceMode;
    return createBeautifyUserTemplateWriteDisabledResult();
}

export function getActiveBeautifyTemplateIdByType(templateType, options = {}) {
    if (normalizeTemplateType(templateType, '') !== PHONE_TEMPLATE_TYPE_GENERIC) return '';
    const valid = ensureValidGenericActiveTemplateId(getGenericActiveTemplateIdRaw());
    return valid || (options.withFallback === false ? '' : getDefaultGenericTemplateId());
}

export function repairActiveBeautifyTemplateSettings() {
    const rawGenericId = getGenericActiveTemplateIdRaw();
    const validGenericId = ensureValidGenericActiveTemplateId(rawGenericId);
    const genericActiveTemplateId = validGenericId || getDefaultGenericTemplateId();
    const genericUpdated = rawGenericId !== genericActiveTemplateId;

    if (genericUpdated) {
        saveBeautifyTemplateSettingAndInvalidate(
            BEAUTIFY_ACTIVE_TEMPLATE_ID_SETTING_KEY_GENERIC,
            genericActiveTemplateId,
        );
    }

    return { genericUpdated, genericActiveTemplateId };
}

export function setActiveBeautifyTemplateIdByType(templateType, templateId) {
    void templateType;
    void templateId;
    return createBeautifyUserTemplateWriteDisabledResult();
}

export function getBeautifyTemplateSourceModeRuntime(templateType, options = {}) {
    const safeType = normalizeTemplateType(templateType, '');
    if (safeType !== PHONE_TEMPLATE_TYPE_GENERIC) {
        return {
            preferredMode: BEAUTIFY_SOURCE_MODE_BUILTIN,
            effectiveMode: BEAUTIFY_SOURCE_MODE_BUILTIN,
            fallbackApplied: false,
            hasUserTemplates: false,
            templates: [],
        };
    }

    return getCachedBeautifyTemplateSourceRuntime(
        buildSourceRuntimeCacheKey(safeType, options),
        () => {
            const mode = getBeautifyTemplateSourceMode(safeType);
            const templates = getPhoneBeautifyTemplatesByType(safeType, {
                includeBuiltin: true,
                includeUser: true,
                enabledOnly: options.enabledOnly === true,
            });
            const activeTemplateId = getActiveBeautifyTemplateIdByType(safeType, {
                withFallback: true,
                persist: false,
            });
            const selected = activeTemplateId
                ? templates.filter(template => template.id === activeTemplateId && template?.render?.rendererKey === 'generic_table')
                : [];

            if (selected.length > 0) {
                return {
                    preferredMode: mode,
                    effectiveMode: 'active_template',
                    fallbackApplied: false,
                    hasUserTemplates: templates.some(template => template?.source !== 'builtin'),
                    templates: selected,
                };
            }

            const filtered = getEffectiveTemplatesBySourceMode(templates, mode);
            return {
                preferredMode: mode,
                effectiveMode: filtered.mode,
                fallbackApplied: filtered.fallbackApplied,
                hasUserTemplates: templates.some(template => template?.source !== 'builtin'),
                templates: filtered.templates,
            };
        },
    );
}

export function getBuiltinPhoneBeautifyTemplates() {
    return getCachedBuiltinPhoneBeautifyTemplates();
}

export function getPhoneBeautifyTemplateStore() {
    return getCachedPhoneBeautifyTemplateStore();
}

export function getAllPhoneBeautifyTemplates(options = {}) {
    return getCachedAllPhoneBeautifyTemplates(options);
}

export function getPhoneBeautifyTemplatesByType(templateType, options = {}) {
    return getCachedPhoneBeautifyTemplatesByType(templateType, options);
}

export function validatePhoneBeautifyTemplate(rawTemplate) {
    const errors = [];
    const warnings = [];
    const normalized = normalizeTemplate(rawTemplate, { sourceFallback: 'user' });

    if (!normalized) {
        errors.push('模板不是有效的通用表格模板');
        return { ok: false, errors, warnings, template: null };
    }
    if (!normalized.id) errors.push('模板缺少 id');
    if (!normalized.name) errors.push('模板缺少 name');
    if (!ALLOWED_TEMPLATE_TYPES.has(normalized.templateType)) {
        errors.push(`不支持的 templateType：${normalized.templateType}`);
    }
    if (!ALLOWED_RENDERER_KEYS.has(normalized.render?.rendererKey)) {
        errors.push(`不支持的 rendererKey：${normalized.render?.rendererKey || ''}`);
    }
    if ((normalized.matcher?.requiredHeaders || []).length === 0
        && (normalized.matcher?.tableNameExact || []).length === 0
        && (normalized.matcher?.tableNameIncludes || []).length === 0) {
        warnings.push('模板未配置明显匹配特征，默认模板会作为兜底展示');
    }

    return { ok: errors.length === 0, errors, warnings, template: normalized };
}

export function savePhoneBeautifyUserTemplate(rawTemplate, options = {}) {
    void rawTemplate;
    void options;
    return createBeautifyUserTemplateWriteDisabledResult({ warnings: [], errors: [], template: null });
}

export function deletePhoneBeautifyUserTemplate(templateId) {
    void templateId;
    return createBeautifyUserTemplateWriteDisabledResult();
}
