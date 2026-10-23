/**
 * Fish Audio FAS2 sound-control tags. The catalog mirrors the vocabulary the
 * official Fish-Dialogue worldbook offers the chat model, so one voice line
 * stays portable between the Fish extension and QQ.
 */
export const QQ_VOICE_TAG_LIMIT = 10;
export const QQ_VOICE_TAG_MAX_CHARS = 60;

export const QQ_VOICE_TAG_CATALOG = Object.freeze({
    breath: Object.freeze({
        label: '呼吸',
        tags: Object.freeze(['breathing', 'panting', 'sigh', 'sniffing', 'clears throat']),
    }),
    reaction: Object.freeze({
        label: '声音反应',
        tags: Object.freeze(['laughter', 'chuckling', 'cough', 'crying']),
    }),
    timing: Object.freeze({
        label: '节奏',
        tags: Object.freeze(['slight pause', 'long pause', 'speaking fast', 'speaking slowly']),
    }),
    delivery: Object.freeze({
        label: '语气',
        tags: Object.freeze(['whispering', 'shouting', 'mumbling', 'monotone']),
    }),
    pitch: Object.freeze({
        label: '音高',
        tags: Object.freeze(['pitch up', 'pitch down', 'singing']),
    }),
    emotion: Object.freeze({
        label: '情绪',
        tags: Object.freeze(['happy', 'sad', 'angry', 'scared', 'excited']),
    }),
});

export const QQ_VOICE_KNOWN_TAGS = Object.freeze(
    Object.values(QQ_VOICE_TAG_CATALOG).flatMap((group) => group.tags),
);

const TAG_LABELS = {
    breathing: '呼吸', panting: '喘气', sigh: '叹气', sniffing: '吸鼻子', 'clears throat': '清嗓子',
    laughter: '笑声', chuckling: '轻笑', cough: '咳嗽', crying: '哭声',
    'slight pause': '短暂停顿', 'long pause': '较长停顿', 'speaking fast': '加快语速', 'speaking slowly': '放慢语速',
    whispering: '轻声／耳语', shouting: '大声喊', mumbling: '含糊嘟囔', monotone: '平直语调',
    'pitch up': '提高音高', 'pitch down': '降低音高', singing: '唱着说',
    happy: '开心', sad: '难过', angry: '生气', scared: '害怕', excited: '兴奋',
};

export const QQ_VOICE_TAG_GUIDE = ['emotion', 'delivery', 'timing', 'breath', 'reaction', 'pitch'].map(key => {
        const group = QQ_VOICE_TAG_CATALOG[key];
        return `【${key === 'pitch' ? '音高／表现' : group.label}：${group.tags.length} 种】\n${group.tags.map(tag => `[${tag}] ${TAG_LABELS[tag]}`).join('；')}。`;
    }).join('\n\n');

/** 五套 QQ 默认预设共用；正文可独立调整说明，继续共用标签清单。 */
export const QQ_VOICE_PROMPT_RULE = [
    `voice 正文写台词，以下声音标记可以穿插在台词的开头、中间和结尾附近；按场景选用，普通短句不必强加，避免频繁切换、重复堆叠或使用互相矛盾的标记。每条最多 ${QQ_VOICE_TAG_LIMIT} 个，不能只写标记。共 ${QQ_VOICE_KNOWN_TAGS.length} 种：`,
    QQ_VOICE_TAG_GUIDE,
].join('\n\n');

const KNOWN_TAG_SET = new Set(QQ_VOICE_KNOWN_TAGS.map((tag) => tag.toLowerCase()));
const TAG_PATTERN = /\[([^[\]]{1,60})\]/gu;

function knownTag(value) {
    return KNOWN_TAG_SET.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Split one voice line into plain text and tag tokens so the transcript can
 * keep the delivery cues in place instead of dropping them.
 */
export function tokenizeQQVoiceText(content) {
    const source = String(content ?? '');
    const tokens = [];
    let cursor = 0;
    for (const match of source.matchAll(TAG_PATTERN)) {
        if (match.index > cursor) {
            tokens.push(Object.freeze({ type: 'text', value: source.slice(cursor, match.index) }));
        }
        const value = match[1].trim();
        tokens.push(Object.freeze({ type: 'tag', value, known: knownTag(value) }));
        cursor = match.index + match[0].length;
    }
    if (cursor < source.length) tokens.push(Object.freeze({ type: 'text', value: source.slice(cursor) }));
    return Object.freeze(tokens);
}

function collapseWhitespace(value) {
    return String(value ?? '')
        .replace(/[ \t\u00a0\u3000]+/gu, ' ')
        .replace(/ ?\n ?/gu, '\n')
        .trim();
}

/**
 * Describe one voice line: what the synthesizer receives, what the bubble shows,
 * and whether any tag breaks the FAS2 contract.
 */
export function parseQQVoiceText(content) {
    const source = String(content ?? '');
    const tokens = tokenizeQQVoiceText(source);
    const tags = tokens.filter((token) => token.type === 'tag');
    const displayText = collapseWhitespace(source.replace(TAG_PATTERN, (match, value) => knownTag(value) ? '' : match));
    const unknownTags = Object.freeze([...new Set(tags.filter((tag) => !tag.known).map((tag) => tag.value))]);
    return Object.freeze({
        tokens,
        tags: Object.freeze(tags.map((tag) => tag.value)),
        unknownTags,
        tagCount: tags.length,
        overTagLimit: tags.length > QQ_VOICE_TAG_LIMIT,
        hasUnknownTags: unknownTags.length > 0,
        ttsText: source.trim(),
        displayText,
        speakable: displayText.length > 0,
    });
}

/** Prompt-facing summary: the language model must never exceed the tag budget. */
export function describeQQVoiceTagBudget() {
    return { limit: QQ_VOICE_TAG_LIMIT, maxChars: QQ_VOICE_TAG_MAX_CHARS, knownTags: QQ_VOICE_KNOWN_TAGS };
}
