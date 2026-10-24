import {
    captureStableScrollAnchor,
    restoreStableScrollAnchor,
} from '../phone-core/stable-scroll-anchor.js';

function getVisibleItems(root) {
    return [...root.querySelectorAll('.vm-group-header, .vm-object-title, .vm-card')]
        .filter((item) => !item.closest('.vm-group-collapsed .vm-group-body, .vm-object-collapsed > .vm-object-children'));
}

function getItemKey(item) {
    return item.dataset.varPath ?? item.dataset.deletePath;
}

export function captureVariableViewState(container) {
    const root = container.querySelector('.vm-body');
    if (!root) return null;

    const items = getVisibleItems(root);
    const editing = items.find((item) => item.classList.contains('vm-card-editing'));

    return {
        scrollTop: root.scrollTop,
        anchor: captureStableScrollAnchor(root, {
            getItems: () => editing ? [editing, ...items] : items,
            getKey: getItemKey,
            stickToBottom: false,
        }),
        collapsedGroups: new Set([...root.querySelectorAll('.vm-group-collapsed')]
            .map((group) => group.dataset.groupPath)),
        collapsedObjects: new Set([...root.querySelectorAll('.vm-object-collapsed > .vm-object-title')]
            .map((title) => title.dataset.deletePath)),
    };
}

export function restoreVariableViewState(container, snapshot) {
    const root = container.querySelector('.vm-body');
    if (!root || !snapshot) return;

    root.querySelectorAll('.vm-group').forEach((group) => {
        group.classList.toggle('vm-group-collapsed', snapshot.collapsedGroups.has(group.dataset.groupPath));
    });
    root.querySelectorAll('.vm-object-title').forEach((title) => {
        title.parentElement.classList.toggle('vm-object-collapsed', snapshot.collapsedObjects.has(title.dataset.deletePath));
    });

    if (!restoreStableScrollAnchor(root, snapshot.anchor, {
        getItems: getVisibleItems,
        getKey: getItemKey,
    })) {
        root.scrollTop = snapshot.scrollTop;
    }
}
