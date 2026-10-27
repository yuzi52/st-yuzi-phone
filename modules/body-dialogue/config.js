import { QQ_VOICE_TAG_GUIDE } from '../qq-v2/voice/emotion-tags.js';
import { normalizeQQVoiceSpeechControls } from '../qq-v2/voice/speech-controls.js';
import { BODY_DIALOGUE_EMOTIONS } from './emotions.js';

const BILINGUAL_RULE = '人物对白先输出自然连贯的日语原文，再翻译成中文，中文采用动漫汉化组翻译风格。';
const TONE_RULE = `请结合剧情、人物情绪和说话习惯，主动使用以下声音标记，让对白像真人说话一样自然生动。

标记可以穿插在对白的开头、中间和结尾附近。情绪、音量、语速发生变化时，把相应标记放在需要改变的词句前；停顿、呼吸、叹气、笑声等放在实际发生的位置。

同一条对白可以随情节出现多次自然变化，也可以组合相符的情绪与语气标记。普通短句不必强加，避免频繁切换、重复堆叠或使用互相矛盾的标记。

每条对白最多 10 个标记；仅使用下列 25 种。

${QQ_VOICE_TAG_GUIDE}`;
const PROSODY_RULE = `请结合当前剧情、人物性格、情绪和说话习惯，为每条对白设置语速与表现力。

语速范围为0.5～2.0：0.5为半速，1为正常速度，2为两倍速。
表现力范围为0～1：低值表现更稳定一致，高值表现更多变，不表示固定的某种情绪。

按实际语境选择，不必刻意使用极端值；无明显需要时，使用语速1、表现力0.7。`;
const namedDialogue = (config, name, content, parameters = '1,0.7') =>
    `「${name}|${config.avatar && config.emotion ? `${name === '姓名' ? '情绪' : '平静'}|` : ''}${content}${config.voice && config.prosody ? `|${parameters}` : ''}」`;
export const BODY_DIALOGUE_PROMPTS = Object.freeze({
    base: '正文中人物说出口的对白用「」包裹',
    name: '对白格式为「姓名|对白」，姓名使用人物真名，同一人物保持一致。',
    emotion: `从下方情绪标签中，选择一个适合当前对白的标签。\n${BODY_DIALOGUE_EMOTIONS.map(emotion => emotion.label).join('、')}`,
    bilingual: `${BILINGUAL_RULE}按以下两行成对输出：\n「日语台词」\n「中文翻译」`,
    tone: `${TONE_RULE}\n\n例如：「小玉|你终于来了……[slight pause][sad]我还以为你不会来了。[whispering]下次别让我等这么久，好吗？」`,
    prosody: PROSODY_RULE,
    punctuation: '请结合人物性格、当前语境和情绪，自然使用标点表达对白的节奏与语气。\n\n需要疑问、惊讶、迟疑、停顿或话语中断时，合理使用问号、感叹号、省略号和破折号等标点。\n\n标点应服务于台词表达，不必每句添加，也不要连续堆叠。不要为了控制朗读而额外添加Emoji或颜文字。',
});

export function bodyDialogueDefaultPrompts(config = {}) {
    if (!config.bilingual) return {
        ...BODY_DIALOGUE_PROMPTS,
        name: `对白格式为${namedDialogue(config, '姓名', '对白', '语速,表现力')}，姓名使用人物真名，同一人物保持一致。`,
        tone: `${TONE_RULE}\n\n例如：${namedDialogue(config, '小玉', '你终于来了……[slight pause][sad]我还以为你不会来了。[whispering]下次别让我等这么久，好吗？')}`,
    };
    return {
        ...BODY_DIALOGUE_PROMPTS,
        name: `姓名使用人物真名，同一人物保持一致。格式：\n「原文台词」\n${namedDialogue(config, '姓名', '中文翻译', '语速,表现力')}`,
        tone: `${TONE_RULE}\n\n声音标记仅添加在第一行原文对白中，按剧情和人物情绪自然穿插在原文的开头、中间和结尾附近。第二行中文仅翻译对白内容，不包含声音标记。\n\n例如：\n「やっと来た……[slight pause][sad]もう来ないのかと思った。[whispering]次は、こんなに待たせないでね。」\n${namedDialogue(config, '小玉', '你终于来了……我还以为你不会来了。下次别让我等这么久，好吗？')}`,
    };
}

