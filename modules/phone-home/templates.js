import { buildShellRegionHtml } from '../view-regions.js';
import { escapeHtml, escapeHtmlAttr } from '../utils/dom-escape.js';

export function buildHomeShellStyleText({
    bgStyle,
    homeAppLabelColor,
    homeAppLabelShadow,
    appIconSize,
    appIconRadius,
    appGridColumns,
    appGridGap,
    dockIconSize,
}) {
    const styleChunks = [];

    if (bgStyle) {
        styleChunks.push(bgStyle);
    }

    styleChunks.push(`--yuzi-phone-home-app-icon-size:${appIconSize}px`);
    // Keep the saved pixel radius proportional when either grid or Dock icons shrink.
    styleChunks.push(`--yuzi-phone-home-app-icon-radius:${appIconRadius / appIconSize * 100}%`);
    styleChunks.push(`--yuzi-phone-home-grid-columns:${appGridColumns}`);
    styleChunks.push(`--yuzi-phone-home-grid-column-gap:${appGridGap}px`);
    styleChunks.push(`--yuzi-phone-home-dock-icon-size:${dockIconSize}px`);
    styleChunks.push(`--yuzi-phone-home-app-label-color:${String(homeAppLabelColor || 'var(--yuzi-phone-home-app-label-color-on-dark)')}`);
    styleChunks.push(`--yuzi-phone-home-app-label-shadow:${String(homeAppLabelShadow || 'var(--yuzi-phone-home-app-label-shadow-on-dark)')}`);

    return styleChunks.join('; ');
}

export function buildHomeShellHtml(styleText) {
    return `
        <div class="phone-home" data-home-shell="root" style="${escapeHtmlAttr(String(styleText || ''))}">
            ${buildShellRegionHtml({
                region: 'home-status-bar',
                className: 'phone-home-status-bar',
            })}
            ${buildShellRegionHtml({
                region: 'home-grid',
                className: 'phone-app-grid',
            })}
            ${buildShellRegionHtml({
                region: 'home-dock',
                className: 'phone-dock',
                attrs: 'data-dock-count="4"',
            })}
        </div>
    `;
}

export function buildHomeAppItemHtml(iconHtml, name) {
    return `
        <div class="phone-app-icon">${iconHtml}</div>
        <span class="phone-app-label">${escapeHtml(String(name || ''))}</span>
    `;
}

export function buildDockItemHtml(iconHtml, name) {
    return `
        <div class="phone-app-icon phone-dock-icon">${iconHtml}</div>
        <span class="phone-app-label">${escapeHtml(String(name || ''))}</span>
    `;
}

export function buildStatusBarHtml(data = {}) {
    const { currentTime, weekday, dayStatus, weather, majorEvent } = data;

    // 1. 时间/日期切分
    let timePart = '';
    let datePart = '';
    if (currentTime) {
        const timeStr = String(currentTime).trim();
        if (timeStr.includes(' ')) {
            const parts = timeStr.split(/\s+/);
            if (parts[0].includes('-') || parts[0].includes('年')) {
                datePart = parts[0];
                timePart = parts[1];
            } else {
                timePart = parts[0];
                datePart = parts[1];
            }
        } else if (timeStr.includes('-') || timeStr.includes('年')) {
            datePart = timeStr;
        } else {
            timePart = timeStr;
        }
    }

    // 2. 渲染左卡片（如果存在时间/日期）
    let leftCardHtml = '';
    if (timePart || datePart || weekday) {
        const displayDate = datePart ? `${datePart}${weekday ? ' ' + weekday : ''}` : (weekday || '');
        leftCardHtml = `
            <div class="phone-home-status-card status-card-left">
                ${timePart ? `<div class="phone-home-status-time">${escapeHtml(timePart)}</div>` : ''}
                ${displayDate ? `<div class="phone-home-status-date">${escapeHtml(displayDate)}</div>` : ''}
            </div>
        `;
    }

    // 3. 渲染右卡片（如果存在今日日程）
    let rightCardHtml = '';
    const hasRightData = weather || dayStatus || majorEvent;
    if (hasRightData) {
        const weatherStatus = [weather, dayStatus].filter(Boolean).join(' · ');
        rightCardHtml = `
            <div class="phone-home-status-card status-card-right">
                ${weatherStatus ? `<div class="phone-home-status-weather-row">${escapeHtml(weatherStatus)}</div>` : ''}
                ${majorEvent ? `<div class="phone-home-status-event" title="${escapeHtmlAttr(majorEvent)}">${escapeHtml(majorEvent)}</div>` : ''}
            </div>
        `;
    }

    return leftCardHtml + rightCardHtml;
}
