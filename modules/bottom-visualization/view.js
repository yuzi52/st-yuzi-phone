import { t } from '../i18n/index.js';
import { getSheetKeys } from '../phone-core/data-api.js';
import { resolveTableViewerContext } from '../table-viewer/context.js';
import { escapeHtml as html, escapeHtmlAttr as attr } from '../utils/dom-escape.js';
import { shouldHideLeadingPlaceholderColumn, shouldSkipAutoManagedColumn } from '../utils/table-column-metadata.js';
import { buildDetailEditControlHtml } from '../table-viewer/detail-edit-field.js';
import { detectGenericTemplateForTable } from '../phone-beautify-templates/matcher.js';
import { createGenericTemplateStylePayload } from '../table-viewer/generic-style-payload.js';

export function iconButton(action, label, path, disabled = false) {
    return `<button type="button" class="yuzi-bottom-icon" data-action="${action}" title="${attr(label)}" aria-label="${attr(label)}"${disabled ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg></button>`;
}
export const controls = () => iconButton('collapse', t('收起'), 'm6 9 6 6 6-6')
    + iconButton('settings', t('设置'), 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0');

export function buildNavigation(raw, active = '') {
    return [{ key: 'review', name: t('审核') }, ...getSheetKeys(raw).map(key => ({ key, name: raw[key].name || key }))]
        .map(({ key, name }) => `<button type="button" class="yuzi-bottom-tab" data-sheet="${attr(key)}" aria-pressed="${key === active}" title="${attr(name)}"><span>${html(name)}</span></button>`).join('');
}

export function buildTableContent(raw, key, descending = false, editor = null, deletion = null) {
    const context = resolveTableViewerContext(key, { initialTableData: raw });
    if (!context) return null;
    const { headers, rawHeaders, rows, tableName } = context;
    const entries = rows.map((row, index) => ({ row: Array.isArray(row) ? row : [], index }));
    if (descending) entries.reverse();
    if (editor?.active) {
        const style = createGenericTemplateStylePayload(detectGenericTemplateForTable({ sheetKey: key, tableName, headers }), 'detail');
        const cards = entries.map(({ row, index }) => `
            <article class="yuzi-bottom-card yuzi-bottom-edit-card phone-generic-root ${style.className || 'phone-generic-template-scope'}" ${style.dataAttrs} style="${style.styleAttr}" data-sheet="${attr(key)}" data-row-index="${index}" data-row="${attr(String(row[0] ?? index))}">
                <header class="yuzi-bottom-card-heading"><span>#${html(String(row[0] ?? index + 1))}</span></header>
                <div class="phone-row-detail-card phone-generic-slot-detail phone-generic-detail-flow-list">
                    ${headers.map((header, col) => {
                        if (shouldSkipAutoManagedColumn({ headers, rawHeaders, row, colIndex: col, hideLeadingPlaceholder: shouldHideLeadingPlaceholderColumn(rawHeaders, row) })) return '';
                        return `<div class="phone-row-detail-kv phone-generic-slot-detail-field">
                            <div class="phone-generic-field-header"><span class="phone-row-detail-key">${html(header)}</span></div>
                            ${buildDetailEditControlHtml({ key: header, value: editor.value(key, index, col, row[col]), rawColIndex: col, isLocked: editor.saving })}
                        </div>`;
                    }).join('')}
                </div>
            </article>`).join('');
        return { title: tableName, count: rows.length, html: (style.scopedCss ? `<style>${style.scopedCss}</style>` : '') + (cards || `<p class="yuzi-bottom-empty">${t('暂无数据')}</p>`) };
    }
    const deleteControl = (row, index) => {
        const label = `#${String(row[0] ?? index + 1)}`;
        if (!deletion?.active) return `<span>${html(label)}</span>`;
        const locked = deletion.locked(index), selected = deletion.has(index);
        const actionLabel = locked ? t('条目已锁定') : selected ? t('取消选择') : t('选择删除');
        return `<button type="button" class="phone-ios-mini-btn" data-action="toggle-delete-row" data-row-index="${index}" aria-pressed="${selected}" aria-label="${attr(`${actionLabel} ${label}`)}"${deletion.deleting || locked ? ' disabled' : ''}>${selected ? '✓ ' : ''}${html(label)}${locked ? ` · ${t('条目已锁定')}` : ''}</button>`;
    };
    return { title: tableName, count: rows.length, html: entries.map(({ row, index }) => `
        <article class="yuzi-bottom-card" data-row="${attr(String(row[0] ?? index))}">
            <header class="yuzi-bottom-card-heading">${deleteControl(row, index)}</header>
            <dl>${headers.slice(1).map((header, i) => {
                const value = String(row[i + 1] ?? '');
                return value.trim() ? `<div><dt>${html(header)}</dt><dd>${html(value)}</dd></div>` : '';
            }).join('')}</dl>
        </article>`).join('') || `<p class="yuzi-bottom-empty">${t('暂无数据')}</p>` };
}

export function getOptionTexts(raw) {
    const key = getSheetKeys(raw).find(key => String(raw[key]?.name || '').includes('选项'));
    if (!key) return [];
    return (resolveTableViewerContext(key, { initialTableData: raw })?.rows || [])
        .flatMap(row => Array.isArray(row) ? row.slice(1) : [])
        .map(value => String(value ?? '').trim()).filter(Boolean);
}
