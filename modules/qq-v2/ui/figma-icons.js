/*!
 * Lucide outline icons — ISC License
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const QQ_FIGMA_ROOT_ICON_MAP = Object.freeze({
    messages: 'message',
    contacts: 'person',
    assistant: 'channel',
    settings: 'dynamic',
});

export const QQ_FIGMA_TOOL_ICON_MAP = Object.freeze({
    voice: 'voice',
    image: 'image',
    video: 'camera',
    transfer: 'transfer',
    emoji: 'emoji',
    plus: 'plus',
});

const ICON_SPECS = Object.freeze({
    hand: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }) }),
    ]),
    message: Object.freeze([
        Object.freeze({
            tag: 'path',
            attributes: Object.freeze({
                d: 'M12 3.5c-4.9 0-8.8 3-8.8 7.1 0 2.25 1.44 4.28 3.75 5.52-.1 1.24-.52 2.48-1.32 3.38 1.83-.26 3.42-.94 4.53-1.83.6.12 1.21.18 1.84.18 4.9 0 8.8-3 8.8-7.1s-3.9-7.25-8.8-7.25Z',
            }),
        }),
    ]),
    channel: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 3 7 21' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm17 3-2 18' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 9h16' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 15h16' }) }),
    ]),
    person: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '7.4', r: '3.1' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4.5 19.5c.8-3.3 3.5-5.2 7.5-5.2s6.7 1.9 7.5 5.2' }) }),
    ]),
    dynamic: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20.5 9.5A8.5 8.5 0 1 0 20 14.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20.5 4.5v5h-5' }) }),
    ]),
    voice: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '9', y: '3.5', width: '6', height: '10', rx: '3' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5.5 11.5a6.5 6.5 0 0 0 13 0' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 18v2.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.5 20.5h7' }) }),
    ]),
    image: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3.5', y: '5.5', width: '17', height: '13', rx: '1.6' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '7.5', cy: '9.2', r: '1.2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm4.5 16 4-4 3.1 3 2.4-2.4 5.5 5.3' }) }),
    ]),
    camera: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 7.5h3l1.4-2h5.2l1.4 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '13', r: '3.2' }) }),
    ]),
    transfer: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5.5 7h13v12.5h-13z' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 7V5.6a3 3 0 0 1 6 0V7' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm9.5 11 2.5 2.3 2.5-2.3' }) }),
    ]),
    emoji: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8.5' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '9', cy: '10.2', r: '.8', fill: 'currentColor', stroke: 'none' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '15', cy: '10.2', r: '.8', fill: 'currentColor', stroke: 'none' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8.5 14a4.2 4.2 0 0 0 7 0' }) }),
    ]),
    plus: Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8.5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 8v8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 12h8' }) }),
    ]),
    xmark: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18 6 6 18' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm6 6 12 12' }) }),
    ]),
    bars: Object.freeze([
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '4', x2: '20', y1: '12', y2: '12' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '4', x2: '20', y1: '6', y2: '6' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '4', x2: '20', y1: '18', y2: '18' }) }),
    ]),
    add: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 12h14' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 5v14' }) }),
    ]),
    'magnifying-glass': Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '11', cy: '11', r: '8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm21 21-4.3-4.3' }) }),
    ]),
    'user-plus': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M2 21a8 8 0 0 1 13.292-6' }) }),
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '10', cy: '8', r: '5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M19 16v6' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M22 19h-6' }) }),
    ]),
    'chevron-right': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm9 18 6-6-6-6' }) }),
    ]),
    'chevron-down': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm6 9 6 6 6-6' }) }),
    ]),
    pencil: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm15 5 4 4' }) }),
    ]),
    pause: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '14', y: '4', width: '4', height: '16', rx: '1' }) }),
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '6', y: '4', width: '4', height: '16', rx: '1' }) }),
    ]),
    'volume-high': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M16 9a5 5 0 0 1 0 6' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M19.364 18.364a9 9 0 0 0 0-12.728' }) }),
    ]),
    rotate: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M21 3v5h-5' }) }),
    ]),
    'wand-magic-sparkles': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm14 7 3 3' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 6v4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M19 14v4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M10 2v2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M7 8H3' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M21 16h-4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M11 3H9' }) }),
    ]),
    video: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }) }),
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '2', y: '6', width: '14', height: '12', rx: '2' }) }),
    ]),
    wallet: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }) }),
    ]),
    stop: Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ width: '18', height: '18', x: '3', y: '3', rx: '2' }) }),
    ]),
    'paper-plane': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm21.854 2.147-10.94 10.939' }) }),
    ]),
    'arrow-right-arrow-left': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm16 3 4 4-4 4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20 7H4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm8 21-4-4 4-4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 17h16' }) }),
    ]),
    trash: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 6h18' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '10', x2: '10', y1: '11', y2: '17' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '14', x2: '14', y1: '11', y2: '17' }) }),
    ]),
    'circle-check': Object.freeze([
        Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '10' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm9 12 2 2 4-4' }) }),
    ]),
    'pen-to-square': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' }) }),
    ]),
    'rotate-left': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 3v5h5' }) }),
    ]),
    'file-import': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M14 2v4a2 2 0 0 0 2 2h4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M2 15h10' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm9 18 3-3-3-3' }) }),
    ]),
    'file-export': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M14 2v4a2 2 0 0 0 2 2h4' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 7V4a2 2 0 0 1 2-2 2 2 0 0 0-2 2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4.063 20.999a2 2 0 0 0 2 1L18 22a2 2 0 0 0 2-2V7l-5-5H6' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm5 11-3 3' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm5 17-3-3h10' }) }),
    ]),
    hashtag: Object.freeze([
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '4', x2: '20', y1: '9', y2: '9' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '4', x2: '20', y1: '15', y2: '15' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '10', x2: '8', y1: '3', y2: '21' }) }),
        Object.freeze({ tag: 'line', attributes: Object.freeze({ x1: '16', x2: '14', y1: '3', y2: '21' }) }),
    ]),
    'check-double': Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M18 6 7 17l-5-5' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm22 10-7.5 7.5L13 16' }) }),
    ]),
    'square-minus': Object.freeze([
        Object.freeze({ tag: 'rect', attributes: Object.freeze({ width: '18', height: '18', x: '3', y: '3', rx: '2' }) }),
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 12h8' }) }),
    ]),
    check: Object.freeze([
        Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M20 6 9 17l-5-5' }) }),
    ]),
});

function createSvgElement(documentRef, tagName) {
    if (typeof documentRef?.createElementNS === 'function') {
        return documentRef.createElementNS(SVG_NAMESPACE, tagName);
    }
    if (typeof documentRef?.createElement === 'function') {
        return documentRef.createElement(tagName);
    }
    throw new TypeError('A DOM document is required to create a QQ Figma icon');
}

function applyAttributes(element, attributes) {
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

export function createQQFigmaIconElement(name, documentRef = globalThis.document, className = '') {
    const iconName = String(name || '').trim();
    const spec = ICON_SPECS[iconName];
    if (!spec) throw new RangeError(`Unknown QQ Figma icon: ${iconName}`);

    const icon = createSvgElement(documentRef, 'svg');
    applyAttributes(icon, {
        viewBox: '0 0 24 24',
        width: '1em',
        height: '1em',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        'pointer-events': 'none',
        'data-qq-figma-icon': iconName,
    });
    if (className && icon.classList) icon.classList.add(...className.split(/\s+/).filter(Boolean));

    spec.forEach(({ tag, attributes }) => {
        const child = createSvgElement(documentRef, tag);
        applyAttributes(child, attributes);
        icon.append(child);
    });
    return icon;
}
