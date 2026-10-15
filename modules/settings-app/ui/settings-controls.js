import { showSettingsOptionSheet } from './settings-layer.js';

// 设置分组列表控件桥：界面只换外观，数据仍走原生 select / input 及其既有监听。
// - 选择行  [data-settings-select="<select id>"]  → 底部单选面板，选中后写回 select 并派发 change
// - 分段控件 .phone-ios-seg[data-settings-seg="<select id>"] → 写回 select 并派发 change
// - 步进器  .phone-ios-stepper[data-settings-stepper="<input id>"] → 写回 input 并派发 input + change
// 规范见 docs/phone-ui-variables.md「设置分组列表」。

function findById(container, id) {
    if (!id) return null;
    return container.querySelector(`#${CSS.escape(id)}`);
}

function dispatch(target, ...types) {
    types.forEach(type => target.dispatchEvent(new Event(type, { bubbles: true })));
}

function readOption(option) {
    return {
        value: option.value,
        label: option.dataset.label || option.textContent.trim(),
        sub: option.dataset.sub || '',
        badge: option.dataset.badge || '',
        selected: option.selected,
        disabled: option.disabled || option.parentElement?.disabled === true,
    };
}

function collectOptionGroups(selectEl) {
    const groups = [];
    let loose = null;
    [...selectEl.children].forEach((child) => {
        if (child.tagName === 'OPTGROUP') {
            groups.push({ header: child.label, options: [...child.children].map(readOption) });
            return;
        }
        if (child.tagName !== 'OPTION') return;
        if (!loose) {
            loose = { header: '', options: [] };
            groups.push(loose);
        }
        loose.options.push(readOption(child));
    });
    return groups;
}

function syncSelectRow(row, selectEl) {
    const valueEl = row.querySelector('.phone-ios-row-value-text');
    const current = selectEl.selectedOptions?.[0];
    if (valueEl && current) valueEl.textContent = current.dataset.short || current.textContent.trim();
}

function syncSegment(seg, selectEl) {
    seg.querySelectorAll('[data-value]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.value === selectEl.value));
    });
}

function formatStepperValue(value, unit) {
    const rounded = Math.round(Number(value) * 1000) / 1000;
    return `${Number.isFinite(rounded) ? rounded : ''}${unit || ''}`;
}

function syncStepper(stepper, inputEl) {
    const output = stepper.querySelector('.phone-ios-stepper-value');
    if (output) output.textContent = formatStepperValue(inputEl.value, stepper.dataset.unit);
    const value = Number(inputEl.value);
    const [minus, plus] = stepper.querySelectorAll('.phone-ios-stepper-btn');
    if (minus) minus.disabled = inputEl.disabled || value <= Number(inputEl.min);
    if (plus) plus.disabled = inputEl.disabled || value >= Number(inputEl.max);
}

/**
 * 在容器上用事件委托绑定分组列表控件；动态渲染的行同样生效。
 * @returns {Function} cleanup
 */
