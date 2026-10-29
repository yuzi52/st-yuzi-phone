import { parseDateText } from '../../phone-core/date-relation.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { getCellByHeader, mapTheaterRows, normalizeText } from '../core/table-index.js';

const CALENDAR_TABLES = Object.freeze({ days: '小日历表' });
const RELATION_ORDER = Object.freeze(['今天', '明天', '后天', '3天后', '4天后', '5天后', '6天后']);
const CLOUD = '<path d="M6 15a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 17.4 9 3 3 0 1 1 18 15Z"/>';
const SNOW = '<path d="M9 17v5m-2-4 4 3m-4 0 4-3"/>';
const WEATHER_ICONS = Object.freeze({
    晴: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    阴: CLOUD,
    多云: '<path d="M15 6a3 3 0 1 1 5 4M18 2V1m4 5h1m-2-3 1-1"/>' + CLOUD,
    小雨: CLOUD + '<path d="m9 18-1 3m7-3-1 3"/>',
    大雨: CLOUD + '<path d="m7 18-1 3m6-3-1 3m6-3-1 3"/>',
    雷雨: CLOUD + '<path d="m13 16-3 4h4l-2 3"/>',
    小雪: CLOUD + SNOW,
    大雪: CLOUD + SNOW + '<path d="M17 17v5m-2-4 4 3m-4 0 4-3"/>',
    雾: '<path d="M4 6h16M2 10h16M6 14h16M3 18h16"/>',
    风: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a2 2 0 1 0-2-2M3 16h9a3 3 0 1 1-3 3"/>',
    沙尘: '<path d="M3 7h12a3 3 0 1 0-3-3M3 12h16M3 17h9"/><circle cx="18" cy="17" r=".7"/><circle cx="7" cy="21" r=".7"/><circle cx="22" cy="21" r=".7"/>',
    极端天气: '<path d="m12 3 10 18H2Z M12 9v5m0 3v.1"/>',
});

function parseCalendarDate(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
    const parsed = parseDateText(dateText);
    if (parsed?.kind !== 'real'
        || parsed.year !== parsed.inputYear
        || parsed.monthIndex !== parsed.inputMonth - 1
        || parsed.day !== parsed.inputDay) return null;
    return parsed;
}

function normalizeCalendarRow(daysTable, row) {
    const dateText = normalizeText(getCellByHeader(daysTable, row, '日期'));
    const parsedDate = parseCalendarDate(dateText);
    return {
        dateKey: dateText,
        dateText,
        parsedDate,
        weekdayText: normalizeText(getCellByHeader(daysTable, row, '星期几')),
        festivalText: normalizeText(getCellByHeader(daysTable, row, '节日')),
        majorEvent: normalizeText(getCellByHeader(daysTable, row, '大事件')),
        dayStatus: normalizeText(getCellByHeader(daysTable, row, '状态')),
        weatherText: normalizeText(getCellByHeader(daysTable, row, '天气')),
        todayRelation: normalizeText(getCellByHeader(daysTable, row, '与今天的关系')),
        dayContent: String(getCellByHeader(daysTable, row, '内容') ?? ''),
    };
}

function buildPeriodLabels(entries) {
    const sorted = [...entries].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
    if (!sorted.length) return { periodLabel: '七日生活', rangeLabel: '日期待补齐' };
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = first.parsedDate;
    const end = last.parsedDate;
    const crossYear = start.year !== end.year;
    let periodLabel = `${start.year}年${start.monthIndex + 1}月`;
    if (crossYear) periodLabel += ` — ${end.year}年${end.monthIndex + 1}月`;
    else if (start.monthIndex !== end.monthIndex) periodLabel = `${start.year}年${start.monthIndex + 1}—${end.monthIndex + 1}月`;
    const startLabel = `${crossYear ? `${first.dateText.slice(0, 4)}.` : ''}${start.monthIndex + 1}.${start.day}`;
    const endLabel = `${crossYear ? `${last.dateText.slice(0, 4)}.` : ''}${end.monthIndex + 1}.${end.day}`;
    return { periodLabel, rangeLabel: first === last ? startLabel : `${startLabel} — ${endLabel}` };
}

