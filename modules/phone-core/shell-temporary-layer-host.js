let temporaryLayerHost = null;
let temporaryLayerHostRegistration = 0;
const activeLayerDisposers = new Set();

// Include the shell-managed Home background; non-phone callers keep their local container.
export function getPhoneOverlayMountRoot(container) {
    const appRoot = container?.matches?.('.phone-app-page')
        ? container
        : (container?.querySelector?.('.phone-app-page') || container?.closest?.('.phone-app-page') || container);
    return appRoot?.closest?.('.phone-page') || appRoot;
}

function removeFromHost(element) {
    if (!element?.parentNode || typeof element.parentNode.removeChild !== 'function') return;
    element.parentNode.removeChild(element);
}

export function registerPhoneTemporaryLayerHost(host) {
    clearPhoneTemporaryLayers();
    const registration = ++temporaryLayerHostRegistration;
    temporaryLayerHost = host || null;

    return () => {
        if (temporaryLayerHost !== host || temporaryLayerHostRegistration !== registration) return;
        resetPhoneTemporaryLayerHost();
    };
}

export function getPhoneTemporaryLayerHost() {
    return temporaryLayerHost;
}

export function mountPhoneTemporaryLayer(element, onClose = null) {
    if (!temporaryLayerHost || !element || typeof temporaryLayerHost.appendChild !== 'function') {
        return () => {};
    }

    temporaryLayerHost.appendChild(element);
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        activeLayerDisposers.delete(dispose);
        removeFromHost(element);
        onClose?.();
    };

    activeLayerDisposers.add(dispose);
    return dispose;
}

export function clearPhoneTemporaryLayers() {
    [...activeLayerDisposers].forEach((dispose) => dispose());

    while (temporaryLayerHost?.firstChild && typeof temporaryLayerHost.removeChild === 'function') {
        temporaryLayerHost.removeChild(temporaryLayerHost.firstChild);
    }
}

export function resetPhoneTemporaryLayerHost() {
    clearPhoneTemporaryLayers();
    temporaryLayerHost = null;
    temporaryLayerHostRegistration += 1;
}
