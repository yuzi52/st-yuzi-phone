import { t } from '../../i18n/index.js';
import { downloadTextFile } from '../../settings-app/services/media-upload.js';
import { createRuntimeScope } from '../../runtime-manager.js';

export function downloadJsonPack(filename, pack) {
    downloadTextFile(
        filename,
        JSON.stringify(pack, null, 2),
        'application/json',
    );
}

export function pickJsonPackFile(callback, options = {}) {
    const runtime = createRuntimeScope('json-pack-picker');
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    document.body.append(input);

    const unregister = options.runtime?.registerCleanup?.(runtime.dispose);
    runtime.registerCleanup(() => { unregister?.(); input.remove(); });
    runtime.addEventListener(input, 'cancel', runtime.dispose, { once: true });
    runtime.addEventListener(input, 'change', async () => {
        const file = input.files?.[0];
        if (!file) {
            runtime.dispose();
            return;
        }
        try {
            if (options.maxBytes && file.size > options.maxBytes) throw new Error(t`文件不能超过 ${Math.round(options.maxBytes / 1024 / 1024)}MB`);
            const source = await file.text();
            if (runtime.isDisposed()) return;
            if (!source.trim()) throw new Error(t("导入文件为空"));
            await callback(source, Object.freeze({ name: String(file.name || '') }));
        } catch (error) {
            if (!runtime.isDisposed()) onError?.(error?.message || t("读取导入文件失败"));
        } finally {
            runtime.dispose();
        }
    }, { once: true });
    input.click();
    return runtime.dispose;
}
