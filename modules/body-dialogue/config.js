import { QQ_VOICE_PROMPT_RULE } from '../qq-v2/voice/emotion-tags.js';

const TONE_RULE = QQ_VOICE_PROMPT_RULE.replace('voice 正文写台词，可在对应台词前', '可在对应对白前');
export const BODY_DIALOGUE_PROMPTS = Object.freeze({
    base: '正文中人物说出口的对白用「」包裹',
    name: '对白写为「姓名|对白」，姓名使用人物真名，同一人物保持一致。例如：「小玉|你好。」',
    bilingual: '人物对白按以下两行成对输出，日语自然连贯，中文动漫汉化组翻译：\n「日语台词」\n「中文翻译」',
    tone: `${TONE_RULE}\n\n例如：「小玉|[whispering]别吵醒她。」`,
});

export function bodyDialogueDefaultPrompts(config = {}) {
    if (!config.bilingual) return { ...BODY_DIALOGUE_PROMPTS };
    return {
        ...BODY_DIALOGUE_PROMPTS,
        name: '姓名使用人物真名，同一人物保持一致。例如：\n「原文台词」\n「小玉|中文翻译」',
        tone: `${TONE_RULE}\n\n例如：\n「${config.readOriginal ? '[whispering]' : ''}原文台词」\n「小玉|[whispering]中文翻译」`,
    };
}

// Only built-in examples follow mode changes. User-authored text stays byte-for-byte intact.
const defaultVariants = [BODY_DIALOGUE_PROMPTS, bodyDialogueDefaultPrompts({ bilingual: true }), bodyDialogueDefaultPrompts({ bilingual: true, readOriginal: true })];

// Each capability owns its prompt contribution and its format/display requirements.
// A future field belongs here and in the parser, not in an unrelated prompt append hook.
export const BODY_DIALOGUE_MODULES = Object.freeze([
    { id: 'base', prompt: 'base', active: () => true },
    { id: 'bilingual', prompt: 'bilingual', active: config => config.bilingual },
    { id: 'avatar', prompt: 'name', identity: true, active: config => config.avatar },
    { id: 'voice', prompt: 'name', identity: true, active: config => config.voice },
    { id: 'tone', prompt: 'tone', active: config => config.voice && config.tone },
]);

export const BODY_DIALOGUE_NUMBERS = Object.freeze({
    layers: ['渲染楼层', 1, 100, 1, '层', 1],
    fontSize: ['对白字号', 12, 32, 1, 'px', 15],
    nameSize: ['姓名字号', 10, 28, 1, 'px', 13],
    lineHeight: ['对白行高', 1, 3, 0.05, '', 1.65],
    width: ['最大宽度', 30, 100, 1, '%', 85],
    spacing: ['对话间距', 0, 48, 1, 'px', 12],
    avatarSize: ['头像大小', 20, 100, 1, 'px', 38],
    radius: ['气泡圆角', 0, 48, 1, 'px', 14],
    quoteSize: ['引号大小', 12, 64, 1, 'px', 28],
});

export function normalizeBodyDialogue(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const config = {
        enabled: source.enabled === true, avatar: source.avatar !== false,
        voice: source.voice === true, tone: source.tone === true, bubble: source.bubble !== false,
        bilingual: source.bilingual === true, readOriginal: source.readOriginal === true,
        align: source.align === 'right' ? 'right' : 'left',
        avatarShape: ['round', 'rounded', 'square'].includes(source.avatarShape) ? source.avatarShape : 'round',
        quote: source.quote === 'pair' ? 'pair' : 'tail',
    };
    config.prompts = Object.fromEntries(Object.entries(bodyDialogueDefaultPrompts(config)).map(([key, text]) => [
        key, typeof source.prompts?.[key] === 'string' && !defaultVariants.some(variant => variant[key] === source.prompts[key]) ? source.prompts[key] : text,
    ]));
    for (const [key, [, min, max, step, , fallback]] of Object.entries(BODY_DIALOGUE_NUMBERS)) {
        const number = Number(source[key] ?? fallback);
        config[key] = Number.isFinite(number)
            ? Math.round(Math.max(min, Math.min(max, Math.round(number / step) * step)) * 100) / 100 : fallback;
    }
    for (const key of ['nameColor', 'textColor', 'bubbleColor', 'quoteColor']) {
        config[key] = /^#[\da-f]{6}$/i.test(source[key] || '') ? source[key] : '';
    }
    return config;
}

