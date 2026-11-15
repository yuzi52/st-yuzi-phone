import { createApiPresetsPage } from '../pages/api-presets.js';
import { createAiInstructionPresetsPage } from '../pages/ai-instruction-presets.js';
import {
    buildAiInstructionPresetsPageContext,
    buildApiPresetsPageContext,
} from './page-context-builders.js';

export function createPresetPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;
    const apiPresetsContext = pageContexts.apiPresets || buildApiPresetsPageContext(deps);
    const aiInstructionPresetsContext = pageContexts.aiInstructionPresets || buildAiInstructionPresetsPageContext(deps);

    return {
        pages: {
            api_presets: {
                createPage() {
                    return createApiPresetsPage(apiPresetsContext);
                },
            },
            ai_instruction_presets: {
                createPage() {
                    return createAiInstructionPresetsPage(aiInstructionPresetsContext);
                },
            },
        },
    };
}
