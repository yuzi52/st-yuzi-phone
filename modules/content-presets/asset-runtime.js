import { t } from '../i18n/index.js';
import { resolvePackageReference, stripReferenceSuffix } from './paths.js';

function decodeCssEscapes(value) {
    const source = String(value ?? '');
    let output = '';
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char !== '\\') { output += char; continue; }
        if (index + 1 >= source.length) { output += '\uFFFD'; continue; }
        const next = source[index + 1];
        if (next === '\n' || next === '\f') { index += 1; continue; }
        if (next === '\r') { index += source[index + 2] === '\n' ? 2 : 1; continue; }
        const hexMatch = source.slice(index + 1).match(/^[\da-f]{1,6}/i);
        if (hexMatch) {
            const codePoint = Number.parseInt(hexMatch[0], 16);
            output += codePoint === 0 || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)
                ? '\uFFFD'
                : String.fromCodePoint(codePoint);
            index += hexMatch[0].length;
            if (source[index + 1] === '\r' && source[index + 2] === '\n') index += 2;
            else if (/[\t\n\f\r ]/.test(source[index + 1] || '')) index += 1;
            continue;
        }
        output += next;
        index += 1;
    }
    return output;
}

function consumeCssEscape(source, index) {
    if (source[index] !== '\\' || index + 1 >= source.length) return index + 1;
    const next = source[index + 1];
    if (next === '\r') return index + (source[index + 2] === '\n' ? 3 : 2);
    if (next === '\n' || next === '\f') return index + 2;
    const hexMatch = source.slice(index + 1).match(/^[\da-f]{1,6}/i);
    if (!hexMatch) return index + 2;
    let end = index + 1 + hexMatch[0].length;
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else if (/[\t\n\f\r ]/.test(source[end] || '')) end += 1;
    return end;
}

function isValidCssEscape(source, index) {
    const next = source[index + 1];
    return source[index] === '\\' && Boolean(next) && next !== '\n' && next !== '\r' && next !== '\f';
}

function isCssNameChar(char) {
    return Boolean(char) && (/[-_a-z\d]/i.test(char) || char.codePointAt(0) >= 0x80);
}

function consumeCssName(source, index) {
    let end = index;
    while (end < source.length) {
        if (isCssNameChar(source[end])) { end += 1; continue; }
        if (isValidCssEscape(source, end)) { end = consumeCssEscape(source, end); continue; }
        break;
    }
    return end;
}

function consumeCssString(source, start) {
    const quote = source[start];
    let index = start + 1;
    while (index < source.length) {
        const char = source[index];
        if (char === quote) return index + 1;
        if (char === '\n' || char === '\f') return index;
        if (char === '\r') return index;
        if (char === '\\') {
            if (index + 1 >= source.length) return source.length;
            index = consumeCssEscape(source, index);
            continue;
        }
        index += 1;
    }
    return source.length;
}

function consumeBadCssUrlRemnants(source, index) {
    let end = index;
    while (end < source.length) {
        if (source[end] === ')') return end + 1;
        if (isValidCssEscape(source, end)) {
            end = consumeCssEscape(source, end);
            continue;
        }
        end += 1;
    }
    return source.length;
}

function badCssUrl(source, index) {
    return { type: 'bad', end: consumeBadCssUrlRemnants(source, index) };
}

function consumeCssUrl(source, openParenIndex) {
    let index = openParenIndex + 1;
    while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
    const quote = source[index];
    if (quote === '\'' || quote === '"') {
        const valueStart = index + 1;
        index = valueStart;
        while (index < source.length) {
            const char = source[index];
            if (char === quote) break;
            if (char === '\n' || char === '\r' || char === '\f') return badCssUrl(source, index);
            if (char === '\\') {
                if (index + 1 >= source.length) return badCssUrl(source, index);
                index = consumeCssEscape(source, index);
                continue;
            }
            index += 1;
        }
        if (source[index] !== quote) return badCssUrl(source, index);
        const rawReference = source.slice(valueStart, index);
        index += 1;
        while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
        return source[index] === ')'
            ? { type: 'valid', end: index + 1, rawReference }
            : badCssUrl(source, index);
    }
    const valueStart = index;
    while (index < source.length) {
        const char = source[index];
        if (char === ')') return { type: 'valid', end: index + 1, rawReference: source.slice(valueStart, index).trimEnd() };
        if (/[\t\n\f\r ]/.test(char)) {
            const valueEnd = index;
            while (/[\t\n\f\r ]/.test(source[index] || '')) index += 1;
            return source[index] === ')'
                ? { type: 'valid', end: index + 1, rawReference: source.slice(valueStart, valueEnd) }
                : badCssUrl(source, index);
        }
        if (char === '\'' || char === '"' || char === '(' || char === '\u0000' || /[\u0001-\u0008\u000B\u000E-\u001F\u007F]/.test(char)) {
            return badCssUrl(source, index);
        }
        if (char === '\\') {
            if (!isValidCssEscape(source, index)) return badCssUrl(source, index);
            index = consumeCssEscape(source, index);
            continue;
        }
        index += 1;
    }
    return badCssUrl(source, index);
}

