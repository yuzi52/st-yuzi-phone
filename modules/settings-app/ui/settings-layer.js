import { t } from '../../i18n/index.js';
import {
    clearPhoneTemporaryLayers,
    getPhoneTemporaryLayerHost,
    mountPhoneTemporaryLayer,
} from '../../phone-core/shell-temporary-layer-host.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';

// 设置公共弹层：底部选择面板（sheet）与操作菜单（action sheet）。
// 样式见 styles/phone-base/07-settings-layers.css，规范见 docs/phone-ui-variables.md「设置公共弹层」。

let layerSequence = 0;

function nextLayerId(prefix) {
    layerSequence += 1;
    return `${prefix}-${layerSequence}`;
}

/**
 * 把弹层挂到手机壳临时层宿主，统一处理遮罩点击、Esc、焦点进入与归还。
 * @returns {{ bind: Function, close: Function } | null} 宿主不存在时返回 null
 */
export function mountSettingsLayer(overlay, runtime = null, onClose = null) {
    if (!getPhoneTemporaryLayerHost()) return null;
    clearPhoneTemporaryLayers();

    const opener = document.activeElement;
    const cleanups = [];
    let closed = false;
    let disposeLayer = () => {};
    let unregister = () => {}, frame = null;

    const bind = (target, type, listener, options) => {
        if (!target || typeof target.addEventListener !== 'function') return;
        target.addEventListener(type, listener, options);
        cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    const finish = () => {
        unregister();
        cancelAnimationFrame(frame);
        cleanups.splice(0).reverse().forEach(task => task());
        onClose?.();
        if (opener && typeof opener.focus === 'function' && opener.isConnected) {
            opener.focus({ preventScroll: true });
        }
    };
    const close = () => {
        if (closed) return;
        closed = true;
        finish();
        disposeLayer();
    };

    disposeLayer = mountPhoneTemporaryLayer(overlay, () => {
        if (closed) return;
        closed = true;
        finish();
    });
    bind(overlay, 'click', (event) => {
        if (event.target === overlay) close();
    });
    bind(overlay, 'keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    });
    bind(document, 'keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
    });
    unregister = runtime?.registerCleanup?.(close) || (() => {});

    frame = requestAnimationFrame(() => {
        if (closed) return;
        overlay.classList.add('is-visible');
        const target = overlay.querySelector('[aria-selected="true"]:not(:disabled)') || overlay.querySelector('button:not(:disabled)');
        target?.focus?.({ preventScroll: true });
    });

    return { bind, close };
}

/**
 * 底部面板骨架：抓手条 + 标题（可选副标题）+「完成」+ 可滚动内容。
 * bodyHtml 由调用方负责转义。
 */
export function showSettingsSheet({
    title = '',
    subtitle = '',
    bodyHtml = '',
    footer = '',
    className = '',
    doneText = t`完成`,
    onDone = null,
    onClose = null,
    runtime = null,
} = {}) {
    const titleId = nextLayerId('phone-ios-sheet-title');
    const overlay = document.createElement('div');
    overlay.className = `phone-ios-layer${className ? ` ${className}` : ''}`;
    overlay.innerHTML = `
        <section class="phone-ios-sheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
            <div class="phone-ios-sheet-grabber" aria-hidden="true"></div>
            <header class="phone-ios-sheet-head">
                <h2 class="phone-ios-sheet-title" id="${titleId}">${escapeHtml(title)}</h2>
                ${subtitle ? `<p class="phone-ios-sheet-subtitle">${escapeHtml(subtitle)}</p>` : ''}
                <button type="button" class="phone-ios-sheet-done">${escapeHtml(doneText)}</button>
            </header>
            <div class="phone-ios-sheet-body">
                ${bodyHtml}
                ${footer ? `<p class="phone-ios-group-footer">${escapeHtml(footer)}</p>` : ''}
            </div>
        </section>
    `;

    const layer = mountSettingsLayer(overlay, runtime, onClose);
    if (!layer) return null;
    layer.bind(overlay.querySelector('.phone-ios-sheet-done'), 'click', () => {
        if (onDone?.(overlay) === false) return;
        layer.close();
    });
    return { ...layer, overlay };
}

function buildOptionHtml(option, index) {
    const thumbHtml = option.thumbHtml || '';
    const badgeHtml = option.badge
        ? `<span class="phone-ios-badge">${escapeHtml(option.badge)}</span>`
        : '';
    const subHtml = option.sub
        ? `<span class="phone-ios-row-sub">${escapeHtml(option.sub)}</span>`
        : '';
    return `
        <button type="button" class="phone-ios-row phone-ios-option${thumbHtml ? ' has-thumb' : ''}${option.disabled ? ' is-disabled' : ''}" role="option" aria-selected="${option.selected ? 'true' : 'false'}" data-option-index="${index}"${option.disabled ? ' disabled' : ''}>
            ${thumbHtml}
            <span class="phone-ios-row-label">${escapeHtml(option.label)}${badgeHtml}${subHtml}</span>
            <span class="phone-ios-option-check" aria-hidden="true">✓</span>
        </button>
    `;
}

/**
 * 单选面板：选项分组显示，当前项右侧打勾，点选后关闭并回调。
 * @param {{ title: string, subtitle?: string, groups: Array<{ header?: string, options: Array<{ value: string, label: string, sub?: string, badge?: string, thumbHtml?: string, selected?: boolean, disabled?: boolean }> }>, footer?: string, onSelect: Function, runtime?: object }} config
 */
export function showSettingsOptionSheet({
    title = '',
    subtitle = '',
    groups = [],
    footer = '',
    className = '',
    onSelect,
    runtime = null,
} = {}) {
    const flatOptions = [];
    const bodyHtml = groups
        .filter(group => Array.isArray(group?.options) && group.options.length > 0)
        .map((group) => {
            const optionsHtml = group.options.map((option) => {
                flatOptions.push(option);
                return buildOptionHtml(option, flatOptions.length - 1);
            }).join('');
            return `
                ${group.header ? `<h3 class="phone-ios-group-header">${escapeHtml(group.header)}</h3>` : ''}
                <div class="phone-ios-group" role="listbox" aria-label="${escapeHtmlAttr(group.header || title)}">${optionsHtml}</div>
            `;
        }).join('');

    const sheet = showSettingsSheet({ title, subtitle, bodyHtml, footer, className, runtime });
    if (!sheet) return null;
    sheet.overlay.querySelectorAll('[data-option-index]').forEach((button) => {
        sheet.bind(button, 'click', () => {
            const option = flatOptions[Number(button.getAttribute('data-option-index'))];
            if (!option || option.disabled) return;
            sheet.close();
            if (!option.selected) onSelect?.(option.value, option);
        });
    });
    return sheet.close;
}

/**
 * 操作菜单：顶部说明 + 一组操作按钮 + 单独的「取消」。
 * captionHtml 由调用方负责转义。
 * @param {{ title: string, captionHtml?: string, actions: Array<{ label: string, danger?: boolean, onSelect: Function }>, runtime?: object }} config
 */
export function showSettingsActionSheet({ title = '', captionHtml = '', actions = [], className = '', runtime = null } = {}) {
    const titleId = nextLayerId('phone-settings-action-title');
    const items = actions.filter(action => action && action.label);
    const overlay = document.createElement('div');
    overlay.className = `phone-ios-layer${className ? ` ${className}` : ''}`;
    overlay.innerHTML = `
        <section class="phone-ios-action-sheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
            <div class="phone-ios-action-group">
                <div class="phone-ios-action-caption">
                    ${captionHtml}
                    <span id="${titleId}">${escapeHtml(title)}</span>
                </div>
                ${items.map((action, index) => `
                    <button type="button" class="phone-ios-action-btn${action.danger ? ' is-danger' : ''}" data-action-index="${index}">${escapeHtml(action.label)}</button>
                `).join('')}
            </div>
            <div class="phone-ios-action-group">
                <button type="button" class="phone-ios-action-btn is-cancel">${t`取消`}</button>
            </div>
        </section>
    `;

    const layer = mountSettingsLayer(overlay, runtime);
    if (!layer) return null;
    layer.bind(overlay.querySelector('.is-cancel'), 'click', layer.close);
    overlay.querySelectorAll('[data-action-index]').forEach((button) => {
        layer.bind(button, 'click', () => {
            const action = items[Number(button.getAttribute('data-action-index'))];
            layer.close();
            action?.onSelect?.();
        });
    });
    return layer.close;
}
