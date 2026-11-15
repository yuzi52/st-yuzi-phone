// Local-only test double: no network, host service, credentials or persistent storage.
const normalize = value => String(value ?? '').normalize('NFKC').trim();
const answer = (ok, status, extra = {}) => Object.freeze({ ok, status, ...extra });
const SCENARIOS = new Set(['generated', 'failed', 'disabled', 'unavailable']);
export function createPreviewImageActions({ declaration, getState, signal, taskSignal = signal, images = new Map(), pending = new Map(), changes = new Set(), onLog = () => {}, delayMs = 350 } = {}) {
  let scenario = 'generated';
  const listeners = new Set();
  const canvases = declaration?.imageGeneration?.canvases || [];
  function resolve(name, row, requireIdentity = true, requireEnabled = true, detached = false) {
    if (taskSignal.aborted || (!detached && signal.aborted)) return { error: answer(false, 'stale', { reason: 'instance-inactive' }) };
    const canvas = canvases.find(value => value.canvas === name);
    if (!canvas) return { error: answer(false, 'invalid-input', { reason: 'canvas-not-found' }) };
    // 模拟“未选生图接口或表开关关闭”；不读取智慧姬／柏宝绘，也不提供真实接口切换。
    if (requireEnabled && scenario === 'disabled') return { error: answer(false, 'disabled', { reason: 'image-generation-disabled' }) };
    if (scenario === 'unavailable') return { error: answer(false, 'unavailable', { reason: 'preview-unavailable' }) };
    const state = getState();
    if (normalize(canvas.tableName) !== normalize(state.tableName)) return { error: answer(false, 'unavailable', { reason: 'preview-table-not-current' }) };
    if (!requireIdentity) return { canvas, state };
    const fields = canvas.stableIdentityFields || [];
    const identity = fields.map(field => normalize(row?.[field]));
    const rows = state.rows.map(values => Object.fromEntries(state.headers.map((field, i) => [field, values[i]])));
    if (!row || Array.isArray(row) || !fields.length || identity.some(value => !value)
      || rows.filter(value => fields.every((field, i) => normalize(value[field]) === identity[i])).length !== 1) {
      return { error: answer(false, 'invalid-target', { reason: 'identity-not-unique' }) };
    }
    return { canvas, state, key: JSON.stringify([state.sheetKey, name, identity]) };
  }
  function wait() {
    return new Promise(resolveWait => {
      const finish = () => { clearTimeout(timer); taskSignal.removeEventListener('abort', finish); resolveWait(); };
      const timer = setTimeout(finish, delayMs);
      if (taskSignal.aborted) finish();
      else taskSignal.addEventListener('abort', finish, { once: true });
    });
  }
  async function run(target, operation, work) {
    if (pending.has(target.key)) return answer(false, 'busy', { reason: 'generation-in-progress' });
    const token = { operation };
    pending.set(target.key, token);
    const notify = result => {
      const detail = { key: 'imageGeneration', reason: 'task', canvasName: target.canvas.canvas,
        generating: pending.get(target.key)?.operation === 'generate', status: result?.status || 'started' };
      for (const listener of [...changes]) { try { listener(detail); } catch {} }
    };
    notify();
    let result;
    try { result = await work(); return result; }
    finally { if (pending.get(target.key) === token) { pending.delete(target.key); notify(result); } }
  }
  const actions = Object.freeze({
    async generateImage(name, row) {
      row = row && !Array.isArray(row) && typeof row === 'object' ? { ...row } : row;
      const target = resolve(name, row);
      if (target.error) return target.error;
      return run(target, 'generate', async () => {
        const previousImagePath = images.get(target.key)?.imagePath || '';
        const requestedScenario = scenario;
        const prompt = [...target.canvas.promptFields.map(field => field + '：' + String(row[field] ?? '').trim()), target.canvas.promptSuffix || ''].filter(Boolean).join('\n');
        onLog({ level: 'info', message: '仅测试生图：不会联网或消耗额度', details: { canvas: name, prompt } });
        await wait();
        const current = resolve(name, row, true, false, true);
        if (current.error) return current.error;
        if (current.key !== target.key) return answer(false, 'stale', { reason: 'target-changed' });
        if (requestedScenario === 'failed') return answer(false, 'failed', { reason: 'image-generation-failed', previousImagePath });
        const revision = (images.get(target.key)?.revision || 0) + 1;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#dce5d5"/><circle cx="256" cy="190" r="75" fill="#92a07c"/><path d="M95 425 Q110 280 256 280 Q402 280 417 425" fill="#92a07c"/><text x="256" y="475" text-anchor="middle" font-size="24">TEST ONLY · ' + revision + '</text></svg>';
        const imagePath = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        const record = Object.freeze({ imagePath, revision });
        images.set(target.key, record);
        return answer(true, 'generated', { imagePath, previousImagePath, record });
      });
    },
    async saveImage(name, row, image) {
      const target = resolve(name, row, true, false);
      if (target.error) return target.error;
      if (!(image instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type) || !image.size || image.size > 8 * 1024 * 1024) return answer(false, 'invalid-input', { reason: 'invalid-image' });
      return run(target, 'save', async () => {
        const bytes = new Uint8Array(await image.arrayBuffer());
        const current = resolve(name, row, true, false);
        if (current.error) return current.error;
        if (current.key !== target.key) return answer(false, 'stale');
        if (scenario === 'failed') return answer(false, 'failed', { reason: 'image-storage-failed' });
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const record = Object.freeze({ imagePath: 'data:' + image.type + ';base64,' + btoa(binary), revision: (images.get(target.key)?.revision || 0) + 1 });
        images.set(target.key, record);
        return answer(true, 'saved', { imagePath: record.imagePath, record });
      });
    },
    async deleteImage(name, row) {
      const target = resolve(name, row, true, false);
      if (target.error) return target.error;
      return run(target, 'delete', async () => {
        if (scenario === 'failed') return answer(false, 'failed', { reason: 'image-storage-failed' });
        images.set(target.key, Object.freeze({ imagePath: '', revision: (images.get(target.key)?.revision || 0) + 1 }));
        return answer(true, 'deleted');
      });
    },
    async readImage(name, row) {
      const target = resolve(name, row, true, false);
      if (target.error) return target.error;
      const record = images.get(target.key);
      return record?.imagePath ? answer(true, 'ready', { imagePath: record.imagePath, record }) : answer(true, 'empty', { cleared: Boolean(record) });
    },
    async getImageGenerationState(name, row) {
      const target = resolve(name, row, row !== undefined);
      return target.error ? Object.freeze({ available: false, ...target.error, canvasName: name })
        : Object.freeze({ available: true, status: 'ready', canvasName: name, sheetKey: target.state.sheetKey,
          ...(row !== undefined ? { generating: pending.get(target.key)?.operation === 'generate' } : {}) });
    },
    subscribeImageGeneration(listener) {
      if (signal.aborted || typeof listener !== 'function') return () => {};
      const notify = detail => { if (!signal.aborted) listener(detail); };
      listeners.add(notify);
      changes.add(notify);
      return () => { listeners.delete(notify); changes.delete(notify); };
    },
  });
  signal.addEventListener('abort', () => { for (const listener of listeners) changes.delete(listener); listeners.clear(); }, { once: true });
  return {
    actions: canvases.length ? actions : {},
    setScenario(value) {
      if (!SCENARIOS.has(value)) throw new Error('未知测试生图场景：' + value);
      scenario = value;
      for (const listener of listeners) { try { listener({ preview: true }); } catch {} }
    },
  };
}
