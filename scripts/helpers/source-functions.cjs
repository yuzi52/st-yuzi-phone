const assert = require('node:assert/strict');

function createSyntaxScanner() {
    return {
        quote: null,
        escaped: false,
        lineComment: false,
        blockComment: false,
    };
}

function advanceSyntaxScanner(state, source, index) {
    const char = source[index];
    const next = source[index + 1];

    if (state.lineComment) {
        if (char === '\n') state.lineComment = false;
        return true;
    }
    if (state.blockComment) {
        if (char === '*' && next === '/') {
            state.blockComment = false;
            return 2;
        }
        return true;
    }
    if (state.quote) {
        if (state.escaped) {
            state.escaped = false;
            return true;
        }
        if (char === '\\') {
            state.escaped = true;
            return true;
        }
        if (char === state.quote) {
            state.quote = null;
        }
        return true;
    }
    if (char === '/' && next === '/') {
        state.lineComment = true;
        return 2;
    }
    if (char === '/' && next === '*') {
        state.blockComment = true;
        return 2;
    }
    if (char === '\'' || char === '"' || char === '`') {
        state.quote = char;
        return true;
    }
    return false;
}

function findFunctionBodyStart(source, signatureIndex, name) {
    const paramsStart = source.indexOf('(', signatureIndex);
    assert(paramsStart !== -1, `${name} 缺少参数列表`);

    const state = createSyntaxScanner();
    let parenDepth = 0;
    let index = paramsStart;
    for (; index < source.length; index += 1) {
        const skipped = advanceSyntaxScanner(state, source, index);
        if (skipped === 2) {
            index += 1;
            continue;
        }
        if (skipped) continue;

        const char = source[index];
        if (char === '(') parenDepth += 1;
        if (char === ')') {
            parenDepth -= 1;
            if (parenDepth === 0) break;
        }
    }

    assert(parenDepth === 0, `${name} 参数列表括号不平衡`);

    for (index += 1; index < source.length; index += 1) {
        const char = source[index];
        if (/\s/.test(char)) continue;
        assert(char === '{', `${name} 参数列表后未找到函数体`);
        return index;
    }

    throw new Error(`${name} 缺少函数体`);
}

function findFunctionBodyEnd(source, bodyStart, name) {
    const state = createSyntaxScanner();
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        const skipped = advanceSyntaxScanner(state, source, index);
        if (skipped === 2) {
            index += 1;
            continue;
        }
        if (skipped) continue;

        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index + 1;
        }
    }

    throw new Error(`${name} 函数体括号不平衡`);
}

function extractFunctionBody(source, name, pattern) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fallbackPattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapedName}\\s*\\(`);
    const match = pattern?.exec(source) || fallbackPattern.exec(source);
    assert(match, `未找到函数 ${name}`);

    const bodyStart = findFunctionBodyStart(source, match.index, name);
    const bodyEnd = findFunctionBodyEnd(source, bodyStart, name);
    return source.slice(match.index, bodyEnd);
}

module.exports = { extractFunctionBody };