function transformCssUrls(css, transform) {
    const source = String(css || '');
    let output = '';
    let index = 0;
    while (index < source.length) {
        if (source[index] === '/' && source[index + 1] === '*') {
            const end = source.indexOf('*/', index + 2);
            const next = end < 0 ? source.length : end + 2;
            output += source.slice(index, next);
            index = next;
            continue;
        }
        if (source[index] === '\'' || source[index] === '"') {
            const end = consumeCssString(source, index);
            output += source.slice(index, end);
            index = end;
            continue;
        }
        if (isCssNameChar(source[index]) || isValidCssEscape(source, index)) {
            const nameEnd = consumeCssName(source, index);
            const functionName = decodeCssEscapes(source.slice(index, nameEnd));
            if (functionName.toLowerCase() !== 'url' || source[nameEnd] !== '(') {
                output += source.slice(index, nameEnd);
                index = nameEnd;
                continue;
            }
            const parsed = consumeCssUrl(source, nameEnd);
            if (parsed.type === 'valid') {
                const match = source.slice(index, parsed.end);
                output += transform(match, parsed.rawReference);
            } else {
                output += source.slice(index, parsed.end);
            }
            index = parsed.end;
            continue;
        }
        output += source[index];
        index += 1;
    }
    return output;
}

function quoteCssUrl(value) {
    return `url("${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n?|\n|\f/g, '\\A ')}")`;
}

function decodeFile(file) {
    if (file.encoding === 'base64') {
        const binary = atob(file.content);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }
    return file.content;
}

export function createAssetRuntime(record, options = {}) {
    const urls = new Map();
    const createObjectURL = options.createObjectURL || URL.createObjectURL;
    const revokeObjectURL = options.revokeObjectURL || URL.revokeObjectURL;
    const BlobCtor = options.BlobCtor || Blob;
    const resolveAsset = (path) => {
        if (urls.has(path)) return urls.get(path);
        const file = record.files?.[path];
        if (!file) throw new Error(t`资源不存在：${path}`);
        const url = createObjectURL(new BlobCtor([decodeFile(file)], { type: file.mimeType }));
        urls.set(path, url);
        return url;
    };
    const rewriteReference = (basePath, reference) => {
        const rawReference = String(reference ?? '').trim();
        const packagePath = resolvePackageReference(basePath, rawReference);
        if (!packagePath) return reference;
        const pathPart = stripReferenceSuffix(rawReference);
        return `${resolveAsset(packagePath)}${rawReference.slice(pathPart.length)}`;
    };
    const rewriteSrcset = (value, basePath) => String(value || '').replace(/(?:data:[^\s]+|[^\s,]+)(?:\s+[^,]+)?/gi, (candidate) => {
        const trimmed = candidate.trim(); const separator = trimmed.search(/\s/);
        const url = separator < 0 ? trimmed : trimmed.slice(0, separator);
        const descriptor = separator < 0 ? '' : trimmed.slice(separator);
        try { return `${rewriteReference(basePath, url)}${descriptor}`; } catch { return trimmed; }
    });
    const rewriteHtml = (html, basePath) => String(html || '').replace(/\b(src|href|poster)\s*=\s*(['"])(.*?)\2/gi, (match, attr, quote, value) => {
        try { return `${attr}=${quote}${rewriteReference(basePath, value)}${quote}`; } catch { return match; }
    }).replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi, (match, quote, value) => `srcset=${quote}${rewriteSrcset(value, basePath)}${quote}`);
    const rewriteCss = (css, basePath) => transformCssUrls(css, (match, rawReference) => {
        const reference = decodeCssEscapes(rawReference);
        try { const rewritten = rewriteReference(basePath, reference); return rewritten === reference ? match : quoteCssUrl(rewritten); } catch { return match; }
    });
    return Object.freeze({ resolveAsset, rewriteHtml, rewriteCss, dispose() { for (const url of urls.values()) revokeObjectURL(url); urls.clear(); } });
}
