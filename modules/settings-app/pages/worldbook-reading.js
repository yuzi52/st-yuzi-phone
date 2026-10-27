import { t } from '../../i18n/index.js';
import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildSettingsPageFrame } from '../layout/primitives.js';
import { createRuntimeScrollPreserver } from '../../ui-runtime/scroll-preserver-core.js';

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function entryTitle(entry) {
    const value = entry?.value && typeof entry.value === 'object' ? entry.value : {};
    return String(value.comment ?? value.name ?? '').trim() || t`条目 ${entry?.ref?.uid ?? ''}`;
}

function sourceLabel(sourceRole) {
    return sourceRole === 'primary' ? t("主世界书") : t("附加世界书");
}

function buildEntryHtml(entry, blockedKeywords) {
    const bookName = String(entry?.ref?.bookName ?? '').trim();
    const uid = String(entry?.ref?.uid ?? '').trim();
    const enabled = entry?.enabled === true;
    const selected = enabled && entry?.selected === true;
    const comment = String(entry?.value?.comment || entry?.value?.name || '');
    const blocked = enabled && blockedKeywords.some((keyword) => comment.includes(keyword));
    const badge = !enabled ? t("已禁用") : blocked ? t("已排除") : '';
    return `
        <label class="phone-ios-row${enabled ? '' : ' is-disabled'}">
            <span class="phone-ios-row-label">
                <span class="phone-ios-row-title">${escapeHtml(entryTitle(entry))}</span>
                <span class="phone-ios-row-sub">${escapeHtml(`${bookName} · ${sourceLabel(entry?.sourceRole)}`)}</span>
            </span>
            ${badge ? `<span class="phone-ios-badge is-muted">${escapeHtml(badge)}</span>` : ''}
            <span class="phone-ios-switch">
                <input type="checkbox" class="phone-worldbook-reading-entry-checkbox"
                    data-worldbook="${escapeHtmlAttr(bookName)}" data-uid="${escapeHtmlAttr(uid)}"
                    aria-label="${escapeHtmlAttr(`${entryTitle(entry)} · ${bookName}`)}"
                    ${enabled ? '' : 'disabled'} ${selected ? 'checked' : ''}>
                <span class="phone-ios-switch-track" aria-hidden="true"></span>
            </span>
        </label>
    `;
}

function blockedKeywordsText(pageState = {}) {
    return asArray(pageState?.snapshot?.blockedKeywords).join('\n');
}

function buildWorldbookReadingView(pageState = {}) {
    const entries = asArray(pageState?.snapshot?.entries);
    const blockedKeywords = asArray(pageState?.snapshot?.blockedKeywords);
    const query = String(pageState.query ?? '').trim();
    const normalizedQuery = query.toLocaleLowerCase();
    const filteredEntries = normalizedQuery
        ? entries.filter((entry) => [
            entryTitle(entry),
            entry?.ref?.bookName,
            entry?.ref?.uid,
        ].some((value) => String(value ?? '').toLocaleLowerCase().includes(normalizedQuery)))
        : entries;
    const enabledEntries = entries.filter((entry) => entry?.enabled === true);
    const selectedCount = enabledEntries.filter((entry) => entry?.selected === true).length;
    let entriesHtml = filteredEntries.length > 0
        ? filteredEntries.map((entry) => buildEntryHtml(entry, blockedKeywords)).join('')
        : `<div class="phone-ios-row phone-ios-row-empty phone-worldbook-empty">${query ? t("未找到匹配的条目") : t("当前角色没有可读取的世界书条目")}</div>`;
    if (pageState.loading === true) {
        entriesHtml = `<div class="phone-ios-row phone-ios-row-empty phone-worldbook-loading" role="status">${t("正在读取角色世界书...")}</div>`;
    } else if (String(pageState.error ?? '').trim()) {
        entriesHtml = `<div class="phone-ios-row phone-ios-row-empty is-danger phone-worldbook-error" role="alert">${escapeHtml(pageState.error)}</div>`;
    }
    return {
        query,
        entriesHtml,
        statusText: t`已选择 ${selectedCount}/${enabledEntries.length} 个未禁用条目`,
    };
}

