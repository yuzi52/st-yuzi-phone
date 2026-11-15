import { createBeautifyTemplatePage } from '../pages/beautify.js';
import { buildBeautifyTemplatePageContext } from './page-context-builders.js';

export function createEditorPageRenderers(rendererScope = {}) {
    const pageContexts = rendererScope?.pageContexts && typeof rendererScope.pageContexts === 'object'
        ? rendererScope.pageContexts
        : {};
    const deps = rendererScope?.deps && typeof rendererScope.deps === 'object'
        ? rendererScope.deps
        : rendererScope;
    const beautifyTemplateContext = pageContexts.beautifyTemplate || buildBeautifyTemplatePageContext(deps);

    return {
        pages: {
            beautify: {
                createPage() {
                    return createBeautifyTemplatePage(beautifyTemplateContext);
                },
            },
        },
    };
}
