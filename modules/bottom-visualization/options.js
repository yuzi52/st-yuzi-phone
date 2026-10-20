import { getInlineMessageTarget, subscribeInlineMessageInvalidation } from '../integration/inline-message-bridge.js';
import { createContentPresetInlineInteractions } from '../content-presets/inline-interactions.js';
import { getAppearanceFontFamily } from '../settings-app/services/appearance-settings/font-library-service.js';
import { isManagedTauriTavernChatSurface } from '../integration/tauritavern-chat-surface.js';
import { createRuntimeScope } from '../runtime-manager.js';
import { getOptionTexts } from './view.js';
import { t } from '../i18n/index.js';

export function createBottomOptions(scope) {
    const interactions = createContentPresetInlineInteractions();
    let node = null, target = null, blocked = null, watcher = null;
    const sameMessage = (a, b) => a && b && a.chat === b.chat && a.message === b.message && a.swipeId === b.swipeId;
    function clear() { watcher?.dispose(); watcher = null; node?.remove(); node = null; }
    function invalidate() {
        // 只记住已展示过的消息；没插入选项的新消息不能被拉黑。
        blocked = target; clear();
    }
    scope.registerCleanup(clear);
    return {
        update(raw, settings) {
            if (scope.isDisposed()) return;
            if (!settings.bottomVisualization.optionsEnabled || isManagedTauriTavernChatSurface()) { clear(); return; }
            const latest = getInlineMessageTarget();
            if (!latest || sameMessage(latest, blocked)) { clear(); return; }
            const texts = getOptionTexts(raw);
            if (!texts.length) { clear(); return; }
            if (!node) {
                node = document.createElement('section'); node.className = 'yuzi-bottom-options';
                const runtime = watcher = createRuntimeScope('bottom-options');
                void subscribeInlineMessageInvalidation(() => { if (!runtime.isDisposed()) invalidate(); })
                    .then(dispose => runtime.registerCleanup(dispose));
                runtime.observeMutation(document.querySelector('#chat'), () => {
                    if (!node) return;
                    const latest = getInlineMessageTarget();
                    if (!sameMessage(latest, target) || latest?.element !== target?.element || latest?.text !== target?.text || !node.isConnected || latest.element.textContent !== target.domText) invalidate();
                }, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'mesid'] });
                node.addEventListener('click', event => {
                    const button = event.target.closest('button');
                    if (!button || !node?.contains(button)) return;
                    const composer = document.querySelector('#send_textarea');
                    interactions.appendToComposer((composer?.value ? '\n' : '') + button.textContent);
                });
            }
            node.setAttribute('aria-label', t('选项面板'));
            node.style.fontFamily = getAppearanceFontFamily();
            node.style.fontSize = `${13 * settings.phoneReadableTextScalePercent / 100}px`;
            node.lang = settings.phoneLanguage;
            node.replaceChildren(...texts.map(text => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; return button; }));
            target = { ...latest, domText: latest.element.textContent };
            latest.element.after(node);
        },
    };
}
