import { t } from '../../i18n/index.js';
import { escapeHtml } from '../../utils/dom-escape.js';
import { createRuntimeScope } from '../../runtime-manager.js';

const activeDialogs = new WeakMap();

function normalizeClassTokens(value) {
    if (Array.isArray(value)) {
        return value.flatMap(normalizeClassTokens);
    }
    if (typeof value !== 'string') return [];
    return value
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

/**
 * 显示确认弹窗
 * @param {HTMLElement} container 容器
 * @param {string} title 标题
 * @param {string} message 消息
 * @param {Function} onConfirm 确认回调
 * @param {string} confirmText 确认按钮文字
 * @param {string} cancelText 取消按钮文字
 * @param {Object} runtime 可选 runtime scope
 * @param {Object} options 可选弹窗配置
 * @param {string|string[]} options.overlayClassName overlay 额外 class
 * @param {Function} options.onCancel 取消回调
 * @param {HTMLElement} options.content 可选附加控件，复用现有设置样式
 * @returns {{ close: Function }} 立即关闭并释放资源
 */
export function showConfirmDialog(container, title, message, onConfirm, confirmText = t("确认"), cancelText = t("取消"), runtime = null, options = {}) {
    const runtimeApi = createRuntimeScope('settings-confirm-dialog');
    const candidateMountRoot = container.matches('.phone-app-page')
        ? container
        : (container.querySelector('.phone-app-page') || container.closest('.phone-app-page') || container);
    const mountRoot = candidateMountRoot instanceof HTMLElement ? candidateMountRoot : container;
    const existing = mountRoot.querySelector('.phone-confirm-dialog-overlay');
    if (existing) {
        activeDialogs.get(existing)?.();
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'phone-confirm-dialog-overlay';
    normalizeClassTokens(options?.overlayClassName).forEach(className => overlay.classList.add(className));
    overlay.innerHTML = `
        <div class="phone-confirm-dialog">
            <div class="phone-confirm-dialog-title">${escapeHtml(title)}</div>
            <div class="phone-confirm-dialog-message">${escapeHtml(message)}</div>
            <div class="phone-confirm-dialog-buttons">
                ${options?.hideCancel ? '' : `<button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-cancel">${escapeHtml(cancelText)}</button>`}
                <button type="button" class="phone-confirm-dialog-btn phone-confirm-dialog-confirm">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;
    if (options.content instanceof HTMLElement) {
        overlay.querySelector('.phone-confirm-dialog-buttons').before(options.content);
    }

    let closing = false;
    const closeDialog = () => {
        if (closing || runtimeApi.isDisposed()) return false;
        closing = true;
        overlay.classList.remove('phone-confirm-dialog-show');
        runtimeApi.setTimeout(runtimeApi.dispose, 200);
        return true;
    };

    runtimeApi.addEventListener(overlay.querySelector('.phone-confirm-dialog-cancel'), 'click', () => {
        if (closeDialog()) options?.onCancel?.();
    });
    runtimeApi.addEventListener(overlay.querySelector('.phone-confirm-dialog-confirm'), 'click', () => {
        if (closeDialog()) onConfirm?.();
    });
    const unregister = runtime?.registerCleanup?.(runtimeApi.dispose);
    runtimeApi.registerCleanup(() => {
        unregister?.();
        activeDialogs.delete(overlay);
        overlay.remove();
    });
    activeDialogs.set(overlay, runtimeApi.dispose);

    mountRoot.appendChild(overlay);
    runtimeApi.setTimeout(() => { if (!closing) overlay.classList.add('phone-confirm-dialog-show'); }, 10);
    return { close: runtimeApi.dispose };
}

export function showAlertDialog(container, title, message, confirmText = t("知道了"), runtime = null, options = {}) {
    showConfirmDialog(container, title, message, null, confirmText, '', runtime, { ...options, hideCancel: true });
}
