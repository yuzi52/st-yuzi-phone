import { t } from '../i18n/index.js';
function abortError() { return new DOMException(t("玉子美化模块加载已取消"), 'AbortError'); }

function awaitDeadline(promise, { signal, timeoutMs = 10000, onLateResolve } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        let settled = false;
        let timer = null;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
            callback(value);
        };
        const onAbort = () => finish(reject, abortError());
        signal?.addEventListener?.('abort', onAbort, { once: true });
        timer = setTimeout(() => finish(reject, new Error(t("玉子美化模块接入超时"))), timeoutMs);
        Promise.resolve(promise).then((value) => {
            if (settled) {
                try { onLateResolve?.(value); } catch {}
                return;
            }
            finish(resolve, value);
        }, error => finish(reject, error));
    });
}

export async function importContentPresetModule(options = {}) {
    const createObjectURL = options.createObjectURL || URL.createObjectURL;
    const revokeObjectURL = options.revokeObjectURL || URL.revokeObjectURL;
    const BlobCtor = options.BlobCtor || Blob;
    const importModule = options.importModule || (url => import(url));
    if (options.signal?.aborted) throw abortError();
    let url = '';
    try {
        url = createObjectURL(new BlobCtor([String(options.source || '')], { type: options.mimeType || 'text/javascript' }));
        const namespace = await awaitDeadline(importModule(url), options);
        if (options.requireMount !== false && typeof namespace?.mount !== 'function') throw new Error(t("玉子美化模块缺少 mount(context) 导出"));
        if (namespace.mount !== undefined && typeof namespace.mount !== 'function') throw new Error('mount 必须是函数');
        if (options.requireMount === false && namespace.parse !== undefined && typeof namespace.parse !== 'function') throw new Error('parse 必须是函数');
        let released = false;
        return Object.freeze({ mount: namespace.mount, parse: namespace.parse, disposeModuleUrl() { if (!released) { released = true; revokeObjectURL(url); } } });
    } catch (error) {
        if (url) revokeObjectURL(url);
        throw error;
    }
}

export async function invokeContentPresetMount(options = {}) {
    const outcome = await awaitDeadline(
        Promise.resolve().then(() => options.mount?.(options.context)),
        {
            ...options,
            onLateResolve: value => { if (typeof value === 'function') options.onLateDisposer?.(value); },
        },
    );
    return typeof outcome === 'function' ? outcome : null;
}
