import { t } from '../i18n/index.js';
import { getPhoneSettings, savePhoneSetting, subscribePhoneSettingsUpdates, flushPhoneSettingsSave, waitForPhoneSettingsSave } from '../settings.js';
import { createRuntimeScope } from '../runtime-manager.js';
import { pickImageFiles, fileToDataUrl, loadImage } from '../settings-app/services/media-upload.js';
import { escapeHtml as html, escapeHtmlAttr as attr } from '../utils/dom-escape.js';
import { isBottomVisualizationSetting } from './settings.js';

export function openBottomSettings(owner) {
    const existing = document.querySelector('.yuzi-bottom-dialog');
    if (existing) { existing.focus(); return; }
    const scope = createRuntimeScope('bottom-visualization-settings');
    const releaseOwner = owner.registerCleanup(() => scope.dispose());
    scope.registerCleanup(releaseOwner);
    const dialog = document.createElement('dialog');
    dialog.className = 'yuzi-bottom-dialog';
    dialog.setAttribute('aria-labelledby', 'yuzi-bottom-settings-title');
    document.body.append(dialog);
    scope.registerCleanup(() => { dialog.close(); dialog.remove(); });
    let busy = false, error = '';
    function render() {
        if (scope.isDisposed()) return;
        const focused = dialog.querySelector(':focus')?.name;
        const settings = getPhoneSettings(), config = settings.bottomVisualization;
        const edge = config.position === 'edge';
        const select = (name, label, options) => `<label class="yuzi-bottom-setting"><span>${t(label)}</span><select name="${name}">${options.map(([value, title]) => `<option value="${value}" ${config[name] === value ? 'selected' : ''}>${t(title)}</option>`).join('')}</select></label>`;
        const range = (name, label, min, max, step, unit) => `<label class="yuzi-bottom-setting"><span>${t(label)} <output>${config[name]}${unit}</output></span><input name="${name}" aria-label="${attr(t(label))}" type="range" min="${min}" max="${max}" step="${step}" value="${config[name]}"></label>`;
        const image = (key, label) => `<div class="yuzi-bottom-setting" data-image="${key}"><span>${t(label)}<small>${settings[key] ? t('已设置') : t('未设置')}</small></span><div><button type="button" data-upload="${key}" ${busy ? 'disabled' : ''}>${t('导入')}</button><button type="button" data-clear="${key}" ${busy ? 'disabled' : ''}>${t('清除')}</button></div></div>`;
        dialog.lang = settings.phoneLanguage;
        dialog.style.fontSize = `${13 * settings.phoneReadableTextScalePercent / 100}px`;
        dialog.innerHTML = `<header><h2 id="yuzi-bottom-settings-title">${t('底部可视化')}</h2><button type="button" data-action="dismiss" aria-label="${t('关闭')}">×</button></header>
            ${select('position', '导航盘位置', [['flow', '悬浮底部'], ['fixed', '固定底部'], ['edge', '侧边栏']])}
            ${select('layout', '布局模式', [['vertical', '纵向滚动'], ['horizontal', '横向滚动']])}
            ${edge ? select('edgeSide', '侧边栏位置', [['left', '左侧'], ['right', '右侧']]) : `
                ${innerWidth >= 768 || config.position === 'fixed' ? select('desktopNav', innerWidth >= 768 ? 'PC 导航布局' : '导航布局', [['compact', '紧凑'], ['aligned', '对齐']]) : ''}
                ${innerWidth >= 768 ? select('region', '面板区域', [['chat', '对齐聊天'], ['viewport', '铺满浏览器'], ['side', '左右侧栏']]) + (config.region === 'side' ? select('side', '侧栏位置', [['left', '左侧'], ['right', '右侧']]) : '') : ''}`}
            ${select('optionsEnabled', '选项面板', [[false, '禁用'], [true, '启用']])}
            ${range('cardWidth', '卡片宽度', 200, 500, 10, 'px')}
            ${range('opacity', '透明度', 20, 100, 5, '%')}
            ${edge ? '' : image('bottomVisualizationNavImage', '导航盘背景图片')}
            ${image('bottomVisualizationPanelImage', edge ? '导入背景' : '面板背景图片')}
            <p class="yuzi-bottom-setting-error" role="status">${html(error)}</p>`;
        if (focused) dialog.querySelector(`[name="${focused}"]`)?.focus();
    }
    scope.registerCleanup(subscribePhoneSettingsUpdates(({ key } = {}) => {
        if (isBottomVisualizationSetting(key)) render();
    }));
    scope.addEventListener(window, 'resize', render);
    scope.addEventListener(dialog, 'change', event => {
        const { name, value, type } = event.target;
        if (!name) return;
        savePhoneSetting('bottomVisualization', { ...getPhoneSettings().bottomVisualization, [name]: name === 'optionsEnabled' ? value === 'true' : type === 'range' ? Number(value) : value });
    });
    scope.addEventListener(dialog, 'input', event => {
        if (event.target.type === 'range') event.target.closest('label').querySelector('output').textContent = event.target.value + (event.target.name === 'opacity' ? '%' : 'px');
    });
    async function saveImage(key, value) {
        const previous = getPhoneSettings()[key];
        busy = true; error = ''; render();
        try {
            if (!savePhoneSetting(key, value) || !flushPhoneSettingsSave() || !(await waitForPhoneSettingsSave())) {
                savePhoneSetting(key, previous);
                flushPhoneSettingsSave();
                throw new Error(t('图片保存失败，已保留原图'));
            }
        } catch (failure) { error = failure.message; }
        finally { busy = false; render(); }
    }
    scope.addEventListener(dialog, 'click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.action === 'dismiss') scope.dispose();
        if (busy) return;
        if (button.dataset.clear) void saveImage(button.dataset.clear, null);
        if (button.dataset.upload) {
            const key = button.dataset.upload;
            pickImageFiles(async ([record]) => {
                const value = await fileToDataUrl(record.file);
                await loadImage(value);
                if (!scope.isDisposed()) await saveImage(key, value);
            }, { multiple: false, maxSizeMB: 12, runtime: scope, onError(message) { error = message; render(); } });
        }
    });
    // 与 QQ 相同：只点遮罩才关闭。原生 dialog 的遮罩事件以 dialog 为 target，需排除内容矩形。
    let pressedBackdrop = false;
    const isBackdrop = event => {
        const rect = dialog.getBoundingClientRect();
        return event.target === dialog && (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom);
    };
    scope.addEventListener(dialog, 'pointerdown', event => { pressedBackdrop = event.button === 0 && isBackdrop(event); });
    scope.addEventListener(dialog, 'pointerup', event => {
        const dismiss = pressedBackdrop && isBackdrop(event);
        pressedBackdrop = false;
        if (dismiss) scope.dispose();
    });
    scope.addEventListener(dialog, 'pointercancel', () => { pressedBackdrop = false; });
    scope.addEventListener(dialog, 'cancel', event => { event.preventDefault(); scope.dispose(); });
    render(); dialog.showModal();
}
