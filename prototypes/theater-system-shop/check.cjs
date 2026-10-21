// 玉子市场原型回归：无外部依赖，执行真实 app.js 按钮处理；不是浏览器视觉验收。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = __dirname;
const html = fs.readFileSync(path.join(base, '../theater-system-shop.html'), 'utf8');
const sources = [...html.matchAll(/<script src="\.\/theater-system-shop\/([^"]+)"/g)].map(m => m[1]);
const nodes = new Map();
const timers = [];
let focused = null;
let sends = 0;
let passes = 0;
class Node {
    constructor(id = '') {
        this.id = id; this.value = ''; this.dataset = {}; this.hidden = true;
        this.disabled = false; this.inert = false; this.isConnected = true;
        this.children = []; this.handlers = {}; this.events = []; this.attributes = {};
        this.classList = { add() {}, remove() {} };
    }
    set innerHTML(value) { this.html = value; }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    dispatchEvent(event) { this.events.push(event); this.handlers[event.type]?.(event); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() { focused = this; }
    prepend(child) { this.children.unshift(child); }
    querySelectorAll(selector) {
        if (selector === 'button') return this.hidden ? [] : [get('cancel'), get('ok')];
        return [get('nav'), get('scroll')];
    }
}
function get(id) { if (!nodes.has(id)) nodes.set(id, new Node(id)); return nodes.get(id); }
const document = {
    getElementById: get,
    querySelector: selector => get(selector),
    createElement: () => new Node(),
    addEventListener() {},
    get activeElement() { return focused; },
};
const ctx = { window: {}, document, console,
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
};
vm.createContext(ctx);
for (const file of sources) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), ctx, { filename: file });
const { SS_DATA: D, SS_PARSE: P, SS_SIM: S } = ctx.window;
function test(name, fn) { fn(); passes++; console.log(`通过：${name}`); }
function click(selector, dataset) {
    const target = new Node(); target.dataset = dataset; target.closest = () => target;
    get(selector).handlers.click({ target });
}
function confirm() {
    const target = new Node(); target.dataset.btn = 'ok'; target.closest = () => target;
    get('layer').onclick({ target });
}
function edit(key, value) {
    const target = get(`cell-${key}`); target.dataset.cell = key; target.value = value;
    get('cells').handlers.input({ target });
}
const cell = key => get(`cell-${key}`).value;


// 静态入口与初始化核对，模拟 DOM 不冒充浏览器布局测试。
test('HTML 资源齐全，保留标准标题栏和七字段编辑器', () => {
    assert.equal(sources.length, 9);
    for (const m of html.matchAll(/(?:src|href)="(\.\/theater-system-shop\/[^\"]+)"/g)) {
        assert.ok(fs.existsSync(path.resolve(base, '..', m[1])), m[1]);
    }
    assert.ok(html.includes('</html>'));
    for (const key of ['task', 'status', 'bag', 'shop', 'refresh', 'points', 'title']) {
        assert.ok(get('cells').innerHTML.includes(`id="cell-${key}"`));
    }
    assert.equal(cell('refresh'), '未刷新');
    assert.ok(html.includes('phone-nav-leading') && html.includes('phone-nav-trailing'));
    assert.ok(html.includes('玉子市场'));
});
const fixture = '绿｜勇气喷雾｜15点｜都市·下一句话不会结巴;蓝｜好运硬币｜30点｜西幻·下一次判定必定正面朝上';
edit('shop', fixture);
edit('points', '40');
edit('bag', D.INITIAL.bag);
test('确认购买：扣点、保留品级来源效果、标记售空，不申请刷新', () => {
    click('.ss-scroll', { act: 'buy', i: '0' });
    assert.equal(cell('points'), '40');
    confirm();
    assert.equal(cell('points'), '25');
    const bought = P.parseBag(cell('bag'))[1];
    assert.equal(bought.name, '勇气喷雾');
    assert.equal(bought.world, '都市');
    assert.equal(bought.desc, '下一句话不会结巴');
    assert.equal(bought.rarity, 0);
    assert.equal(P.parseShop(cell('shop'))[0].soldOut, true);
    assert.equal(cell('refresh'), '未刷新');
});
test('售空商品不能重复购买', () => {
    const before = cell('bag');
    click('.ss-scroll', { act: 'buy', i: '0' });
    assert.equal(get('layer').hidden, true);
    assert.equal(cell('points'), '25');
    assert.equal(cell('bag'), before);
});
test('背包详情显示效果，使用只追加草稿、保留原文、不消耗物品', () => {
    const before = cell('bag');
    get('send_textarea').value = '原有草稿';
    click('.ss-scroll', { act: 'bag', i: '1' });
    assert.ok(get('layer').innerHTML.includes('下一句话不会结巴'));
    assert.ok(get('layer').innerHTML.includes('data-btn="use"'));
    const target = new Node(); target.dataset.btn = 'use'; target.closest = () => target;
    get('layer').onclick({ target });
    assert.equal(get('send_textarea').value, '原有草稿\n使用【勇气喷雾】：下一句话不会结巴');
    assert.equal(get('send_textarea').events.at(-1).type, 'input');
    assert.equal(get('send_textarea').events.at(-1).bubbles, true);
    assert.equal(cell('bag'), before);
    assert.equal(cell('points'), '25');
    assert.equal(sends, 0);
});
