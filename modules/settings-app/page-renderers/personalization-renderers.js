import { createInputShortcutsPage } from '../pages/input-shortcuts.js';
import { createLogsPage } from '../pages/logs.js';
import { createTtsPage } from '../pages/tts.js';
import { createBodyDialoguePage } from '../pages/body-dialogue.js';
import { createAppearancePage } from '../pages/appearance.js';
import { createButtonStylePage } from '../pages/button-style.js';
import { createHomePage } from '../pages/home.js';
import { createWorldbookReadingPage } from '../pages/worldbook-reading.js';
import { createImageGenerationPage } from '../pages/image-generation.js';
import { createFullscreenOverlayPage } from '../pages/fullscreen-overlay.js';
import {
    buildAppearancePageContext,
    buildButtonStylePageContext,
    buildFullscreenOverlayPageContext,
    buildHomePageContext,
    buildLogsPageContext,
    buildInputShortcutsPageContext,
    buildImageGenerationPageContext,
    buildWorldbookReadingPageContext,
} from './page-context-builders.js';

/**
 * @param {{
 *   deps?: import('../../../types').SettingsPageRendererGroupedDeps,
 *   pageContexts?: Record<string, any>,
 * } | import('../../../types').SettingsPageRendererGroupedDeps} rendererScope
 */
export function createPersonalizationPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;

    const inputShortcutsContext = pageContexts.inputShortcuts || buildInputShortcutsPageContext(deps);
    const logsContext = pageContexts.logs || buildLogsPageContext(deps);
    const homeContext = pageContexts.home || buildHomePageContext(deps);
    const appearanceContext = pageContexts.appearance || buildAppearancePageContext(deps);
    const buttonStyleContext = pageContexts.buttonStyle || buildButtonStylePageContext(deps);
    const worldbookReadingContext = pageContexts.worldbookReading || buildWorldbookReadingPageContext(deps);
    const imageGenerationContext = pageContexts.imageGeneration || buildImageGenerationPageContext(deps);
    const fullscreenOverlayContext = pageContexts.fullscreenOverlay || buildFullscreenOverlayPageContext(deps);

    return {
        pages: {
            body_dialogue: { createPage() { return createBodyDialoguePage(homeContext); } },
            input_shortcuts: { createPage() { return createInputShortcutsPage(inputShortcutsContext); } },
            logs: { createPage() { return createLogsPage(logsContext); } },
            home: {
                createPage() {
                    return createHomePage(homeContext);
                },
            },
            appearance: {
                createPage() {
                    return createAppearancePage(appearanceContext);
                },
            },
            tts: {
                createPage() { return createTtsPage(homeContext); },
            },
            button_style: {
                createPage() {
                    return createButtonStylePage(buttonStyleContext);
                },
            },
            worldbook_reading: {
                createPage() {
                    return createWorldbookReadingPage(worldbookReadingContext);
                },
            },
            image_generation: {
                createPage() {
                    return createImageGenerationPage(imageGenerationContext);
                },
            },
            fullscreen_overlay: {
                createPage() {
                    return createFullscreenOverlayPage(fullscreenOverlayContext);
                },
            },
        },
    };
}
