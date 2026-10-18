const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

async function main() {
    const { formatQQV2MessageSemantic } = await import('../modules/qq-v2/domain/message-semantics.js');

    assert.equal(formatQQV2MessageSemantic({ type: 'voice', content: '今晚见' }), '语音：今晚见');
    assert.equal(formatQQV2MessageSemantic({ type: 'image', content: '海边的照片' }), '图片：海边的照片');
    assert.equal(formatQQV2MessageSemantic({ type: 'video', content: '烟花' }), '视频：烟花');
    assert.equal(formatQQV2MessageSemantic({ type: 'sticker', content: '开心挥手' }), '表情：开心挥手');
    assert.equal(formatQQV2MessageSemantic({
        type: 'transfer',
        transfer: {
            amount: '88',
            currency: '金币',
            recipientId: 'person-1',
            note: '晚饭',
            status: 'pending',
        },
    }, { resolvePersonName: (personId) => personId === 'person-1' ? '玉子' : '' }),
    '转账，金额：88 金币，收款人：玉子，状态：待收款，备注：晚饭');

    const runtime = read('modules/qq-v2/application/production-runtime.js');
    const projection = read('modules/qq-v2/worldbook/projection-service.js');
    const { buildQQV2ProactiveSections } = await import('../modules/qq-v2/prompt/materializer.js');
    const { createQQV2ResourceService } = await import('../modules/qq-v2/resources/service.js');
    const resources = createQQV2ResourceService({ storage: { async get() {}, async set() {}, async delete() {} }, cryptoApi: {} });
    const presets = await resources.listPromptPresets();
    const protocol = id => presets.find(preset => preset.id === id).messages.find(block => block.id.endsWith('-output')).content;

    assert.match(runtime,
        /function formatWorldbookHistory\([\s\S]*formatQQV2MessageSemantic\(message/,
        'worldbook activation must use the canonical typed-message semantics');
    assert.ok((runtime.match(/formatWorldbookHistory\(/g) || []).length >= 3,
        'manual and proactive worldbook activation must share one typed-history boundary');
    assert.equal(buildQQV2ProactiveSections({ kind: 'private', conversations: [{
        title: '玉子', personId: 'npc', messages: [{ senderId: 'npc', senderType: 'person', type: 'voice', content: '今晚见' }],
    }] }), '[private|玉子]\n[P1-M1][voice|玉子|今晚见]',
    'proactive history exposes the type, speaker, content, and automatic reference');
    assert.match(projection, /senderName\(message[\s\S]*formatQQV2MessageSemantic\(message/,
        'worldbook projection must use the same readable semantics');
    assert.match(projection, /data\.conversation\?\.kind === 'group'[\s\S]*message\.quoteMessageId/,
        'quote projection is emitted only for group conversations');
    assert.match(runtime,
        /recipientId:\s*asText\(message\.transfer\?\.recipientId,\s*256\)[\s\S]*conversation\?\.kind === 'private'[\s\S]*conversation\.personId\s*:\s*''/,
        'private transfers may default to the current person while group transfers require an explicit recipient');
    for (const id of ['builtin-private-reply', 'builtin-private-proactive', 'builtin-assistant-reply']) {
        assert.ok(protocol(id).includes('[text|内容]'));
        assert.doesNotMatch(protocol(id), /\[(?:quote|at|group|new-group|kick)\|/u,
            'private and assistant defaults do not teach group actions');
    }
    assert.ok(protocol('builtin-group-reply').includes('[quote|M编号]'));
    assert.ok(protocol('builtin-group-proactive').includes('[quote|G编号-M编号]'));

    console.log('[qq-v2-message-semantics-contract] passed');
}

main().catch((error) => {
    console.error('[qq-v2-message-semantics-contract] failed');
    console.error(error);
    process.exitCode = 1;
});