export function buildWorldbookReadingPageHtml(pageState = {}) {
    const { query, entriesHtml, statusText } = buildWorldbookReadingView(pageState);
    const bodyHtml = `
        <h2 class="phone-ios-group-header">${t("自动排除关键词")}</h2>
        <section class="phone-ios-group">
            <div class="phone-ios-row is-block">
                <label class="phone-ios-field-label" for="phone-worldbook-reading-blocked-keywords">${t("关键词（每行一个）")}</label>
                <textarea id="phone-worldbook-reading-blocked-keywords" class="phone-ios-field" rows="6" spellcheck="false" placeholder="${t`例如：MVU`}">${escapeHtml(blockedKeywordsText(pageState))}</textarea>
            </div>
            <button type="button" class="phone-ios-row is-action" id="phone-worldbook-reading-blocked-keywords-save">${t`保存排除词`}</button>
        </section>
        <p class="phone-ios-group-footer">${t("条目 comment 包含任一关键词时自动取消勾选；不检查条目正文。每行一个关键词。")}</p>

        <h2 class="phone-ios-group-header">${t("条目范围")}</h2>
        <label class="phone-ios-search-row">
            <input type="search" id="phone-worldbook-reading-search" class="phone-ios-field" value="${escapeHtmlAttr(query)}" aria-label="${t`搜索条目`}" placeholder="${t`输入条目名、书名或 UID`}" autocomplete="off">
        </label>
        <section class="phone-ios-group">
            <div class="phone-ios-row phone-worldbook-reading-summary">
                <span id="phone-worldbook-reading-status" class="phone-ios-row-label" aria-live="polite">${statusText}</span>
                <div class="phone-ios-row-actions">
                    <button type="button" class="phone-ios-mini-btn" id="phone-worldbook-reading-select-all">${t`全选`}</button>
                    <button type="button" class="phone-ios-mini-btn" id="phone-worldbook-reading-deselect-all">${t`取消全选`}</button>
                </div>
            </div>
        </section>
        <section class="phone-ios-group is-scrollable" id="phone-worldbook-reading-entries" aria-label="${t`世界书条目`}">${entriesHtml}</section>
        <p class="phone-ios-group-footer">${t("默认读取当前角色主世界书和附加世界书中的所有未禁用条目。")}</p>
    `;
    return buildSettingsPageFrame({
        title: t("读取世界书"),
        bodyClass: 'phone-app-body phone-settings-scroll phone-settings-open phone-ios-grouped-page',
        rightActionHtml: `<button type="button" class="phone-settings-btn phone-settings-btn-ghost phone-settings-nav-action" id="phone-worldbook-reading-refresh">${t("刷新")}</button>`,
        bodyHtml,
    });
}

function createWorldbookReadingSession(ctx, paint, paintFilter) {
    const pageState = {
        query: '',
        loading: true,
        error: '',
        snapshot: { books: [], entries: [], issues: [] },
    };
    let active = false;
    let loadGeneration = 0;
    let lifecycleEpoch = 0;
    let unsubscribe = null;

    const isCurrentLoad = token => active && token === loadGeneration;
    const repaint = () => {
        if (!active) return;
        if (typeof ctx.rerenderWorldbookReadingKeepScroll === 'function') {
            ctx.rerenderWorldbookReadingKeepScroll();
            return;
        }
        paint();
    };
    const load = async (showLoading = true) => {
        const token = ++loadGeneration;
        pageState.loading = true;
        pageState.error = '';
        if (showLoading) repaint();
        try {
            const snapshot = await ctx.worldbookReadingCatalog.load();
            if (!isCurrentLoad(token)) return false;
            pageState.snapshot = snapshot && typeof snapshot === 'object'
                ? snapshot
                : { books: [], entries: [], issues: [] };
            pageState.loading = false;
            repaint();
            return true;
        } catch (error) {
            if (!isCurrentLoad(token)) return false;
            pageState.loading = false;
            pageState.error = String(error?.message || t("读取世界书失败"));
            repaint();
            return false;
        }
    };

    const setBlockedKeywords = async (value) => {
        if (!active) return false;
        try {
            await ctx.worldbookReadingCatalog.setBlockedKeywords(value);
        } catch (error) {
            if (!active) return false;
            pageState.error = String(error?.message || t("保存世界书自动排除关键词失败"));
            repaint();
            return false;
        }
        if (!active) return false;
        return load(false);
    };

    const setSelected = async (refs, selected) => {
        if (!active) return false;
        try {
            await ctx.worldbookReadingCatalog.setSelected(refs, selected);
        } catch (error) {
            if (!active) return false;
            pageState.error = String(error?.message || t("保存世界书读取选择失败"));
            repaint();
            return false;
        }
        if (!active) return false;
        return load(false);
    };

    const subscribe = async () => {
        const token = lifecycleEpoch;
        const dispose = await ctx.worldbookReadingCatalog.subscribe(() => {
            if (active) void load(false);
        });
        if (!active || token !== lifecycleEpoch) {
            if (typeof dispose === 'function') dispose();
            return;
        }
        unsubscribe = typeof dispose === 'function' ? dispose : null;
    };

    return {
        pageState,
        activate() {
            active = true;
            lifecycleEpoch += 1;
        },
        deactivate() {
            active = false;
            loadGeneration += 1;
            lifecycleEpoch += 1;
            if (typeof unsubscribe === 'function') unsubscribe();
            unsubscribe = null;
        },
        load,
        setBlockedKeywords,
        setSelected,
        subscribe,
        setQuery(query) {
            pageState.query = String(query ?? '');
            paintFilter();
        },
        visibleEnabledRefs() {
            const query = pageState.query.trim().toLocaleLowerCase();
            return asArray(pageState.snapshot?.entries)
                .filter((entry) => entry?.enabled === true)
                .filter((entry) => !query || [entryTitle(entry), entry?.ref?.bookName, entry?.ref?.uid]
                    .some((value) => String(value ?? '').toLocaleLowerCase().includes(query)))
                .map((entry) => ({
                    bookName: String(entry?.ref?.bookName ?? '').trim(),
                    uid: String(entry?.ref?.uid ?? '').trim(),
                }))
                .filter((ref) => ref.bookName && ref.uid);
        },
    };
}

