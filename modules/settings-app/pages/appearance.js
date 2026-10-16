import { t, formatPhoneDateTime } from '../../i18n/index.js';
import { buildAppearancePageHtml } from '../layout/frame.js';
import { downloadTextFile } from '../services/media-upload.js';
import { showConfirmDialog } from '../ui/confirm-dialog.js';
import { bindSettingsGroupedControls } from '../ui/settings-controls.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { defaultSettings } from '../../settings.js';

// Kept at module scope so a full appearance-page rerender can prefill the repository UI before IndexedDB finishes listing packs.
// Repository structure changes must invalidate it before refreshRepositoryList() to avoid briefly showing removed or missing packs.
let cachedRepositoryListResult = null;

function createRuntimeBinder(runtime) {
    return runtime?.addEventListener
        ? runtime.addEventListener.bind(runtime)
        : (target, type, listener, options) => {
            if (!target || typeof target.addEventListener !== 'function') return () => {};
            target.addEventListener(type, listener, options);
            return () => target.removeEventListener(type, listener, options);
        };
}

function formatRepositoryBytes(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
}

function formatRepositoryTime(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return t("未知时间");
    try {
        return formatPhoneDateTime(value);
    } catch (_) {
        return t("未知时间");
    }
}

function normalizeRepositoryPackId(pack) {
    return String(pack?.id || '').trim();
}

function findRepositoryPackById(packs, packId) {
    const normalizedPackId = String(packId || '').trim();
    if (!normalizedPackId) return null;
    return packs.find(pack => normalizeRepositoryPackId(pack) === normalizedPackId) || null;
}

function getRepositoryPackMetaText(pack) {
    return t`${Number(pack?.wallpaperCount) || 0} 张背景 · ${Number(pack?.iconCount) || 0} 个图标 · ${formatRepositoryBytes(pack?.totalBytes)}`;
}