// Only built-in examples follow mode changes. User-authored text stays byte-for-byte intact.
const legacyToneRule = `可在对应对白前加入以下声音标记；按场景选用，每条最多 10 个，不能只写标记。共 25 种：\n\n${QQ_VOICE_TAG_GUIDE}`;
const promptModes = [false, true].flatMap(bilingual => [false, true].flatMap(readOriginal => [false, true].map(prosody =>
    ({ bilingual, readOriginal, prosody, voice: true }))));
const previousTonePrompts = promptModes.map(config => ({
    tone: config.bilingual
        ? `${TONE_RULE}\n\n例如：\n「${config.readOriginal ? 'やっと来た……[slight pause][sad]もう来ないのかと思った。[whispering]次は、こんなに待たせないでね。' : 'やっと来た……もう来ないのかと思った。次は、こんなに待たせないでね。'}」\n${namedDialogue(config, '小玉', '你终于来了……[slight pause][sad]我还以为你不会来了。[whispering]下次别让我等这么久，好吗？')}`
        : bodyDialogueDefaultPrompts(config).tone,
}));
// Recognize the previous built-in wording exactly; never rewrite user-authored text.
const legacyProsodyRule = `${PROSODY_RULE.replaceAll('表现力', '张力')}\n\n在对白最后追加“|语速,张力”。`;
const defaultVariants = [BODY_DIALOGUE_PROMPTS,
    ...promptModes.map(bodyDialogueDefaultPrompts),
    ...promptModes.map(config => bodyDialogueDefaultPrompts({ ...config, avatar: true, emotion: true })),
    { bilingual: '人物对白按以下两行成对输出，日语自然连贯，中文动漫汉化组翻译：\n「日语台词」\n「中文翻译」' },
    ...previousTonePrompts,
    ...promptModes.map((config, index) => ({
        name: config.bilingual
            ? `姓名使用人物真名，同一人物保持一致。例如：\n「原文台词」\n${namedDialogue(config, '小玉', '中文翻译', '0.95,0.75')}`
            : `对白写为「姓名|对白${config.prosody ? '|语速,张力' : ''}」，姓名使用人物真名，同一人物保持一致。例如：${namedDialogue(config, '小玉', '你好。', '0.95,0.75')}`,
        tone: previousTonePrompts[index].tone.replaceAll('|1,0.7', '|0.95,0.75'),
        prosody: `${legacyProsodyRule}\n例如：${config.bilingual ? '\n「やっと来てくれたんだね……」\n' : ''}「小玉|你终于来了……|0.95,0.75」`,
    })),
    { punctuation: BODY_DIALOGUE_PROMPTS.punctuation.replace('等标点。', '等标点。符合人物说话习惯时，可适当使用“～”表达轻快、撒娇或尾音延展的文字感觉。') },
    { tone: `${legacyToneRule}\n\n例如：「小玉|[whispering]别吵醒她。」` },
    ...[false, true].map(readOriginal => ({ tone: `${legacyToneRule}\n\n例如：\n「${readOriginal ? '[whispering]' : ''}原文台词」\n「小玉|[whispering]中文翻译」` })),
];
const defaultPromptValues = Object.fromEntries(Object.keys(BODY_DIALOGUE_PROMPTS).map(key => [
    key, new Set(defaultVariants.map(variant => variant[key])),
]));

// Each capability owns its prompt contribution and its format/display requirements.
// A future field belongs here and in the parser, not in an unrelated prompt append hook.
export const BODY_DIALOGUE_MODULES = Object.freeze([
    { id: 'base', prompt: 'base', active: () => true },
    { id: 'bilingual', prompt: 'bilingual', active: config => config.bilingual },
    { id: 'avatar', prompt: 'name', identity: true, active: config => config.avatar },
    { id: 'emotion', prompt: 'emotion', active: config => config.avatar && config.emotion },
    { id: 'voice', prompt: 'name', identity: true, active: config => config.voice },
    { id: 'prosody', prompt: 'prosody', active: config => config.voice && config.prosody },
    { id: 'punctuation', prompt: 'punctuation', active: config => config.voice && config.punctuation },
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
    paddingInline: ['气泡左右内边距', 0, 48, 1, 'px', 12],
    quoteSize: ['引号大小', 12, 64, 1, 'px', 28],
});