function bindWorldbookReadingPage(ctx, session) {
    const pageDisposers = [];
    const addListener = (target, type, listener) => {
        const dispose = ctx.pageRuntime?.addEventListener?.(target, type, listener);
        if (typeof dispose === 'function') pageDisposers.push(dispose);
    };
    addListener(ctx.container, 'change', (event) => {
        const target = event.target;
        if (!target?.matches?.('.phone-worldbook-reading-entry-checkbox') || !ctx.container.contains(target)) return;
        void session.setSelected([{
            bookName: String(target.dataset?.worldbook ?? '').trim(),
            uid: String(target.dataset?.uid ?? '').trim(),
        }], target.checked === true);
    });
    addListener(ctx.container.querySelector('.phone-nav-back'), 'click', () => {
        ctx.state.mode = 'home';
        ctx.render();
    });
    addListener(ctx.container.querySelector('#phone-worldbook-reading-refresh'), 'click', () => {
        void session.load(false);
    });
    addListener(ctx.container.querySelector('#phone-worldbook-reading-blocked-keywords-save'), 'click', () => {
        const textarea = ctx.container.querySelector('#phone-worldbook-reading-blocked-keywords');
        void session.setBlockedKeywords(String(textarea?.value ?? '').split(/\r?\n/u));
    });
    addListener(ctx.container.querySelector('#phone-worldbook-reading-search'), 'input', (event) => {
        session.setQuery(event.currentTarget?.value);
    });
    addListener(ctx.container.querySelector('#phone-worldbook-reading-select-all'), 'click', () => {
        void session.setSelected(session.visibleEnabledRefs(), true);
    });
    addListener(ctx.container.querySelector('#phone-worldbook-reading-deselect-all'), 'click', () => {
        void session.setSelected(session.visibleEnabledRefs(), false);
    });
    return {
        dispose() {
            while (pageDisposers.length > 0) pageDisposers.pop()?.();
        },
    };
}

export function createWorldbookReadingPage(ctx) {
    let session;
    let bindings = null;
    const entriesScrollState = {};
    const entriesScrollPreserver = createRuntimeScrollPreserver(
        ctx.container,
        entriesScrollState,
        '#phone-worldbook-reading-entries',
        ctx.pageRuntime,
    );
    const entriesScrollKey = 'worldbookReadingEntriesScrollTop';
    const isTransientEntriesView = () => {
        const entries = ctx.container.querySelector('#phone-worldbook-reading-entries');
        const html = String(entries?.innerHTML ?? '');
        return html.includes('phone-worldbook-loading') || html.includes('phone-worldbook-error');
    };
    const preserveEntriesScroll = (renderFn, { skipTransientCapture = false } = {}) => {
        if (typeof HTMLElement !== 'function' || !(ctx.container instanceof HTMLElement)) {
            renderFn();
            return;
        }
        if (!(skipTransientCapture && isTransientEntriesView())) {
            entriesScrollPreserver.captureScroll(entriesScrollKey);
        }
        try {
            renderFn();
        } finally {
            entriesScrollPreserver.restoreScroll(entriesScrollKey);
        }
    };
    const paint = () => {
        preserveEntriesScroll(() => {
            bindings?.dispose();
            ctx.container.innerHTML = buildWorldbookReadingPageHtml(session.pageState);
            bindings = bindWorldbookReadingPage(ctx, session);
        }, { skipTransientCapture: true });
    };
    const paintFilter = () => {
        const entries = ctx.container.querySelector('#phone-worldbook-reading-entries');
        const status = ctx.container.querySelector('#phone-worldbook-reading-status');
        if (!entries || !status) {
            paint();
            return;
        }
        preserveEntriesScroll(() => {
            const view = buildWorldbookReadingView(session.pageState);
            entries.innerHTML = view.entriesHtml;
            status.textContent = view.statusText;
        });
    };
    session = createWorldbookReadingSession(ctx, paint, paintFilter);
    return {
        mount() {
            session.activate();
            paint();
            void session.load(false);
            void session.subscribe();
        },
        update() {
            paint();
        },
        dispose() {
            session.deactivate();
            bindings?.dispose();
            bindings = null;
        },
    };
}

export function renderWorldbookReadingPage(ctx) {
    createWorldbookReadingPage(ctx).mount();
}