function buildViewModel(resolved) {
    const rows = mapTheaterRows(resolved.tables.days, (row) => normalizeCalendarRow(resolved.tables.days, row));
    const entriesByRelation = new Map();
    const contentByDateKey = new Map();
    rows.forEach((entry) => {
        if (!entry.parsedDate || !RELATION_ORDER.includes(entry.todayRelation)
            || entriesByRelation.has(entry.todayRelation) || contentByDateKey.has(entry.dateKey)) return;
        entriesByRelation.set(entry.todayRelation, entry);
        contentByDateKey.set(entry.dateKey, entry);
    });
    const days = RELATION_ORDER.map(todayRelation => ({ todayRelation, entry: entriesByRelation.get(todayRelation) || null }));
    const todayKey = entriesByRelation.get('今天')?.dateKey || '';
    const selectedKey = todayKey || days.find(day => day.entry)?.entry.dateKey || '';
    return {
        days,
        todayKey,
        selectedKey,
        selectedEntry: contentByDateKey.get(selectedKey) || null,
        contentByDateKey,
        ...buildPeriodLabels(contentByDateKey.values()),
    };
}

function collectDeletableKeys() {
    return [];
}

function deleteEntities() {
    return { removed: 0 };
}

function renderWeatherIcon(weatherText) {
    const paths = WEATHER_ICONS[weatherText];
    if (typeof paths !== 'string') return '';
    return `<svg class="phone-theater-calendar-weather-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function renderDay(day, selectedKey) {
    const entry = day.entry;
    const selected = !!entry && entry.dateKey === selectedKey;
    const label = entry
        ? [day.todayRelation, entry.dateText, entry.weekdayText, entry.weatherText, entry.dayStatus].filter(Boolean).join('，')
        : `${day.todayRelation}，暂无有效日期`;
    const statusLabel = entry?.dayStatus === '放假' ? '休' : entry?.dayStatus === '上班/上学' ? '班' : '—';
    return `
        <button type="button" class="phone-theater-calendar-day${selected ? ' is-selected' : ''}${entry ? '' : ' is-empty'}" data-calendar-date-key="${escapeHtmlAttr(entry?.dateKey || '')}" aria-pressed="${selected}" aria-label="${escapeHtmlAttr(label)}" title="${escapeHtmlAttr(label)}"${entry ? '' : ' disabled'}>
            <span class="phone-theater-calendar-day-relation">${escapeHtml(day.todayRelation)}</span>
            <span class="phone-theater-calendar-day-date">${entry ? `${entry.parsedDate.monthIndex + 1}.${entry.parsedDate.day}` : '—'}</span>
            <span class="phone-theater-calendar-day-meta">${entry ? `${renderWeatherIcon(entry.weatherText)}<span>${statusLabel}</span>` : '待补齐'}</span>
        </button>
    `;
}

function renderSelectedEntry(entry) {
    if (!entry) return '<p class="phone-theater-calendar-content">暂无有效小日历内容</p>';
    return `
            <div class="phone-theater-calendar-detail-relation">${escapeHtml([entry.todayRelation, entry.weekdayText].filter(Boolean).join(' · '))}</div>
            <h2 class="phone-theater-calendar-event">${escapeHtml(entry.majorEvent || '暂无公共纪事')}</h2>
            ${entry.dayStatus || entry.weatherText || entry.festivalText ? `
                <div class="phone-theater-calendar-badges">
                    ${entry.weatherText ? `<span class="phone-theater-calendar-weather">${renderWeatherIcon(entry.weatherText)}${escapeHtml(entry.weatherText)}</span>` : ''}
                    ${entry.dayStatus ? `<span class="phone-theater-calendar-status${entry.dayStatus === '放假' ? ' is-rest' : ''}">${escapeHtml(entry.dayStatus)}</span>` : ''}
                    ${entry.festivalText ? `<span class="phone-theater-calendar-festival">${escapeHtml(entry.festivalText)}</span>` : ''}
                </div>
            ` : ''}
            ${entry.dayContent.trim() ? `<p class="phone-theater-calendar-content">${escapeHtml(entry.dayContent)}</p>` : ''}
    `;
}

function renderContent(viewModel) {
    const content = viewModel.content;
    return `
        <div class="phone-theater-calendar-page" data-calendar-selected-key="${escapeHtmlAttr(content.selectedKey)}">
            <header class="phone-theater-calendar-header">
                <div class="phone-theater-calendar-period">${escapeHtml(content.periodLabel)}</div>
                <div class="phone-theater-calendar-range">${escapeHtml(content.rangeLabel)}</div>
            </header>
            <div class="phone-theater-calendar-columns">
                <section class="phone-theater-calendar-days" role="group" aria-label="选择七日日期">
                    ${content.days.map(day => renderDay(day, content.selectedKey)).join('')}
                </section>
                <section class="phone-theater-calendar-detail" aria-live="polite" aria-atomic="true">
                    ${renderSelectedEntry(content.selectedEntry)}
                </section>
            </div>
        </div>
    `;
}

function bindInteractions(container, context = {}) {
    const page = container.querySelector('.phone-theater-calendar-page');
    const content = context.viewModel?.content;
    if (!(page instanceof HTMLElement) || !content || page.dataset.calendarBound === 'true') return;
    page.dataset.calendarBound = 'true';
    const state = context.state || {};
    const entries = content.contentByDateKey;
    const selectDate = (dateKey) => {
        const entry = entries.get(dateKey);
        if (!entry) return;
        state.calendarSelectedDateKey = dateKey;
        page.dataset.calendarSelectedKey = dateKey;
        page.querySelectorAll('.phone-theater-calendar-day').forEach((button) => {
            const selected = button.dataset.calendarDateKey === dateKey;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('is-selected', selected);
        });
        const detail = page.querySelector('.phone-theater-calendar-detail');
        if (detail) detail.innerHTML = renderSelectedEntry(entry);
    };
    selectDate(entries.has(state.calendarSelectedDateKey) ? state.calendarSelectedDateKey : content.selectedKey);
    if (!entries.size) state.calendarSelectedDateKey = '';
    context.addEventListener(page, 'click', (event) => {
        if (typeof context.isActive === 'function' && !context.isActive()) return;
        const button = event.target instanceof Element ? event.target.closest('[data-calendar-date-key]') : null;
        if (!(button instanceof HTMLButtonElement) || button.disabled || !page.contains(button)) return;
        selectDate(button.dataset.calendarDateKey);
    });
}

export const calendarScene = Object.freeze({
    id: 'calendar',
    appKey: '__theater_calendar',
    name: '小日历',
    iconText: '历',
    iconColors: ['#FF3B30', '#FF9500'],
    orderNo: 4,
    title: '小日历',
    subtitle: '七日公共纪事',
    emptyText: '暂无小日历内容',
    styleScope: 'calendar',
    primaryTableRole: 'days',
    deletable: false,
    tables: CALENDAR_TABLES,
    editableTables: Object.freeze([
        Object.freeze({ role: 'days', label: '编辑小日历表', description: '进入原始七日窗口表格列表' }),
    ]),
    fieldSchema: Object.freeze({ days: Object.freeze({ identity: '与今天的关系' }) }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/calendar.css',
        requiredClasses: [
            'phone-theater-calendar-page',
            'phone-theater-calendar-header',
            'phone-theater-calendar-columns',
            'phone-theater-calendar-days',
            'phone-theater-calendar-day',
            'phone-theater-calendar-detail',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
    bindInteractions,
});