export function bodyDialogueFormat(config) {
    const active = BODY_DIALOGUE_MODULES.filter(module => module.active(config));
    return { identity: active.some(module => module.identity), prompts: [...new Set(active.map(module => module.prompt))] };
}

export function normalizeBodyDialogueLanguage(value) {
    const language = String(value ?? '').trim();
    return language === '默认' ? '' : language;
}

export function bodyDialogueUsesPersonLanguages(config) {
    return config.enabled && config.bilingual && bodyDialogueFormat(config).identity;
}

export function composeBodyDialoguePrompt(config, people = []) {
    if (!config.enabled) return '';
    const { identity, prompts } = bodyDialogueFormat(config);
    const mergeDefaults = config.bilingual && identity && config.prompts.bilingual === BODY_DIALOGUE_PROMPTS.bilingual
        && defaultVariants.some(variant => variant.name === config.prompts.name);
    const blocks = prompts.filter(key => key !== 'tone' && !(mergeDefaults && key === 'name')).map(key =>
        mergeDefaults && key === 'bilingual'
            ? '人物对白按以下两行成对输出，日语自然连贯，中文动漫汉化组翻译，姓名使用人物真名，同一人物保持一致。例如：\n「日语台词」\n「小玉|中文翻译」'
            : config.prompts[key]);
    if (bodyDialogueUsesPersonLanguages(config)) {
        for (const person of people) {
            const language = normalizeBodyDialogueLanguage(person.language);
            if (person.name && language) blocks.push(`${person.name}的对白原文改用${language}，格式为：\n「${language}台词」\n「${person.name}|中文翻译」`);
        }
    }
    // Keep voice guidance last so it also applies to each person's language override.
    if (prompts.includes('tone')) blocks.push(config.prompts.tone);
    return blocks.filter(Boolean).join('\n\n');
}

/** Positions refer to visible text, never to HTML. Invalid or disabled structures remain untouched. */
export function parseBodyDialogue(text, config) {
    if (!config.enabled) return [];
    const identity = bodyDialogueFormat(config).identity;
    const result = [];
    for (const match of String(text).matchAll(/「([^「」]+)」/gu)) {
        const fields = match[1].split('|');
        if (fields.length > 2 || (fields.length === 2 && !identity)) continue;
        const name = fields.length === 2 ? fields[0].trim() : '';
        const content = fields.at(-1).trim();
        if (!content || (fields.length === 2 && !name)) continue;
        result.push({ start: match.index, end: match.index + match[0].length, raw: match[0], name, text: content });
    }
    if (!config.bilingual) return result;
    const paired = [];
    for (let index = 0; index < result.length; index++) {
        const first = result[index], second = result[index + 1];
        if (!first.name && second && /^\s*$/u.test(String(text).slice(first.end, second.start))) {
            paired.push({ ...second, start: first.start, raw: String(text).slice(first.start, second.end),
                originalText: first.text });
            index++;
        } else paired.push(first);
    }
    return paired;
}

export function bodyDialogueSpeech(dialogue, config) {
    return config.bilingual && config.readOriginal && dialogue.originalText ? dialogue.originalText : dialogue.text;
}

export function selectBodyDialogueFloors(chat, count, pendingIndex = -1) {
    const result = [];
    for (let index = (chat?.length || 0) - 1; index >= 0 && result.length < count; index--) {
        const message = chat[index];
        if ((pendingIndex >= 0 && index >= pendingIndex) || !message || message.is_user || message.is_system) continue;
        result.unshift({ index, message });
    }
    return result;
}
