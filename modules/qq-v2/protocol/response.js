import { parseQQV2Response, QQV2ProtocolError } from './xml.js';

const MESSAGE_TYPES = new Set(['text', 'voice', 'image', 'video', 'sticker', 'transfer']);
const GROUP_COMMANDS = Object.freeze({
    rename: 'rename', add: 'add', 'add-new': 'add', kick: 'kick',
    admin: 'appoint-admin', unadmin: 'revoke-admin', mute: 'mute', unmute: 'unmute',
    reinvite: 'reinvite', leave: 'leave', owner: 'transfer-owner', dissolve: 'dissolve',
});
const DURATIONS = Object.freeze({ '10m': '10 分钟', '1h': '1 小时', '1d': '1 天', '7d': '7 天', forever: '永久' });
const nameKey = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
const decode = value => String(value ?? '').replace(/\\(n|\\)/gu, (_, value) => value === 'n' ? '\n' : '\\');

/** Select the last started block, never fall back to an earlier example after truncation. */
function responseBlock(value) {
    const source = String(value ?? '').replace(/\r\n?/gu, '\n');
    let block = null;
    for (const match of source.matchAll(/<\/?qq(?:\s[^<>]*?)?\s*\/?>/giu)) {
        const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
        // Literal tags inside message text (including voice tags) aren't envelope boundaries.
        if (/^\s*[\[［]/u.test(source.slice(lineStart, match.index))) continue;
        if (/^<\//u.test(match[0])) {
            if (block && block.end === null) {
                block.bodyEnd = match.index;
                block.end = match.index + match[0].length;
            }
        } else {
            const empty = /\/\s*>$/u.test(match[0]);
            block = { start: match.index, bodyStart: match.index + match[0].length,
                bodyEnd: empty ? match.index + match[0].length : null,
                end: empty ? match.index + match[0].length : null, opening: match[0] };
        }
    }
    if (!block) throw new QQV2ProtocolError('响应必须包含 <qq>...</qq>');
    if (block.end === null) throw new QQV2ProtocolError('最后一个 QQ 块未结束，响应可能被截断');
    return { raw: source.slice(block.start, block.end), body: source.slice(block.bodyStart, block.bodyEnd), opening: block.opening };
}

function instruction(value, line) {
    const raw = value.trim();
    if (!/^[\[［][\s\S]*[\]］]$/u.test(raw)) throw new QQV2ProtocolError('每行必须是一条完整的方括号指令', line);
    let depth = 0;
    for (let index = 0; index < raw.length - 1; index += 1) {
        if ('[［'.includes(raw[index])) depth += 1;
        if (']］'.includes(raw[index])) depth -= 1;
        if (depth === 0 && /^[\s]*[\[［][a-z][a-z-]*(?:[|｜\]］])/iu.test(raw.slice(index + 1))) {
            throw new QQV2ProtocolError('一行只能写一条指令', line);
        }
    }
    const inner = raw.slice(1, -1);
    const separator = inner.search(/[|｜]/u);
    return { command: (separator < 0 ? inner : inner.slice(0, separator)).trim().toLowerCase(),
        tail: separator < 0 ? null : inner.slice(separator + 1), line };
}

/** New wire format -> existing domain actions. No storage, UI, or model calls here. */
export function parseQQResponse(value, context = {}) {
    const block = responseBlock(value);
    if (!block.body.trim() || block.body.trimStart().startsWith('<')) {
        return parseQQV2Response(block.raw, context);
    }
    if (!/^<qq\s*>$/iu.test(block.opening)) throw new QQV2ProtocolError('qq 外壳不允许属性');
    const rows = block.body.split('\n').map((text, index) => ({ text, line: index + 1 })).filter(row => row.text.trim());
    const conversations = new Map([...context.conversations || []].map(([ref, item]) => [ref, { ...item, ref }]));
    const people = new Map(context.people || []);
    const personReferences = context.personReferences || {};
    const scenario = String(context.scenario || '');
    const groupMode = scenario.startsWith('group-');
    const proactive = scenario.endsWith('-proactive');
    if (!['private-reply', 'private-proactive', 'group-reply', 'group-proactive'].includes(scenario)) {
        throw new QQV2ProtocolError('缺少 QQ 请求场景');
    }
    let current = proactive ? null : conversations.size === 1 ? [...conversations.values()][0] : null;
    const actions = [];
    let pending = null;
    let serial = 0;
    let line = 1;
    const fail = message => { throw new QQV2ProtocolError(message, line); };
    const required = (text, label) => {
        const result = decode(text).trim();
        if (!result) fail(`${label}不能为空`);
        return result;
    };
    const fields = (tail, min, max = min) => {
        const result = tail === null ? [] : tail.split(/[|｜]/u).map(item => required(item, '字段'));
        if (result.length < min || result.length > max) fail(`该指令需要 ${min === max ? min : `${min}–${max}`} 个字段`);
        return result;
    };
    // Split only structural fields. Delimiters inside the last free-text field are literal.
    const withBody = (tail, count) => {
        const headers = [];
        let body = tail;
        for (let index = 0; index < count; index += 1) {
            const separator = body?.search(/[|｜]/u) ?? -1;
            if (separator < 0) fail('消息缺少必要字段');
            headers.push(required(body.slice(0, separator), '字段'));
            body = body.slice(separator + 1);
        }
        return [...headers, required(body, '消息内容')];
    };
    const person = (name, allowSelf = false) => {
        if (name === 'user') {
            if (!allowSelf) fail('AI 不能代替用户发言或操作');
            return '__self__';
        }
        const ref = personReferences[name];
        if (ref && people.has(ref)) return ref;
        const matches = [...people].filter(([, item]) => nameKey(item.formalName) === nameKey(name));
        if (matches.length !== 1) fail(matches.length ? `人物“${name}”有歧义，请使用短编号` : `找不到人物“${name}”`);
        return matches[0][0];
    };
    const choose = (name, kind) => {
        const exact = conversations.get(name);
        const matches = exact?.kind === kind ? [exact] : [...conversations.values()].filter(item => item.kind === kind && nameKey(item.name) === nameKey(name));
        if (matches.length !== 1) fail(matches.length ? `会话“${name}”有歧义，请使用短编号` : `找不到会话“${name}”`);
        return matches[0];
    };
    const nextReference = () => {
        let ref;
        do { ref = `qq-new-${++serial}`; } while (conversations.has(ref) || people.has(ref) || Object.hasOwn(personReferences, ref));
        return ref;
    };
    const messageRef = value => {
        if (!context.visibleMessageRefs?.has(value)) fail(`消息“${value}”不在本次可见范围内`);
        return value;
    };
    const emit = action => actions.push({ ...action, sourceLine: line });
    const requireCurrent = () => {
        if (!current || current.kind !== (groupMode ? 'group' : 'private')) fail('请先选择本次可操作的会话');
        return current;
    };
    const markReply = () => {
        if (current.read) fail('同一私聊的 read 不能与消息或转账处理同时出现');
        current.replied = true;
    };

    for (const row of rows) {
        line = row.line;
        const { command, tail } = instruction(row.text, line);
        if (pending && !MESSAGE_TYPES.has(command) && !['quote', 'at'].includes(command)) {
            fail('quote / at 后必须紧接一条消息，不能夹其他动作');
        }
        if (command === 'none') {
            fields(tail, 0);
            if ((!proactive && !groupMode) || context.assistant || rows.length !== 1) fail('当前场景不允许 none，或 none 不是唯一指令');
            emit({ type: 'none' });
            continue;
        }
        if (command === 'private' || command === 'group') {
            if (!proactive || (command === 'group') !== groupMode) fail('当前场景不能切换到这种会话');
            current = choose(fields(tail, 1)[0], command);
            continue;
        }
        if (command === 'new-private') {
            if (scenario !== 'private-proactive') fail('只有私聊主动场景可以新建私聊');
            const [name] = fields(tail, 1);
            const existing = [...conversations.values()].filter(item => item.kind === 'private' && nameKey(item.name) === nameKey(name));
            if (existing.length === 1) { current = existing[0]; continue; }
            const id = nextReference();
            emit({ type: 'create-private', id, name });
            current = { ref: id, kind: 'private', name, personId: id };
            conversations.set(id, current);
            people.set(id, { formalName: name });
            continue;
        }
        if (command === 'new-group') {
            if (scenario !== 'group-proactive') fail('只有群聊主动场景可以新建群聊');
            const [name, ownerName, ...others] = fields(tail, 3, Infinity);
            const owner = person(ownerName);
            const members = [...new Set([owner, ...others.map(name => person(name))])];
            if (members.length < 2) fail('新群至少需要两名不同的 NPC');
            const id = nextReference();
            emit({ type: 'create-group', id, name, owner, members });
            current = { ref: id, kind: 'group', name };
            conversations.set(id, current);
            continue;
        }
        requireCurrent();
        if (MESSAGE_TYPES.has(command)) {
            const [sender, body] = groupMode ? withBody(tail, 1) : [null, required(tail, '消息内容')];
            const action = { type: 'message', conversation: current.ref,
                sender: groupMode ? person(sender) : current.personId, messageType: command,
                content: body, quote: pending?.quote || '', mentions: pending?.mentions || [], mentionAll: pending?.mentionAll || false };
            if (command === 'sticker') {
                if (/[|｜]/u.test(body)) fail('表情消息只填写一个 S 编号');
                if (!Object.hasOwn(context.stickerDescriptions || {}, body)) fail(`找不到表情“${body}”`);
                action.stickerId = body;
                action.content = context.stickerDescriptions[body];
            }
            if (command === 'transfer') {
                // Re-read the original tail, preserving escapes until the final field is decoded.
                const count = groupMode ? 3 : 1;
                const parts = [];
                let remaining = tail;
                for (let index = 0; index < count; index += 1) {
                    const separator = remaining?.search(/[|｜]/u) ?? -1;
                    if (separator < 0 && index < count - 1) fail('转账缺少必要字段');
                    parts.push(required(separator < 0 ? remaining : remaining.slice(0, separator), '转账字段'));
                    remaining = separator < 0 ? '' : remaining.slice(separator + 1);
                }
                action.recipient = groupMode ? person(parts[1], true) : '__self__';
                action.amount = parts[count - 1];
                action.note = decode(remaining).trim();
                action.content = action.note || action.amount;
            }
            markReply();
            emit(action);
            pending = null;
            continue;
        }
        if (command === 'quote' || command === 'at') {
            if (!groupMode) fail('引用和 @ 只用于群聊');
            pending ||= { line };
            if (command === 'quote') {
                if (pending.quote) fail('一条消息只能引用一条历史');
                pending.quote = messageRef(fields(tail, 1)[0]);
            } else {
                if (pending.mentions) fail('多个提及对象请写在同一条 at 中');
                const names = fields(tail, 1, Infinity);
                pending.mentionAll = names.length === 1 && names[0] === 'all';
                pending.mentions = pending.mentionAll ? [] : [...new Set(names.map(name => person(name, true)))];
            }
            continue;
        }
        if (command === 'read') {
            fields(tail, 0);
            if (groupMode || context.assistant) fail('当前场景不允许 read');
            if (current.replied || current.read) fail('read 不能重复或与同一私聊的其他回复并存');
            current.read = true;
            emit({ type: 'read', conversation: current.ref });
            continue;
        }
        if (command === 'accept' || command === 'reject') {
            const message = messageRef(fields(tail, 1)[0]);
            markReply();
            // The repository resolves the recipient from this transfer inside the same transaction.
            emit({ type: 'transfer', conversation: current.ref, message, action: command });
            continue;
        }
        if (Object.hasOwn(GROUP_COMMANDS, command)) {
            if (!groupMode) fail('当前场景不允许群管理');
            const count = ['reinvite', 'leave', 'dissolve'].includes(command) ? 1 : command === 'mute' ? 3 : 2;
            const args = fields(tail, count);
            const action = { type: 'group', conversation: current.ref, action: GROUP_COMMANDS[command], actor: person(args[0]), target: '', value: '', duration: '' };
            if (command === 'rename') { action.value = args[1]; current.name = args[1]; }
            else if (command === 'add-new') {
                action.id = nextReference();
                action.name = args[1];
                if (![...people.values()].some(item => nameKey(item.formalName) === nameKey(args[1]))) {
                    people.set(action.id, { formalName: args[1] });
                }
            } else if (command === 'reinvite') action.target = '__self__';
            else if (args[1]) action.target = person(args[1], true);
            if (command === 'mute') {
                action.duration = DURATIONS[args[2]];
                if (!action.duration) fail('禁言时长只能是 10m、1h、1d、7d、forever');
            }
            emit(action);
            continue;
        }
        fail(`不支持的指令“${command}”`);
    }
    if (pending) throw new QQV2ProtocolError('quote / at 后缺少消息', pending.line);
    if (!actions.length) fail('QQ 块没有可执行的动作');
    if (context.assistant && !actions.some(action => action.type === 'message')) fail('陪聊必须发送至少一条消息');
    return actions;
}