export function normalizeBodyDialogue(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const config = {
        enabled: source.enabled === true, avatar: source.avatar !== false,
        emotion: source.emotion === true,
        voice: source.voice === true, tone: source.tone === true, bubble: source.bubble !== false,
        prosody: source.prosody === true, punctuation: source.punctuation === true,
        bilingual: source.bilingual === true, readOriginal: source.readOriginal === true, preGenerate: source.preGenerate === true,
        reroll: source.reroll === true,
        align: source.align === 'right' ? 'right' : 'left',
        avatarShape: ['round', 'rounded', 'square'].includes(source.avatarShape) ? source.avatarShape : 'round',
        quote: source.quote === 'pair' ? 'pair' : 'tail',
    };
    config.prompts = Object.fromEntries(Object.entries(bodyDialogueDefaultPrompts(config)).map(([key, text]) => [
        key, typeof source.prompts?.[key] === 'string' && !defaultPromptValues[key].has(source.prompts[key]) ? source.prompts[key] : text,
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

export function composeBodyDialoguePrompt(config, people = [], modulePrompt = '') {
    if (!config.enabled) return '';
    const { identity, prompts } = bodyDialogueFormat(config);
    const defaultName = defaultPromptValues.name.has(config.prompts.name);
    const mergeDefaults = config.bilingual && identity && config.prompts.bilingual === BODY_DIALOGUE_PROMPTS.bilingual
        && defaultName;
    const emotion = prompts.includes('emotion') ? config.prompts.emotion : '';
    const blocks = prompts.filter(key => !['tone', 'emotion'].includes(key) && !(mergeDefaults && key === 'name')).flatMap(key => {
        if (mergeDefaults && key === 'bilingual') return [
            `${BILINGUAL_RULE}\n姓名使用人物真名，同一人物保持一致。按以下两行成对输出。`, emotion,
            `格式：\n「日语台词」\n${namedDialogue(config, '姓名', '中文翻译', '语速,表现力')}`,
        ];
        if (key === 'name' && emotion) return defaultName ? [
            `姓名使用人物真名，同一人物保持一致。${config.bilingual ? '按以下两行成对输出。' : ''}`, emotion,
            `格式：\n${config.bilingual ? '「原文台词」\n' : ''}${namedDialogue(config, '姓名', config.bilingual ? '中文翻译' : '对白', '语速,表现力')}`,
        ] : [emotion, config.prompts.name];
        return config.prompts[key];
    });
    if (bodyDialogueUsesPersonLanguages(config)) {
        for (const person of people) {
            const language = normalizeBodyDialogueLanguage(person.language);
            if (person.name && language) blocks.push(`${person.name}的对白原文改用${language}，格式为：\n「${language}台词」\n${namedDialogue(config, person.name, '中文翻译', '语速,表现力')}`);
        }
    }
    // Keep voice guidance after the built-in language overrides, before independent modules.
    if (prompts.includes('tone')) blocks.push(config.prompts.tone);
    if (modulePrompt) blocks.push(modulePrompt);
    return blocks.filter(Boolean).join('\n\n');
}

/** Positions refer to visible text, never to HTML. Invalid or disabled structures remain untouched. */
export function parseBodyDialogue(text, config) {
    if (!config.enabled) return [];
    const identity = bodyDialogueFormat(config).identity;
    const result = [];
    for (const match of String(text).matchAll(/「([^「」]+)」/gu)) {
        const fields = match[1].split('|').map(field => field.trim());
        if (fields.length > 4 || (fields.length >= 2 && !identity)) continue;
        // Parse saved formats independently of the switch; numeric tails belong to legacy speech controls.
        const hasEmotion = fields.length === 4 || (fields.length === 3
            && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)?\s*[,，]\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)?$/u.test(fields[2]));
        const name = fields.length >= 2 ? fields[0] : '';
        const content = fields[hasEmotion ? 2 : fields.length >= 2 ? 1 : 0];
        if (!content || (fields.length >= 2 && !name)) continue;
        const controls = fields.length === 4 ? fields[3].split(/[,，]/u)
            : fields.length === 3 && !hasEmotion ? fields[2].split(/[,，]/u) : null;
        result.push({ start: match.index, end: match.index + match[0].length, raw: match[0], name, text: content,
            emotion: hasEmotion ? fields[1] : '',
            ...(controls ? { speechControls: normalizeQQVoiceSpeechControls({
                speed: controls.length === 2 && controls[0].trim() ? Number(controls[0]) : undefined,
                temperature: controls.length === 2 && controls[1].trim() ? Number(controls[1]) : undefined,
            }) } : {}) });
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

export function bodyDialogueSpeechControls(dialogue, config) {
    return config.voice && config.prosody ? normalizeQQVoiceSpeechControls(dialogue.speechControls) : null;
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
