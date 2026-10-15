import { t } from '../../../i18n/index.js';
import {
    clampNumber,
    estimateBase64Bytes,
    fileToDataUrl,
} from './core.js';
import {
    compressDataUrl,
    openImageCropDialog,
} from './crop.js';

export function pickImageFile(callback, options = {}) {
    const maxSizeMB = clampNumber(options.maxSizeMB, 1, 64, 8);
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
    const compress = options.compress !== false;
    const maxWidth = clampNumber(options.maxWidth, 128, 4096, 1440);
    const maxHeight = clampNumber(options.maxHeight, 128, 4096, 1440);
    const quality = clampNumber(options.quality, 0.5, 0.92, 0.82);
    const runtime = options.runtime || options.pageRuntime || null;
    const skipCrop = options.skipCrop === true;
    const isDisposed = () => !!runtime?.isDisposed?.();

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
        try {
            input.remove();
        } catch {}
    };

    const addListener = runtime?.addEventListener
        ? (...args) => runtime.addEventListener(...args)
        : (target, type, handler, listenerOptions) => {
            target.addEventListener(type, handler, listenerOptions);
            return () => target.removeEventListener(type, handler, listenerOptions);
        };
    runtime?.registerCleanup?.(cleanup);

    addListener(input, 'change', async () => {
        const file = input.files?.[0];
        if (!file) {
            cleanup();
            if (!isDisposed()) onCancel?.();
            return;
        }

        if (!String(file.type || '').startsWith('image/')) {
            onError?.(t("请选择图片文件"));
            cleanup();
            return;
        }

        const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;
        if (Number(file.size) > maxBytes * 1.8) {
            onError?.(t`图片过大（>${(maxSizeMB * 1.8).toFixed(1)}MB），请压缩后重试`);
            cleanup();
            return;
        }

        try {
            const rawDataUrl = await fileToDataUrl(file);
            if (isDisposed()) return;
            if (!rawDataUrl) {
                onError?.(t("图片读取失败"));
                cleanup();
                return;
            }

            const croppedDataUrl = skipCrop
                ? rawDataUrl
                : await openImageCropDialog(rawDataUrl, options);
            if (isDisposed()) return;
            if (!croppedDataUrl) {
                cleanup();
                onCancel?.();
                return;
            }

            const best = compress
                ? await (async () => {
                    const compressed = await compressDataUrl(croppedDataUrl, {
                        maxWidth,
                        maxHeight,
                        quality,
                    });
                    if (isDisposed()) return null;
                    return estimateBase64Bytes(compressed) <= estimateBase64Bytes(croppedDataUrl)
                        ? compressed
                        : croppedDataUrl;
                })()
                : croppedDataUrl;

            if (isDisposed()) return;
            if (estimateBase64Bytes(best) > maxBytes) {
                onError?.(compress
                    ? t`图片裁剪压缩后仍超过 ${maxSizeMB}MB，请缩小裁剪范围或换更小图片`
                    : t`图片裁剪后超过 ${maxSizeMB}MB，请缩小裁剪范围或换更小图片`);
                cleanup();
                return;
            }

            await Promise.resolve(callback(best, Object.freeze({
                file,
                name: String(file.name || ''),
                type: String(file.type || ''),
                size: Number(file.size) || 0,
            })));
        } catch (error) {
            onError?.(error?.message || t("图片处理失败"));
        } finally {
            cleanup();
        }
    });

    addListener(input, 'cancel', () => { cleanup(); if (!isDisposed()) onCancel?.(); });
    input.click();
}
