// Table image requests outlive pages, but never the host chat session.
let controller = new AbortController();

export function getTableImageSessionSignal() {
    return controller.signal;
}

export function startTableImageSession() {
    if (controller.signal.aborted) controller = new AbortController();
}

export function invalidateTableImageSession(stopped = false) {
    const previous = controller;
    controller = new AbortController();
    if (stopped) controller.abort();
    previous.abort();
}
