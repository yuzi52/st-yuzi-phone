import { createRuntimeScope } from '../../runtime-manager.js';

const activeToasts = new WeakMap();

export function showToast(container, msg, isError = false, runtime = null) {
    const runtimeApi = createRuntimeScope('settings-toast');
    const mountRoot = container.closest('.phone-app-page') || container;
    const existing = mountRoot.querySelector('.phone-toast');
    if (existing) {
        activeToasts.get(existing)?.();
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `phone-toast ${isError ? 'phone-toast-error' : 'phone-toast-success'}`;
    toast.textContent = msg;
    mountRoot.appendChild(toast);
    const unregister = runtime?.registerCleanup?.(runtimeApi.dispose);
    runtimeApi.registerCleanup(() => {
        unregister?.();
        activeToasts.delete(toast);
        toast.remove();
    });
    activeToasts.set(toast, runtimeApi.dispose);

    runtimeApi.setTimeout(() => toast.classList.add('phone-toast-show'), 10);
    runtimeApi.setTimeout(() => {
        toast.classList.remove('phone-toast-show');
        runtimeApi.setTimeout(runtimeApi.dispose, 300);
    }, 2000);
}
