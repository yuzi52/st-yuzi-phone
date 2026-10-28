import { t } from '../../../i18n/index.js';
import { getPhoneSettings, savePhoneSetting } from '../../../settings.js';
import { createDebouncedTask } from '../../../runtime-manager.js';
import { clampNumber } from '../../../utils/object.js';
import { Logger } from '../../../error-handler.js';
import { showToast } from '../../ui/toast.js';

const logger = Logger.withScope({
    scope: 'settings-app/services/appearance-settings/readable-text-scale-settings',
    feature: 'settings-app',
});

const READABLE_TEXT_SCALE_SETTING_KEY = 'phoneReadableTextScalePercent';
const READABLE_TEXT_SCALE_MIN = 80;
const READABLE_TEXT_SCALE_MAX = 160;
const READABLE_TEXT_SCALE_DEFAULT = 100;
const PHONE_CONTAINER_ID = 'yuzi-phone-standalone';

function normalizeReadableTextScalePercent(value) {
    return clampNumber(value, READABLE_TEXT_SCALE_MIN, READABLE_TEXT_SCALE_MAX, READABLE_TEXT_SCALE_DEFAULT);
}

function resolvePhoneContainer(root = null) {
    if (typeof document === 'undefined') return null;

    if (root instanceof HTMLElement) {
        return root.id === PHONE_CONTAINER_ID
            ? root
            : root.querySelector(`#${PHONE_CONTAINER_ID}`);
    }

    return document.getElementById(PHONE_CONTAINER_ID);
}

export function getReadableTextScalePercentValue() {
    const settings = getPhoneSettings();
    return normalizeReadableTextScalePercent(settings?.[READABLE_TEXT_SCALE_SETTING_KEY]);
}

export function applyReadableTextScale(root = null, percent = getReadableTextScalePercentValue()) {
    const container = resolvePhoneContainer(root);
    if (!(container instanceof HTMLElement)) return false;

    const normalizedPercent = normalizeReadableTextScalePercent(percent);
    const scale = normalizedPercent / 100;
    container.style.setProperty('--yuzi-phone-readable-text-scale', String(scale));
    container.setAttribute('data-yuzi-phone-readable-text-scale', String(normalizedPercent));
    return true;
}

export function setupReadableTextScaleSettings(container) {
    const rangeInput = container?.querySelector?.('#phone-readable-text-scale-range');
    const numberInput = container?.querySelector?.('#phone-readable-text-scale-input');
    const valueLabel = container?.querySelector?.('#phone-readable-text-scale-value');

    if (!(rangeInput instanceof HTMLInputElement)) {
        return () => {};
    }

    const cleanups = [];
    const addCleanup = (cleanup) => {
        if (typeof cleanup === 'function') {
            cleanups.push(cleanup);
        }
    };
    const addListener = (target, type, listener, options) => {
        if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
            return;
        }
        target.addEventListener(type, listener, options);
        addCleanup(() => target.removeEventListener(type, listener, options));
    };
    const syncControls = (percent) => {
        const value = String(normalizeReadableTextScalePercent(percent));
        rangeInput.value = value;
        if (numberInput instanceof HTMLInputElement) {
            numberInput.value = value;
        }
        if (valueLabel instanceof HTMLElement) {
            valueLabel.textContent = `${value}%`;
        }
    };
    const saveScale = (raw) => {
        const value = normalizeReadableTextScalePercent(raw);
        savePhoneSetting(READABLE_TEXT_SCALE_SETTING_KEY, value);
        return value;
    };
    const debouncedSave = createDebouncedTask(saveScale, 220);
    addCleanup(() => debouncedSave.flush?.());

    syncControls(getReadableTextScalePercentValue());
    applyReadableTextScale(null, rangeInput.value);

    const handleInput = (event) => {
        const source = event?.target instanceof HTMLInputElement ? event.target : rangeInput;
        const value = normalizeReadableTextScalePercent(source.value);
        syncControls(value);
        applyReadableTextScale(null, value);
        debouncedSave(value);
    };

    const handleChange = (event) => {
        debouncedSave.cancel?.();
        const source = event?.target instanceof HTMLInputElement ? event.target : rangeInput;
        const value = saveScale(source.value);
        syncControls(value);
        applyReadableTextScale(null, value);
        showToast(container, t("主要内容字体大小已更新"));
    };

    addListener(rangeInput, 'input', handleInput);
    addListener(numberInput, 'input', handleInput);
    addListener(rangeInput, 'change', handleChange);
    addListener(numberInput, 'change', handleChange);

    return () => {
        const tasks = [...cleanups];
        cleanups.length = 0;
        tasks.reverse().forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                logger.warn('readable text scale cleanup 执行失败', error);
            }
        });
    };
}
