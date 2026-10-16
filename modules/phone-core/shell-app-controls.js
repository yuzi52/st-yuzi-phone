import { t } from '../i18n/index.js';
import { registerPhoneTemporaryLayerHost } from './shell-temporary-layer-host.js';

const BOTTOM_BAR_SELECTOR = '[data-phone-bottom-bar]';
const HOME_REGION_BACKGROUND_PROPERTY = '--yuzi-phone-home-region-background';

function isHomeRoute(route) {
    return String(route || '').trim() === 'home';
}

function getCurrentPage(screen) {
    const pages = Array.from(screen?.children || []).filter((child) => (
        child?.classList?.contains?.('phone-page')
        && child.getAttribute?.('aria-hidden') !== 'true'
        && !child.classList.contains('phone-page-exit')
        && !child.classList.contains('phone-page-exit-back')
    ));
    return pages[pages.length - 1] || null;
}

function getComputedStyleFor(element) {
    const view = element?.ownerDocument?.defaultView;
    const readStyle = view?.getComputedStyle || globalThis.getComputedStyle;
    return typeof readStyle === 'function' ? readStyle.call(view || globalThis, element) : null;
}

function isVisibleWithinPage(element, page) {
    for (let current = element; current; current = current.parentElement || current.parentNode) {
        if (current.hidden || current.getAttribute?.('aria-hidden') === 'true') return false;

        const style = getComputedStyleFor(current);
        if (style?.display === 'none'
            || style?.visibility === 'hidden'
            || style?.visibility === 'collapse'
            || style?.pointerEvents === 'none') {
            return false;
        }

        if (current === page) return true;
    }
    return false;
}

function findVisibleBottomBar(page) {
    if (!page) return null;

    return Array.from(page.querySelectorAll?.(BOTTOM_BAR_SELECTOR) || [])
        .find((bar) => isVisibleWithinPage(bar, page)) || null;
}

function getBottomBarBackground(bottomBar) {
    const style = getComputedStyleFor(bottomBar);
    if (!style) return '';

    if (style.backgroundImage && style.backgroundImage !== 'none') {
        return String(style.background || '').trim();
    }

    const backgroundColor = String(style.backgroundColor || '').trim();
    return backgroundColor === 'transparent' ? '' : backgroundColor;
}

function isComposerStyleMutation(mutation) {
    if (mutation?.type !== 'attributes' || mutation.attributeName !== 'style') {
        return false;
    }

    const target = mutation.target;
    return String(target?.tagName || '').toLowerCase() === 'textarea'
        || target?.classList?.contains?.('yuzi-qq-composer-input');
}

function shouldRefreshForMutations(mutations, screen, root) {
    const records = Array.from(mutations || []);
    const containsBottomBar = node => node?.matches?.(BOTTOM_BAR_SELECTOR)
        || !!node?.querySelector?.(BOTTOM_BAR_SELECTOR);
    return records.length === 0 || records.some((mutation) => {
        if (isComposerStyleMutation(mutation)) return false;
        if (mutation.target === screen || mutation.target === root) return true;
        if (mutation.target?.tagName === 'STYLE') return true;
        if (mutation.type === 'attributes') {
            return mutation.attributeName === 'data-phone-bottom-bar'
                || mutation.target?.classList?.contains?.('phone-page')
                || containsBottomBar(mutation.target);
        }
        return [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])]
            .some(node => node?.tagName === 'STYLE' || containsBottomBar(node));
    });
}

export function bindPhoneShellAppControls(root, {
    getCurrentRoute = () => 'home',
    navigateTo = () => {},
} = {}) {
    const indicator = root?.querySelector?.('[data-yuzi-phone-home-indicator]') || null;
    const shell = root?.querySelector?.('.yuzi-phone-shell') || null;
    const screen = root?.querySelector?.('.yuzi-phone-screen') || null;
    const temporaryLayerHost = root?.querySelector?.('[data-yuzi-phone-temporary-layer-host]') || null;
    const unregisterTemporaryLayerHost = registerPhoneTemporaryLayerHost(temporaryLayerHost);
    const view = root?.ownerDocument?.defaultView || globalThis.window;

    const refresh = () => {
        if (!indicator) return;
        const page = getCurrentPage(screen);
        const committedRoute = page?.dataset?.yuziPhoneRoute;
        const hidden = isHomeRoute(committedRoute || getCurrentRoute());
        const bottomBar = hidden ? null : findVisibleBottomBar(page);
        const layout = bottomBar ? 'docked' : 'floating';
        indicator.hidden = hidden;
        indicator.setAttribute?.('aria-hidden', String(hidden));
        indicator.setAttribute?.('aria-label', t('返回手机主页'));
        indicator.tabIndex = hidden ? -1 : 0;
        shell?.setAttribute?.('data-yuzi-phone-home-indicator-layout', layout);
        if (page?.getAttribute?.('data-yuzi-phone-bottom-bar') !== layout) {
            page?.setAttribute?.('data-yuzi-phone-bottom-bar', layout);
        }

        const background = bottomBar ? getBottomBarBackground(bottomBar) : '';
        // Keep the safe-area surface local to the page instead of resizing the screen.
        if (page?.style?.getPropertyValue?.(HOME_REGION_BACKGROUND_PROPERTY) !== background) {
            if (background) page?.style?.setProperty?.(HOME_REGION_BACKGROUND_PROPERTY, background);
            else page?.style?.removeProperty?.(HOME_REGION_BACKGROUND_PROPERTY);
        }
    };

    let refreshFrameId = null;
    const requestFrame = typeof view?.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame.bind(view)
        : null;
    const cancelFrame = typeof view?.cancelAnimationFrame === 'function'
        ? view.cancelAnimationFrame.bind(view)
        : null;
    const scheduleRefresh = () => {
        if (!requestFrame) {
            refresh();
            return;
        }
        if (refreshFrameId !== null) return;
        refreshFrameId = requestFrame(() => {
            refreshFrameId = null;
            refresh();
        });
    };

    const onIndicatorClick = (event) => {
        event?.preventDefault?.();
        if (isHomeRoute(getCurrentRoute())) return;
        navigateTo('home');
    };

    indicator?.addEventListener?.('click', onIndicatorClick);
    const MutationObserverClass = view?.MutationObserver || globalThis.MutationObserver;
    const observer = screen && typeof MutationObserverClass === 'function'
        ? new MutationObserverClass((mutations) => {
            if (shouldRefreshForMutations(mutations, screen, root)) scheduleRefresh();
        })
        : null;
    observer?.observe?.(screen, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'class', 'hidden', 'style', 'data-phone-bottom-bar'],
    });
    if (root && root !== screen) {
        observer?.observe?.(root, {
            attributes: true,
            attributeFilter: ['data-yuzi-phone-theme', 'lang'],
        });
    }
    view?.addEventListener?.('resize', scheduleRefresh);
    refresh();

    return {
        refresh,
        dispose() {
            indicator?.removeEventListener?.('click', onIndicatorClick);
            observer?.disconnect?.();
            if (refreshFrameId !== null) {
                cancelFrame?.(refreshFrameId);
                refreshFrameId = null;
            }
            view?.removeEventListener?.('resize', scheduleRefresh);
            unregisterTemporaryLayerHost();
        },
    };
}
