import { t } from '../../../i18n/index.js';
import { createRuntimeScope } from '../../../runtime-manager.js';
import { clampNumber } from './core.js';

function imageFileRecord(file) {
    return Object.freeze({
        file,
        name: String(file?.name || ''),
        type: String(file?.type || ''),
        size: Number(file?.size) || 0,
    });
}

export function pickImageFiles(callback, options = {}) {
    const maxSizeMB = clampNumber(options.maxSizeMB, 1, 64, 8);
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const pageRuntime = options.runtime || options.pageRuntime || null;
    const owner = pageRuntime?.getCurrentRuntime ? pageRuntime.getCurrentRuntime() : pageRuntime;
    if (pageRuntime && (!owner || owner.isDisposed?.())) return;
    const runtime = createRuntimeScope('image-file-picker');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = options.multiple !== false;
    input.style.display = 'none';
    document.body.appendChild(input);

    const unregister = owner?.registerCleanup?.(runtime.dispose);
    runtime.registerCleanup(() => { unregister?.(); input.remove(); });
    runtime.addEventListener(input, 'cancel', runtime.dispose, { once: true });
    runtime.addEventListener(window, 'focus', () => {
        runtime.setTimeout(() => {
            if (!input.files?.length) runtime.dispose();
        }, 300);
    }, { once: true });
    runtime.addEventListener(input, 'change', async () => {
        try {
            if (runtime.isDisposed()) return;
            const files = [...(input.files || [])];
            if (!files.length) return;
            const invalidFile = files.find(file => !String(file.type || '').startsWith('image/'));
            if (invalidFile) throw new Error(t`${invalidFile.name || t("所选文件")}不是图片文件`);
            const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;
            const oversizedFile = files.find(file => Number(file.size) > maxBytes);
            if (oversizedFile) throw new Error(t`${oversizedFile.name || t("所选图片")}超过 ${maxSizeMB}MB`);
            await callback(Object.freeze(files.map(imageFileRecord)));
        } catch (error) {
            if (!runtime.isDisposed()) onError?.(error?.message || t("图片处理失败"));
        } finally {
            runtime.dispose();
        }
    }, { once: true });

    try { input.click(); }
    catch (error) { runtime.dispose(); throw error; }
    return runtime.dispose;
}
