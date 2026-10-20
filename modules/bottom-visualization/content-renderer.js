import { getContentPresetIndexSnapshot, subscribeContentPresetIndex } from '../content-presets/index-state.js';
import { tryRenderContentPreset } from '../content-presets/renderer.js';
import { resolveTableNavigationTarget } from '../table-navigation/catalog.js';
import { mountBottomTheater } from '../phone-theater/bottom-renderer.js';

/**
 * Owns one open bottom content surface. A saved selection is read only on open;
 * package replacement/deletion is the sole index mutation that retires a live page.
 */
export function createBottomContentRenderer(container, options = {}) {
    let openedSheet = '', binding = null, rawData = null;
    let current = null, pending = null;
    let custom = false, waitingForIndex = false, disposed = false;
    const setCustom = value => { custom = value; container.dataset.beautified = String(value); };
    const disposeView = view => {
        view?.instance?.dispose();
        view?.theater?.dispose();
        view?.page?.remove();
    };
    const cancelPending = () => {
        const previous = pending; pending = null;
        disposeView(previous);
    };
    const commit = view => {
        options.onBeforeChange?.();
        const children = view ? [...view.page.children] : [];
        if (pending) children.push(pending.page);
        const previous = current; current = view;
        disposeView(previous);
        container.replaceChildren(...children);
        view?.page.remove();
        setCustom(!!view);
    };
    const fallback = view => {
        if (view !== current && view !== pending) return;
        if (view === pending) cancelPending();
        if (view.key === openedSheet) binding = null;
        commit(null);
        options.onChange?.();
    };
    const update = (sheetKey, raw) => {
        if (disposed) return false;
        rawData = raw;
        const key = sheetKey === 'review' ? '' : String(sheetKey || '');
        if (key === openedSheet) {
            if (current?.theater && current.key === key) {
                if (resolveTableNavigationTarget(raw, key)?.sceneId !== binding.sceneId) fallback(current);
                else { try { current.theater.update(raw); } catch { fallback(current); } }
            }
            return custom || !!pending;
        }
        cancelPending();
        openedSheet = key; binding = null; waitingForIndex = false;
        if (key && current?.key === key) { binding = current.binding; return custom; }
        if (!key) { commit(null); return false; }
        const index = getContentPresetIndexSnapshot();
        waitingForIndex = index.status === 'loading';
        if (waitingForIndex) return custom;
        binding = index.status === 'ready' ? index.bottomByTable.get(key) : null;
        if (!binding) { commit(null); return false; }
        const view = { key, binding, instance: null, theater: null, page: null };
        const isCurrent = () => !disposed && (current === view || pending === view) && container.isConnected;
        if (binding.kind === 'builtin') {
            commit(null);
            if (resolveTableNavigationTarget(raw, key)?.sceneId !== binding.sceneId) { binding = null; return false; }
            current = view; setCustom(true);
            try { view.theater = mountBottomTheater(container, key, binding.sceneId, raw, { isCurrent }); }
            catch { fallback(view); }
        } else {
            // Keep the displayed page alive, as QQ does while preparing a chat.
            // A connected, full-size stage also preserves author layout measurements.
            view.page = document.createElement('div');
            view.page.className = 'yuzi-bottom-content';
            view.page.dataset.beautified = 'true';
            view.page.dataset.staging = 'true';
            view.page.inert = true;
            view.page.setAttribute('aria-hidden', 'true');
            pending = view;
            container.append(view.page);
            void tryRenderContentPreset(view.page, { sheetKey: key, route: `table:${key}` }, {
                surface: 'bottom', binding, initialTableData: raw, isCurrent,
                importModule: options.importModule,
                onInstance: value => { view.instance = value; },
                onCommitted: () => {
                    if (!isCurrent() || pending !== view) return;
                    pending = null;
                    commit(view);
                    options.onChange?.();
                },
                originalRenderer: () => { if (isCurrent()) fallback(view); },
            }).then(handled => { if (!handled && isCurrent()) fallback(view); })
                .catch(() => { if (isCurrent()) fallback(view); });
        }
        return custom || !!pending;
    };
    const unsubscribe = subscribeContentPresetIndex(index => {
        if (disposed || !openedSheet) return;
        for (const view of [current, pending]) {
            if (view?.binding.presetId && index.changedPresetIds.includes(view.binding.presetId)) fallback(view);
        }
        if (waitingForIndex && index.status !== 'loading') {
            const key = openedSheet; openedSheet = '';
            update(key, rawData);
            options.onChange?.();
        }
    });
    return {
        update,
        get pending() { return !!pending || waitingForIndex; },
        dispose() {
            if (disposed) return;
            disposed = true; unsubscribe(); cancelPending(); commit(null);
        },
    };
}
