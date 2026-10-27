const IDENTITY_HEADERS = new Set(['row_id', 'id', '行号']);

function normalizeHeader(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
}

function normalizeRuleText(value) {
    return String(value ?? '');
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeReplacementRule(rule = {}) {
    const source = isPlainObject(rule) ? rule : {};
    return {
        id: normalizeRuleText(source.id),
        source: normalizeRuleText(source.source),
        target: normalizeRuleText(source.target),
    };
}

export function isIdentityHeader(header) {
    return IDENTITY_HEADERS.has(normalizeHeader(header));
}

export function validateReplacementRule(rule = {}, siblingRules = []) {
    const normalized = normalizeReplacementRule(rule);
    if (normalized.source.length === 0) {
        return { valid: false, code: 'source_empty' };
    }
    if (normalized.source === normalized.target) {
        return { valid: false, code: 'source_target_equal' };
    }
    if (normalized.target.includes(normalized.source)) {
        return { valid: false, code: 'target_contains_source' };
    }

    const duplicate = (Array.isArray(siblingRules) ? siblingRules : [])
        .some((candidate) => {
            const other = normalizeReplacementRule(candidate);
            if (normalized.id && other.id && normalized.id === other.id) return false;
            return other.source === normalized.source && other.source.length > 0;
        });
    if (duplicate) {
        return { valid: false, code: 'duplicate_source' };
    }

    return { valid: true };
}

function validateNormalizedRules(normalizedRules) {
    const sourceCounts = new Map();
    normalizedRules.forEach(({ id, source }) => {
        let group = sourceCounts.get(source);
        if (!group) {
            group = { total: 0, ids: new Map() };
            sourceCounts.set(source, group);
        }
        group.total += 1;
        group.ids.set(id, (group.ids.get(id) || 0) + 1);
    });

    const errors = [];
    normalizedRules.forEach((rule, index) => {
        const result = validateReplacementRule(rule);
        const group = sourceCounts.get(rule.source);
        // 非空的相同 ID 互相豁免；空 ID 只排除自身。
        const duplicate = rule.id ? group.total > group.ids.get(rule.id) : group.total > 1;
        const code = result.valid ? (duplicate ? 'duplicate_source' : '') : result.code;
        if (code) errors.push({ index, id: rule.id, code });
    });
    return errors;
}

export function validateReplacementRules(rules = []) {
    const normalizedRules = Array.isArray(rules) ? rules.map(normalizeReplacementRule) : [];
    return validateNormalizedRules(normalizedRules);
}

function getValidRules(rules = []) {
    const normalizedRules = Array.isArray(rules) ? rules.map(normalizeReplacementRule) : [];
    const invalidIndexes = new Set(validateNormalizedRules(normalizedRules).map(error => error.index));
    return normalizedRules.filter((_, index) => !invalidIndexes.has(index));
}

function createTextRuleApplier(rules) {
    let validRules;
    return (value) => {
        if (typeof value !== 'string') return { value, changed: false };

        validRules ??= getValidRules(rules);
        let nextValue = value;
        validRules.forEach(({ source, target }) => {
            if (!nextValue.includes(source)) return;
            nextValue = nextValue.split(source).join(target);
        });

        return { value: nextValue, changed: nextValue !== value };
    };
}

export function applyLiteralRulesToText(value, rules = []) {
    return createTextRuleApplier(rules)(value);
}

function applyRulesToRow(row, isIdentityColumn, applyToText) {
    const nextRow = Array.isArray(row) ? [...row] : [];
    let changedCellCount = 0;

    nextRow.forEach((value, columnIndex) => {
        if (isIdentityColumn(columnIndex) || typeof value !== 'string') return;
        const result = applyToText(value);
        if (!result.changed) return;
        nextRow[columnIndex] = result.value;
        changedCellCount += 1;
    });

    return { row: nextRow, changedCellCount };
}

export function applyLiteralRulesToRow(row, headers = [], rules = []) {
    return applyRulesToRow(row, columnIndex => isIdentityHeader(headers[columnIndex]), createTextRuleApplier(rules));
}

export function applyLiteralRulesToTableContent(content, rules = []) {
    if (!Array.isArray(content) || !Array.isArray(content[0])) {
        return { content: Array.isArray(content) ? content.map(row => Array.isArray(row) ? [...row] : row) : [], changedCellCount: 0 };
    }

    const headers = [...content[0]];
    const identityColumns = [];
    const isIdentityColumn = columnIndex => (identityColumns[columnIndex] ??= isIdentityHeader(headers[columnIndex]));
    const applyToText = createTextRuleApplier(rules);
    let changedCellCount = 0;
    const rows = content.slice(1).map((row) => {
        const result = applyRulesToRow(row, isIdentityColumn, applyToText);
        changedCellCount += result.changedCellCount;
        return result.row;
    });

    return { content: [headers, ...rows], changedCellCount };
}
