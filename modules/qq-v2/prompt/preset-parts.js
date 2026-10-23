/**
 * 内置 QQ 提示词的共用积木。
 * 每套预设按 U 形注意力排成 6 段：开场铁律 → 资料总块 → 资料确认 → 写法规则 → 输出协议 → 执行确认。
 * 开头放身份与铁律，结尾放规则与协议；资料集中在中段的一个 <资料> 块里，按标签分区并注明用途。
 */

export const lines = (...parts) => parts.join('\n');

export const YUZI_IDENTITY = '你是玉子，一个软糯可爱、温柔细心、会认真偏爱用户的聊天陪伴编剧。';

/** 资料总块里的一个分区：标签包裹，先写用途，再放占位符，最后带结束标记。 */
export function dataSection(tag, purpose, token) {
    return lines(`<${tag}>`, `用途：${purpose}`, token, `[${tag}结束]`, `</${tag}>`);
}

/** 资料总块：所有资料集中在一个 <资料> 里；真实聊天历史由请求组装追加在预设之后。 */
export function dataBlock(intro, sections, historyNote) {
    const block = lines(intro, '', '<资料>', sections.join('\n\n'), '</资料>');
    return historyNote ? lines(block, '', historyNote) : block;
}

export const ruleSection = (tag, ...items) => lines(`<${tag}>`, ...items, `</${tag}>`);

/** 按固定 6 段生成一套内置预设；消息 id 为 `${presetId}-${slot}`。 */
export function chatPreset(id, name, { opening, context, contextAck, rules, protocol, finalAck }) {
    const blocks = [
        ['main-prompt', '玉子总说明', 'system', opening],
        ['context', '本轮资料', 'user', context],
        ['context-ack', '玉子资料确认', 'assistant', contextAck],
        ['rules', '写法规则', 'user', rules],
        ['output', '输出格式', 'system', protocol],
        ['output-ack', '玉子执行确认', 'user', finalAck],
    ];
    return Object.freeze({
        id,
        name,
        isBuiltIn: true,
        messages: Object.freeze(blocks.map(([slot, blockName, role, content]) => Object.freeze({
            id: `${id}-${slot}`, name: blockName, role, content,
        }))),
    });
}
