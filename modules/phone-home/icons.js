import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

function resolveExtensionAssetUrl(assetPath) {
    const moduleUrl = String(import.meta.url || '');
    const extensionRoot = moduleUrl.includes('/dist/')
        ? new URL('../', moduleUrl)
        : new URL('../../', moduleUrl);
    return new URL(assetPath, extensionRoot).href;
}

const PHONE_STATUS_SIGNAL_ICON = resolveExtensionAssetUrl('assets/phone-status-signal.svg');
const PHONE_STATUS_WIFI_ICON = resolveExtensionAssetUrl('assets/phone-status-wifi.svg');
const PHONE_STATUS_BATTERY_ICON = resolveExtensionAssetUrl('assets/phone-status-battery.svg');

export const PHONE_NAV_ICON_PATHS = Object.freeze({
    back: 'M16 19L8 12L16 5',
    forward: 'M8 19L16 12L8 5',
});

function buildPhoneNavIcon(pathData) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${pathData}"/></svg>`;
}

function buildAppIcon(content, colorA, colorB) {
    return `<div class="phone-dock-text-icon" style="--yuzi-phone-dock-text-icon-start:${escapeHtmlAttr(colorA)};--yuzi-phone-dock-text-icon-end:${escapeHtmlAttr(colorB)};">${content}</div>`;
}

function buildDockIcon(name, shapes) {
    return buildAppIcon(
        `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`,
        `var(--yuzi-phone-home-dock-${name}-start)`,
        `var(--yuzi-phone-home-dock-${name}-end)`,
    );
}

export const PHONE_ICONS = {
    signal: `<img class="phone-status-icon" src="${PHONE_STATUS_SIGNAL_ICON}" alt="" aria-hidden="true">`,
    wifi: `<img class="phone-status-icon" src="${PHONE_STATUS_WIFI_ICON}" alt="" aria-hidden="true">`,
    battery: `<img class="phone-status-icon" src="${PHONE_STATUS_BATTERY_ICON}" alt="" aria-hidden="true">`,
    back: buildPhoneNavIcon(PHONE_NAV_ICON_PATHS.back),
    forward: buildPhoneNavIcon(PHONE_NAV_ICON_PATHS.forward),
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20H5a1 1 0 0 1-1-1v-7 M16.5 3.5a2.1 2.1 0 0 1 3 3L10 16l-6 1 1-4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    editCancel: buildPhoneNavIcon('m6 6 12 12M6 18 18 6'),
    editSave: buildPhoneNavIcon('m5 12 4 4L19 6'),
    gear: buildDockIcon('settings', '<path d="M21 10h6l1 4 3 2 4-1 3 5-3 3v3l3 3-3 5-4-1-3 2-1 4h-6l-1-4-3-2-4 1-3-5 3-3v-3l-3-3 3-5 4 1 3-2z"/><circle cx="24" cy="24.5" r="6"/>'),
    visualizer: buildDockIcon('visualizer', '<rect x="11" y="12" width="26" height="20" rx="4" fill="currentColor" fill-opacity=".12"/><path d="M11 19h26M21 19v13M16 37h16"/><path d="m26 27 3-3 3 3"/>'),
    database: buildDockIcon('database', '<ellipse cx="24" cy="13" rx="12" ry="5" fill="currentColor" fill-opacity=".16"/><path d="M12 13v22c0 2.8 5.4 5 12 5s12-2.2 12-5V13M12 24c0 2.8 5.4 5 12 5s12-2.2 12-5"/>'),
    refresh: `<svg viewBox="0 0 48 48" fill="none"><defs><linearGradient id="grefresh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4DB6AC"/><stop offset="100%" stop-color="#00695C"/></linearGradient></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="url(#grefresh)"/><path d="M16 17a10 10 0 0117 2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M33 14v6h-6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M32 31a10 10 0 01-17-2" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M15 34v-6h6" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
    puzzle: buildDockIcon('fusion', '<path d="M12 17h8v-3a4 4 0 0 1 8 0v3h8v9h-3a4 4 0 0 0 0 8h3v4H12v-9h3a4 4 0 0 0 0-8h-3z" fill="currentColor" fill-opacity=".16"/>'),
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`,
};

const ICON_COLORS = [
    ['#FF5E3A', '#FF2A68'],
    ['#FF9500', '#FF5E3A'],
    ['#4CD964', '#5AC8FA'],
    ['#1AD6FD', '#1D62F0'],
    ['#54C7FC', '#007AFF'],
    ['#FF0054', '#D02090'],
    ['#E42A58', '#E65636'],
];

function getHashColorPair(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % ICON_COLORS.length;
    return ICON_COLORS[index];
}

export function getIconForSheet(sheetName) {
    const name = (sheetName || '表').trim();
    const firstChar = name.charAt(0).toUpperCase();
    const colors = getHashColorPair(name);

    return getTextIcon(firstChar, ...colors);
}

export function getTextIcon(letter, colorA, colorB) {
    const text = String(letter || '').trim().charAt(0) || 'A';
    return buildAppIcon(
        `<span class="phone-dock-text-icon-glyph-wrap"><span class="phone-dock-text-icon-glyph">${escapeHtml(text)}</span></span>`,
        colorA,
        colorB,
    );
}