function renderAppearancePackRepositoryList(listEl, result, settings = {}, selectedPackId = '') {
    if (!listEl) return;
    if (!result?.success) {
        listEl.innerHTML = `<section class="phone-ios-group"><div class="phone-ios-row phone-ios-row-empty">${escapeHtml(result?.message || t("美化包仓库读取失败"))}</div></section>`;
        return;
    }

    const packs = Array.isArray(result.packs) ? result.packs : [];
    const activePackId = String(settings?.appearanceActivePackId || '').trim();
    if (!packs.length) {
        listEl.innerHTML = `<section class="phone-ios-group"><div class="phone-ios-row phone-ios-row-empty">${t("暂无美化包，请先导入。")}</div></section>`;
        return;
    }

    const selectedId = findRepositoryPackById(packs, selectedPackId)
        ? String(selectedPackId || '').trim()
        : normalizeRepositoryPackId(findRepositoryPackById(packs, activePackId) || packs[0]);
    const selectedPack = findRepositoryPackById(packs, selectedId) || packs[0];
    const selectedPackIdValue = normalizeRepositoryPackId(selectedPack);
    const selectedIsActive = !!selectedPackIdValue && selectedPackIdValue === activePackId;
    const selectedTitle = selectedPack?.name || selectedPack?.sourceFileName || t("未命名美化包");
    const selectedSourceFileName = selectedPack?.sourceFileName || '';
    const selectedMetaText = getRepositoryPackMetaText(selectedPack);

    const optionsHtml = packs.map((pack) => {
        const id = normalizeRepositoryPackId(pack);
        const isActive = id && id === activePackId;
        const title = pack?.name || pack?.sourceFileName || t("未命名美化包");
        const activeSuffix = '';
        const label = `${title}${activeSuffix}`;
        return `<option value="${escapeHtmlAttr(id)}" data-sub="${escapeHtmlAttr(getRepositoryPackMetaText(pack))}" data-badge="${isActive ? escapeHtmlAttr(t("使用中")) : ''}" ${id === selectedPackIdValue ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    // 分组卡片：包名 + 使用中标签 + 汇总副标题；切换走底部选择面板，原生 select 隐藏保留。
    listEl.innerHTML = `
        <section class="phone-ios-group">
            <div class="phone-ios-row phone-ios-pack-head phone-appearance-pack-repository-summary" data-selected-pack-id="${escapeHtmlAttr(selectedPackIdValue)}">
                <span class="phone-ios-row-label">
                    <span class="phone-ios-pack-title">${escapeHtml(selectedTitle)}</span>${selectedIsActive ? `<span class="phone-ios-badge">${t("使用中")}</span>` : ''}
                    <span class="phone-ios-row-sub">${escapeHtml(selectedMetaText)}</span>
                    ${selectedSourceFileName ? `<span class="phone-ios-row-sub">${escapeHtml(selectedSourceFileName)}</span>` : ''}
                </span>
            </div>
            <button type="button" class="phone-ios-row is-tappable" data-settings-select="phone-appearance-pack-select" aria-haspopup="dialog">
                <span class="phone-ios-row-label">${t`切换美化包`}</span>
                <span class="phone-ios-row-value"><span class="phone-ios-row-value-text">${escapeHtml(t`共 ${packs.length} 个`)}</span><span class="phone-ios-row-chevron" aria-hidden="true">›</span></span>
            </button>
            <select id="phone-appearance-pack-select" class="phone-settings-select" aria-label="${escapeHtmlAttr(t`选择美化包`)}" hidden>
                ${optionsHtml}
            </select>
            <button type="button" class="phone-ios-row is-action" data-action="apply-appearance-pack" data-pack-id="${escapeHtmlAttr(selectedPackIdValue)}" ${selectedIsActive ? 'disabled' : ''}>${selectedIsActive ? t`已应用` : t`应用此美化包`}</button>
            <button type="button" class="phone-ios-row is-action is-danger" data-action="delete-appearance-pack" data-pack-id="${escapeHtmlAttr(selectedPackIdValue)}" aria-haspopup="dialog">${t`删除此美化包`}</button>
        </section>
        <p class="phone-ios-group-footer">${t`更新时间：${escapeHtml(formatRepositoryTime(selectedPack?.updatedAt))}`}</p>
    `;
}

function bindAppearanceFontLibraryActions(ctx, runtime) {
    const { container, render, appearancePageService } = ctx;
    const selectEl = container.querySelector('#phone-font-select');
    const importBtn = container.querySelector('#phone-import-font-btn');
    const deleteBtn = container.querySelector('#phone-delete-font-btn');
    const fileInput = container.querySelector('#phone-font-file');
    const importUrlBtn = container.querySelector('#phone-import-font-url-btn');
    const urlNameInput = container.querySelector('#phone-font-url-name');
    const cssUrlInput = container.querySelector('#phone-font-css-url');
    const urlFamilyInput = container.querySelector('#phone-font-url-family');
    const showToast = typeof ctx.showToast === 'function'
        ? ctx.showToast
        : () => {};
    const rerenderKeepScroll = typeof ctx.rerenderAppearanceKeepScroll === 'function'
        ? ctx.rerenderAppearanceKeepScroll
        : render;
    const isDisposed = () => !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    const bindEvent = createRuntimeBinder(runtime);
    const cleanupFns = [];

    if (selectEl) {
        cleanupFns.push(bindEvent(selectEl, 'change', () => {
            const result = appearancePageService.selectAppearanceFont(selectEl.value);
            appearancePageService.applyAppearanceFontLibrary();
            showToast(container, result.message || (result.success ? t("字体已应用") : t("字体应用失败")), !result.success);
            rerenderKeepScroll();
        }));
    }

    if (importBtn && fileInput) {
        cleanupFns.push(bindEvent(importBtn, 'click', () => {
            fileInput.value = '';
            fileInput.click();
        }));

        cleanupFns.push(bindEvent(fileInput, 'change', async () => {
            const file = fileInput.files?.[0] || null;
            if (!file) return;
            const result = await appearancePageService.importAppearanceFontFile(file);
            if (isDisposed()) return;
            appearancePageService.applyAppearanceFontLibrary();
            showToast(container, result.message || (result.success ? t("字体已导入") : t("字体导入失败")), !result.success);
            if (result.success) {
                rerenderKeepScroll();
            }
        }));
    }

    if (importUrlBtn && urlNameInput && cssUrlInput && urlFamilyInput) {
        cleanupFns.push(bindEvent(importUrlBtn, 'click', () => {
            const name = urlNameInput.value || '';
            const cssUrl = cssUrlInput.value || '';
            const family = urlFamilyInput.value || '';

            if (!name.trim() || !cssUrl.trim() || !family.trim()) {
                showToast(container, t("请填写显示名称、字体 CSS URL 和字体族名"), true);
                return;
            }

            const result = appearancePageService.importAppearanceFontCssUrl({ name, cssUrl, family });
            if (isDisposed()) return;
            showToast(container, result.message || (result.success ? t("URL 字体已保存") : t("URL 字体保存失败")), !result.success);

            if (!result.success) {
                return;
            }

            appearancePageService.applyAppearanceFontLibrary();
            urlNameInput.value = '';
            cssUrlInput.value = '';
            urlFamilyInput.value = '';
            rerenderKeepScroll();
        }));
    }

    if (deleteBtn) {
        cleanupFns.push(bindEvent(deleteBtn, 'click', () => {
            const fontId = selectEl?.value || '';
            showConfirmDialog(
                container,
                t("删除当前字体？"),
                t("删除后将切换回系统默认字体，此操作无法撤销。"),
                () => {
                    if (isDisposed()) return;
                    const result = appearancePageService.deleteAppearanceFont(fontId);
                    appearancePageService.applyAppearanceFontLibrary();
                    showToast(container, result.message || (result.success ? t("字体已删除") : t("字体删除失败")), !result.success);
                    if (result.success) {
                        rerenderKeepScroll();
                    }
                },
                t("删除"),
                t("取消"),
                runtime,
            );
        }));
    }

    return () => {
        cleanupFns.forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
    };
}

function bindAppearanceResourcePackActions(ctx, runtime) {
    const { container, render, appearancePageService } = ctx;
    const importBtn = container.querySelector('#phone-import-appearance-pack');
    const exportBtn = container.querySelector('#phone-export-appearance-pack');
    const fileInput = container.querySelector('#phone-appearance-pack-file');
    const repositoryListEl = container.querySelector('#phone-appearance-pack-repository-list');
    const showToast = typeof ctx.showToast === 'function'
        ? ctx.showToast
        : () => {};
    const rerenderKeepScroll = typeof ctx.rerenderAppearanceKeepScroll === 'function'
        ? ctx.rerenderAppearanceKeepScroll
        : render;
    const isDisposed = () => !!(runtime && typeof runtime.isDisposed === 'function' && runtime.isDisposed());
    const bindEvent = createRuntimeBinder(runtime);
    const cleanupFns = [];

    const refreshRepositoryList = async () => {
        if (!repositoryListEl) return;
        const selectedPackId = repositoryListEl.querySelector('#phone-appearance-pack-select')?.value || '';
        if (cachedRepositoryListResult) {
            renderAppearancePackRepositoryList(
                repositoryListEl,
                cachedRepositoryListResult,
                appearancePageService.getPhoneSettings(),
                selectedPackId,
            );
        }
        try {
            const result = await appearancePageService.listAppearancePacks();
            if (isDisposed()) return;
            cachedRepositoryListResult = result;
            renderAppearancePackRepositoryList(repositoryListEl, result, appearancePageService.getPhoneSettings(), selectedPackId);
        } catch (error) {
            if (isDisposed()) return;
            const failureResult = {
                success: false,
                message: t`美化包仓库读取失败：${error?.message || t("未知错误")}`,
            };
            cachedRepositoryListResult = failureResult;
            renderAppearancePackRepositoryList(repositoryListEl, failureResult);
        }
    };

    refreshRepositoryList();

    if (importBtn && fileInput) {
        cleanupFns.push(bindEvent(importBtn, 'click', () => {
            fileInput.value = '';
            fileInput.click();
        }));

        cleanupFns.push(bindEvent(fileInput, 'change', () => {
            const file = fileInput.files?.[0] || null;
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async () => {
                if (isDisposed()) return;
                const content = typeof reader.result === 'string' ? reader.result : '';
                if (!content.trim()) {
                    showToast(container, t("导入失败：文件为空"), true);
                    return;
                }

                try {
                    const result = await appearancePageService.importAppearancePackToRepository(content, {
                        sourceFileName: file.name || '',
                    });
                    if (isDisposed()) return;
                    showToast(container, result.message || (result.success ? t("已保存到美化包仓库") : t("导入仓库失败")), !result.success);
                    if (result.success) {
                        cachedRepositoryListResult = null;
                        await refreshRepositoryList();
                    }
                } catch (error) {
                    if (isDisposed()) return;
                    showToast(container, t`导入仓库失败：${error?.message || t("未知错误")}`, true);
                }
            };
            reader.onerror = () => {
                if (isDisposed()) return;
                showToast(container, t("导入失败：无法读取文件"), true);
            };
            reader.readAsText(file, 'utf-8');
        }));
    }

    if (repositoryListEl) {
        cleanupFns.push(bindEvent(repositoryListEl, 'change', (event) => {
            const selectEl = event.target?.closest?.('#phone-appearance-pack-select') || null;
            if (!selectEl || !repositoryListEl.contains(selectEl) || !cachedRepositoryListResult) return;
            renderAppearancePackRepositoryList(
                repositoryListEl,
                cachedRepositoryListResult,
                appearancePageService.getPhoneSettings(),
                selectEl.value,
            );
        }));

        cleanupFns.push(bindEvent(repositoryListEl, 'click', async (event) => {
            const actionBtn = event.target?.closest?.('button[data-action][data-pack-id]') || null;
            if (!actionBtn || !repositoryListEl.contains(actionBtn)) return;

            const action = actionBtn.dataset.action || '';
            const packId = actionBtn.dataset.packId || '';
            if (!packId) return;

            if (action === 'apply-appearance-pack') {
                actionBtn.disabled = true;
                try {
                    const result = await appearancePageService.applyAppearancePackFromRepository(packId);
                    if (isDisposed()) return;
                    showToast(container, result.message || (result.success ? t("美化包已应用") : t("美化包应用失败")), !result.success);
                    if (result.success) {
                        rerenderKeepScroll();
                    } else {
                        await refreshRepositoryList();
                    }
                } catch (error) {
                    if (isDisposed()) return;
                    showToast(container, t`美化包应用失败：${error?.message || t("未知错误")}`, true);
                    await refreshRepositoryList();
                }
                return;
            }

            if (action === 'delete-appearance-pack') {
                showConfirmDialog(
                    container,
                    t("确认删除美化包？"),
                    t("删除仓库条目不会清空当前已应用的背景和图标。此操作只会移除仓库中的这个美化包。"),
                    async () => {
                        if (isDisposed()) return;
                        actionBtn.disabled = true;
                        cachedRepositoryListResult = null;
                        try {
                            const result = await appearancePageService.deleteAppearancePackFromRepository(packId);
                            if (isDisposed()) return;
                            showToast(container, result.message || (result.success ? t("美化包已删除") : t("美化包删除失败")), !result.success);
                            await refreshRepositoryList();
                        } catch (error) {
                            if (isDisposed()) return;
                            showToast(container, t`美化包删除失败：${error?.message || t("未知错误")}`, true);
                            await refreshRepositoryList();
                        }
                    },
                    t("删除"),
                    t("取消"),
                    runtime,
                );
            }
        }));
    }

    if (exportBtn) {
        cleanupFns.push(bindEvent(exportBtn, 'click', () => {
            const result = appearancePageService.exportAppearanceResourcePack({
                packName: t("玉子手机外观资源包"),
            });
            if (!result?.success || !result.pack) {
                showToast(container, t("导出失败：外观资源包生成失败"), true);
                return;
            }
            downloadTextFile(t("玉子手机外观资源包.json"), JSON.stringify(result.pack, null, 2), 'application/json');
            showToast(container, t("已导出当前外观资源包"));
        }));
    }

    return () => {
        cleanupFns.forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
    };
}

export function createAppearancePage(ctx) {
    return {
        mount() {
            renderAppearancePage(ctx);
        },
        update() {
            renderAppearancePage(ctx);
        },
        dispose() {},
    };
}

export function renderAppearancePage(ctx) {
    const {
        container,
        state,
        render,
        registerCleanup,
        pageRuntime,
        appearancePageService,
    } = ctx;
    const getLayoutValue = appearancePageService.getLayoutValue;
    const getPhoneSettings = appearancePageService.getPhoneSettings;
    const buildAppearanceAppCatalog = appearancePageService.buildAppearanceAppCatalog;
    const setupBgUpload = appearancePageService.setupBgUpload;
    const setupIconLayoutSettings = appearancePageService.setupIconLayoutSettings;
    const setupAppearanceToggles = appearancePageService.setupAppearanceToggles;
    const renderHiddenTableAppsList = appearancePageService.renderHiddenTableAppsList;
    const renderIconUploadList = appearancePageService.renderIconUploadList;
    const getAppearanceFontLibraryViewModel = appearancePageService.getAppearanceFontLibraryViewModel;
    const applyAppearanceFontLibrary = appearancePageService.applyAppearanceFontLibrary;
    const getReadableTextScalePercentValue = appearancePageService.getReadableTextScalePercentValue;
    const applyReadableTextScale = appearancePageService.applyReadableTextScale;
    const setupReadableTextScaleSettings = appearancePageService.setupReadableTextScaleSettings;
    const getHomeAppLabelColorModeValue = appearancePageService.getHomeAppLabelColorModeValue;
    const setupHomeAppLabelColorSettings = appearancePageService.setupHomeAppLabelColorSettings;
    const getPhoneThemeModeValue = appearancePageService.getPhoneThemeModeValue;
    const applyPhoneThemeMode = appearancePageService.applyPhoneThemeMode;
    const setupPhoneThemeModeSettings = appearancePageService.setupPhoneThemeModeSettings;

    const layoutValues = {
        appGridColumns: getLayoutValue('appGridColumns', defaultSettings.appGridColumns),
        appIconSize: getLayoutValue('appIconSize', defaultSettings.appIconSize),
        appIconRadius: getLayoutValue('appIconRadius', defaultSettings.appIconRadius),
        appGridGap: getLayoutValue('appGridGap', defaultSettings.appGridGap),
        dockIconSize: getLayoutValue('dockIconSize', defaultSettings.dockIconSize),
    };
    const appearanceAppCatalog = buildAppearanceAppCatalog();
    const iconSlots = appearanceAppCatalog.iconSlots;
    const visibilityItems = iconSlots.filter(item => item.type !== 'dock');

    container.innerHTML = buildAppearancePageHtml({
        layoutValues,
        hideTableCountBadge: !!getPhoneSettings().hideTableCountBadge,
        homeAppLabelColorMode: getHomeAppLabelColorModeValue(),
        phoneThemeMode: getPhoneThemeModeValue(),
        fontLibrary: getAppearanceFontLibraryViewModel(),
        readableTextScalePercent: getReadableTextScalePercentValue(),
    });
    applyAppearanceFontLibrary();
    applyPhoneThemeMode();
    applyReadableTextScale();

    // Async uploads and repository reads belong to this paint, not a later settings page.
    const runtime = pageRuntime?.getCurrentRuntime?.() || pageRuntime || null;
    const bindEvent = (target, type, listener, options) => {
        if (!runtime?.addEventListener) {
            return () => {};
        }
        return runtime.addEventListener(target, type, listener, options);
    };

    bindEvent(container.querySelector('#phone-language-select'), 'change', (event) => {
        const select = event.target;
        const previous = getPhoneSettings().phoneLanguage;
        // 语言重绘不提交其他表单草稿。仅恢复这个页面原有控件的值。
        const drafts = [...container.querySelectorAll('input[id], textarea[id], select[id]')]
            .filter(el => el.id !== 'phone-language-select' && el.type !== 'file')
            .map(el => ({ id: el.id, value: el.value, checked: el.checked }));
        if (!appearancePageService.savePhoneLanguage(select.value)) {
            select.value = previous;
            ctx.showToast(container, t('语言保存失败'), true);
            return;
        }
        ctx.rerenderAppearanceKeepScroll();
        for (const draft of drafts) {
            const el = container.querySelector('#' + draft.id);
            if (!el) continue;
            el.value = draft.value;
            if (typeof draft.checked === 'boolean') el.checked = draft.checked;
        }
        container.querySelector('[data-settings-select="phone-language-select"]')?.focus({ preventScroll: true });
    });

    bindEvent(container.querySelector('.phone-nav-back'), 'click', () => {
        state.mode = 'home';
        render();
    });

    if (runtime?.registerCleanup) {
        runtime.registerCleanup(bindSettingsGroupedControls(container, runtime));
        runtime.registerCleanup(setupBgUpload(container, { runtime }));
        runtime.registerCleanup(setupIconLayoutSettings(container));
        runtime.registerCleanup(setupAppearanceToggles(container));
        runtime.registerCleanup(renderHiddenTableAppsList(
            container.querySelector('#phone-hidden-table-apps'),
            { items: visibilityItems },
        ));
        runtime.registerCleanup(renderIconUploadList(
            container.querySelector('#phone-icon-upload-list'),
            { runtime, items: iconSlots },
        ));
        runtime.registerCleanup(bindAppearanceResourcePackActions(ctx, runtime));
        runtime.registerCleanup(bindAppearanceFontLibraryActions(ctx, runtime));
        runtime.registerCleanup(setupReadableTextScaleSettings(container));
        runtime.registerCleanup(setupHomeAppLabelColorSettings(container));
        runtime.registerCleanup(setupPhoneThemeModeSettings(container));
    } else if (typeof registerCleanup === 'function') {
        registerCleanup(bindSettingsGroupedControls(container, null));
        registerCleanup(setupBgUpload(container));
        registerCleanup(setupIconLayoutSettings(container));
        registerCleanup(setupAppearanceToggles(container));
        registerCleanup(renderHiddenTableAppsList(
            container.querySelector('#phone-hidden-table-apps'),
            { items: visibilityItems },
        ));
        registerCleanup(renderIconUploadList(
            container.querySelector('#phone-icon-upload-list'),
            { items: iconSlots },
        ));
        registerCleanup(bindAppearanceResourcePackActions(ctx, null));
        registerCleanup(bindAppearanceFontLibraryActions(ctx, null));
        registerCleanup(setupReadableTextScaleSettings(container));
        registerCleanup(setupHomeAppLabelColorSettings(container));
        registerCleanup(setupPhoneThemeModeSettings(container));
    }
}
