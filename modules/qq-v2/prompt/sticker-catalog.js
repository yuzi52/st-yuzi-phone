function asText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function stickerParts(sticker) {
    if (typeof sticker !== 'string') {
        return {
            id: asText(sticker?.id ?? sticker?.stickerId, 2048),
            description: asText(sticker?.description, 4000),
        };
    }
    const separator = sticker.indexOf('：');
    return separator < 0
        ? { id: asText(sticker, 2048), description: '' }
        : {
            id: asText(sticker.slice(0, separator), 2048),
            description: asText(sticker.slice(separator + 1), 4000),
        };
}

function plainDescription(value) {
    const text = asText(value, 4000)
        .replace(/(?:data|blob):[^\s"'<>]+/giu, ' ')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&lt;[^&]*?&gt;/giu, ' ')
        .replace(/\[object\s+(?:Blob|File)\]/giu, ' ')
        .replace(/[A-Za-z0-9+/]{80,}={0,2}/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return asText(text || '表情', 1000);
}

/**
 * 提示词只暴露本次请求内的短引用；真实资源 ID 留在运行时映射中。
 */
export function buildQQV2StickerCatalog(stickers = []) {
    const references = {};
    const descriptions = {};
    const lines = [];
    const seenIds = new Set();
    for (const sticker of Array.isArray(stickers) ? stickers : []) {
        const { id, description } = stickerParts(sticker);
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const reference = `S${lines.length + 1}`;
        references[reference] = id;
        descriptions[reference] = plainDescription(description);
        lines.push(`${reference}｜${descriptions[reference]}`);
    }
    return Object.freeze({
        text: lines.join('\n') || '无',
        references: Object.freeze(references),
        descriptions: Object.freeze(descriptions),
    });
}

export function mapQQV2StickerActionReferences(actions, stickerReferences = {}) {
    const references = stickerReferences && typeof stickerReferences === 'object'
        ? stickerReferences
        : {};
    return (Array.isArray(actions) ? actions : []).map((action) => {
        if (action?.type !== 'message' || action?.messageType !== 'sticker') return { ...action };
        const stickerId = Object.prototype.hasOwnProperty.call(references, action.stickerId)
            ? references[action.stickerId]
            : action.stickerId;
        return { ...action, stickerId };
    });
}