export function bindSettingsGroupedControls(container, runtime = null, canInteract = () => true) {
    if (!container || typeof container.addEventListener !== 'function') return () => {};

    const stepSelector = '.phone-ios-stepper[data-settings-stepper] .phone-ios-stepper-btn';
    let hold = null, repeatTimer = null, suppressedClick = null;
    const step = (button, commit = true) => {
        if (!canInteract() || !container.contains(button) || button.disabled) return null;
        const stepper = button.closest('.phone-ios-stepper');
        const input = findById(container, stepper.dataset.settingsStepper);
        if (!input || input.disabled) return null;
        const amount = (Number(stepper.dataset.step) || 1) * (Number(button.dataset.direction) || 0);
        const next = Math.min(Number(input.max), Math.max(Number(input.min), (Number(input.value) || 0) + amount));
        const value = String(Math.round(next * 1000) / 1000);
        if (input.value === value) return null;
        input.value = value;
        syncStepper(stepper, input);
        dispatch(input, ...(commit ? ['input', 'change'] : ['input']));
        return input;
    };
    // Opt-in: input previews each repeat; change commits once when the gesture ends.
    const finishHold = (cancelled = false) => {
        if (!hold) return;
        clearTimeout(repeatTimer); repeatTimer = null;
        const current = hold; hold = null;
        document.removeEventListener('pointerup', onPointerEnd, true);
        document.removeEventListener('pointercancel', onPointerEnd, true);
        document.removeEventListener('pointermove', onPointerMove, true);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', finishHold);
        if (current.input || cancelled) suppressedClick = { button: current.button, until: Date.now() + 700 };
        if (current.input) dispatch(current.input, 'change');
    };
    const onPointerEnd = event => { if (event.pointerId === hold?.pointerId) finishHold(event.type === 'pointercancel'); };
    const onVisibility = () => { if (document.hidden) finishHold(true); };
    const onPointerMove = event => {
        if (!hold || event.pointerId !== hold.pointerId) return;
        const rect = hold.button.getBoundingClientRect();
        if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10
            || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finishHold(true);
    };
    const repeat = () => {
        if (!hold) return;
        if (!canInteract() || !hold.button.isConnected) { finishHold(true); return; }
        const input = step(hold.button, false);
        if (!hold || !input) return;
        hold.input = input;
        repeatTimer = setTimeout(repeat, 90);
    };
    const onPointerDown = event => {
        if (hold || event.button !== 0 || event.isPrimary === false || !canInteract()) return;
        const button = event.target?.closest?.(stepSelector);
        if (!button || !container.contains(button) || button.disabled || !button.closest('[data-settings-repeat]')) return;
        suppressedClick = null;
        hold = { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, input: null };
        document.addEventListener('pointerup', onPointerEnd, true);
        document.addEventListener('pointercancel', onPointerEnd, true);
        document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', finishHold);
        repeatTimer = setTimeout(repeat, 350);
    };
    const onContextMenu = event => {
        if (hold && hold.button.contains(event.target)) event.preventDefault();
    };

    container.querySelectorAll('.phone-ios-seg[data-settings-seg]').forEach((seg) => {
        const selectEl = findById(container, seg.dataset.settingsSeg);
        if (selectEl) syncSegment(seg, selectEl);
    });
    container.querySelectorAll('.phone-ios-stepper[data-settings-stepper]').forEach((stepper) => {
        const inputEl = findById(container, stepper.dataset.settingsStepper);
        if (inputEl) syncStepper(stepper, inputEl);
    });

    const onClick = (event) => {
        if (!canInteract()) return;
        const selectRow = event.target?.closest?.('[data-settings-select]');
        if (selectRow && container.contains(selectRow)) {
            const selectEl = findById(container, selectRow.dataset.settingsSelect);
            if (!selectEl || selectEl.disabled) return;
            showSettingsOptionSheet({
                title: selectRow.dataset.sheetTitle || selectRow.querySelector('.phone-ios-row-label')?.textContent?.trim() || '',
                subtitle: selectRow.dataset.sheetSubtitle || '',
                footer: selectRow.dataset.sheetFooter || '',
                className: selectRow.dataset.settingsLayerClass || '',
                groups: collectOptionGroups(selectEl),
                runtime,
                onSelect: (value) => {
                    if (selectEl.value === value || !canInteract()) return;
                    selectEl.value = value;
                    if (!selectRow.hasAttribute('data-settings-defer-sync')) syncSelectRow(selectRow, selectEl);
                    dispatch(selectEl, 'change');
                },
            });
            return;
        }

        const segButton = event.target?.closest?.('.phone-ios-seg[data-settings-seg] [data-value]');
        if (segButton && container.contains(segButton)) {
            const seg = segButton.closest('.phone-ios-seg');
            const selectEl = findById(container, seg.dataset.settingsSeg);
            if (!selectEl || selectEl.value === segButton.dataset.value) return;
            selectEl.value = segButton.dataset.value;
            syncSegment(seg, selectEl);
            dispatch(selectEl, 'change');
            return;
        }

        const stepButton = event.target?.closest?.(stepSelector);
        if (stepButton && container.contains(stepButton)) {
            if (event.detail !== 0 && suppressedClick?.button === stepButton && Date.now() <= suppressedClick.until) {
                suppressedClick = null; event.preventDefault(); return;
            }
            step(stepButton);
        }
    };

    const onInput = (event) => {
        if (!event.target?.id) return;
        const stepper = container.querySelector(`.phone-ios-stepper[data-settings-stepper="${CSS.escape(event.target.id)}"]`);
        if (stepper) syncStepper(stepper, event.target);
        const seg = container.querySelector(`.phone-ios-seg[data-settings-seg="${CSS.escape(event.target.id)}"]`);
        if (seg) syncSegment(seg, event.target);
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    container.addEventListener('change', onInput);
    return () => {
        finishHold();
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('contextmenu', onContextMenu);
        container.removeEventListener('click', onClick);
        container.removeEventListener('input', onInput);
        container.removeEventListener('change', onInput);
    };
}
