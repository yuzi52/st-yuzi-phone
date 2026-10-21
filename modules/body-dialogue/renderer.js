import { parseQQVoiceText } from '../qq-v2/voice/emotion-tags.js';
import { decorateQQAvatar, decorateQQBubble } from '../qq-v2/ui/appearance.js';
import { parseBodyDialogue } from './config.js';
import { getBodyDialogueEmotion } from './emotions.js';
import { bodyDialogueRepository as repository } from './repository.js';
import { matchBodyModules, createBodyModuleView } from './beautify-modules.js';

const numericStyles = { fontSize: ['font-size', 'px'], nameSize: ['name-size', 'px'], lineHeight: ['line-height', ''],
    width: ['width', '%'], spacing: ['spacing', 'px'], avatarSize: ['avatar-size', 'px'], radius: ['radius', 'px'], quoteSize: ['quote-size', 'px'] };
const colorStyles = { nameColor: 'name-color', textColor: 'text-color', bubbleColor: 'bubble-color', quoteColor: 'quote-color' };
const element = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

// Images live for one rendered floor (or one standalone preview), never in a global cache.
function createDialogueImages() {
    const pending = new Map(), urls = new Set();
    let alive = true;
    return {
        load(asset) {
            const key = asset?.blob instanceof Blob ? asset.blob : asset?.mediaId;
            if (!alive || !key) return Promise.resolve('');
            if (!pending.has(key)) pending.set(key, (async () => {
                const media = asset.blob instanceof Blob ? asset : await repository.getMedia(asset.mediaId);
                if (!alive || !(media?.blob instanceof Blob)) return '';
                const url = URL.createObjectURL(media.blob); urls.add(url); return url;
            })());
            return pending.get(key);
        },
        dispose() { alive = false; pending.clear(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); },
    };
}

export function createDialogueView({ dialogue, config, person, userName = '', onPlay, images: sharedImages = null }) {
    const emotion = config.avatar && config.emotion ? getBodyDialogueEmotion(dialogue.emotion) : null;
    const node = element('span', `yuzi-body-dialogue${config.bubble ? '' : ' is-editorial'}${dialogue.name && dialogue.name === userName && config.align === 'right' ? ' is-self' : ''}`);
    node.setAttribute('data-yuzi-body-dialogue', '');
    let applied = {};
    const updateStyle = next => {
        for (const [key, [property, unit]] of Object.entries(numericStyles)) {
            if (applied[key] !== next[key]) node.style.setProperty(`--yuzi-body-${property}`, `${next[key]}${unit}`);
        }
        for (const [key, property] of Object.entries(colorStyles)) {
            if (applied[key] === next[key]) continue;
            if (next[key]) node.style.setProperty(`--yuzi-body-${property}`, next[key]);
            else node.style.removeProperty(`--yuzi-body-${property}`);
        }
        if (applied.avatarShape !== next.avatarShape) node.style.setProperty('--yuzi-body-avatar-radius', next.avatarShape === 'round' ? '50%' : next.avatarShape === 'rounded' ? '9px' : '0px');
        if (applied.align !== next.align) node.classList.toggle('is-self', Boolean(dialogue.name && dialogue.name === userName && next.align === 'right'));
        if (!config.bubble && applied.quote !== next.quote) {
            const paired = next.quote === 'pair';
            openingQuote.hidden = !paired;
            closingQuote.textContent = paired ? '」' : '”';
            closingQuote.classList.toggle('is-pair', paired);
            bubble.classList.toggle('is-paired-bilingual', paired && Boolean(dialogue.originalText));
        }
        applied = next;
    };
    let alive = true;
    const images = sharedImages || createDialogueImages();
    const load = async (asset, apply) => {
        if (!asset) return;
        try {
            const url = await images.load(asset);
            if (alive && url) apply(url);
        } catch { /* A missing image never hides the dialogue. */ }
    };
    if (config.avatar && dialogue.name) {
        const avatar = element('span', 'yuzi-body-avatar', Array.from(dialogue.name)[0]);
        avatar.setAttribute('aria-hidden', 'true'); node.append(avatar);
        const candidates = [emotion && person?.emotionAvatars?.[emotion.id], person?.avatar].filter(Boolean);
        const showAvatar = async index => {
            const asset = candidates[index];
            if (!alive || !asset) return;
            try {
                const url = await images.load(asset);
                if (!alive) return;
                if (!url) { await showAvatar(index + 1); return; }
                const image = element('img', 'yuzi-body-avatar-image'); image.alt = '';
                image.onload = () => { if (alive) avatar.replaceChildren(image); };
                image.onerror = () => { void showAvatar(index + 1); };
                image.src = url;
            } catch { await showAvatar(index + 1); }
        };
        void showAvatar(0);
        void load(person?.frame, url => decorateQQAvatar(avatar, url, person.frame.avatarFrameTransform));
    }
    const stack = element('span', 'yuzi-body-stack'); node.append(stack);
    if (config.avatar && dialogue.name) {
        const speaker = element('span', 'yuzi-body-speaker');
        speaker.append(element('span', 'yuzi-body-name', dialogue.name));
        if (emotion) {
            const label = element('span', 'phone-ios-badge yuzi-body-emotion', emotion.label);
            label.style.setProperty('--yuzi-body-emotion-color', emotion.color);
            speaker.append(label);
        }
        stack.append(speaker);
    }
    const bubble = element('span', 'yuzi-body-bubble'); stack.append(bubble);
    const openingQuote = config.bubble ? null : element('span', 'yuzi-body-quote is-pair', '「');
    const closingQuote = config.bubble ? null : element('span', 'yuzi-body-quote');
    const lines = dialogue.originalText ? element('span', 'yuzi-body-lines') : null;
    if (openingQuote) bubble.append(openingQuote);
    if (lines) {
        lines.append(element('span', 'yuzi-body-original', parseQQVoiceText(dialogue.originalText).displayText));
        bubble.append(lines);
    }
    (lines || bubble).append(element('span', 'yuzi-body-text', parseQQVoiceText(dialogue.text).displayText));
    if (closingQuote) bubble.append(closingQuote);
    updateStyle(config);
    if (config.bubble) void load(person?.bubble, url => decorateQQBubble(bubble, url, person.bubble.bubble));
    let playButton = null, rerollButton = null;
    if (config.voice && dialogue.name) {
        const play = element('button', 'yuzi-body-play', '▷'); play.type = 'button';
        playButton = play;
        play.setAttribute('aria-label', `朗读${dialogue.name}的对白`);
        play.title = person?.voice?.voiceId ? '播放／暂停' : '请先为此人物选择音色';
        play.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onPlay?.(play); });
        const reroll = element('button', 'yuzi-body-reroll', '↻'); reroll.type = 'button';
        rerollButton = reroll;
        reroll.hidden = true;
        reroll.title = '重roll语音';
        reroll.setAttribute('aria-label', `重新生成${dialogue.name}的语音`);
        reroll.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onPlay?.(play, true); });
        const controls = element('span', 'yuzi-body-voice-controls');
        controls.append(play, reroll); bubble.append(controls);
    }
    return { node, playButton, rerollButton, updateStyle, dispose() { alive = false; if (!sharedImages) images.dispose(); } };
}

// Only native prose containers/inline formatting. Unknown components are a hard boundary.
// SillyTavern wraps CJK dialogue in native <q> before Markdown conversion.
const INLINE = new Set(['Q', 'SPAN', 'EM', 'STRONG', 'B', 'I', 'U', 'S', 'DEL', 'SMALL', 'MARK']);
const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE']);
const isNativeProse = node => !node.className && !node.id && !node.hidden && !node.hasAttribute('style')
    && !node.getAttributeNames().some(name => name.startsWith('data-') || name === 'role' || name === 'contenteditable');

// Share the parser's boundaries: component-internal updates are not host prose.
export function isDialogueProseMutation(record, root) {
    let target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    for (; target && target !== root; target = target.parentElement) {
        if (!isNativeProse(target) || !(INLINE.has(target.tagName) || BLOCK.has(target.tagName))) return false;
    }
    if (target !== root) return false;
    if (record.type === 'characterData') return record.target.nodeType === 3;
    return [...record.addedNodes, ...record.removedNodes].some(node => {
        if (node.nodeType === 3) return Boolean(node.data);
        if (node.nodeType === 8) return node.data === 'yuzi-body-prose';
        return node.nodeType === 1 && (node.matches('[data-yuzi-body-dialogue], [data-yuzi-body-module]') || node.querySelector('[data-yuzi-body-dialogue], [data-yuzi-body-module]')
            || (isNativeProse(node) && (INLINE.has(node.tagName) || BLOCK.has(node.tagName) || node.tagName === 'BR')));
    });
}

function textRuns(root, bilingual) {
    const runs = []; let run = [];
    const flush = () => { if (run.length) runs.push(run); run = []; };
    const newline = () => { if (run.length) run.push({ data: '\n', length: 1 }); };
    const visit = parent => {
        for (const child of parent.childNodes) {
            if (child.nodeType === 3) { if (child.length) run.push(child); continue; }
            if (child.nodeType !== 1) { flush(); continue; }
            if (!isNativeProse(child)) { flush(); continue; }
            if (child.tagName === 'BR') run.push({ data: '\n', length: 1, element: child });
            else if (INLINE.has(child.tagName)) visit(child);
            else if (bilingual && ['P', 'DIV'].includes(child.tagName)) { newline(); visit(child); newline(); }
            else if (BLOCK.has(child.tagName)) { flush(); visit(child); flush(); }
            else flush();
        }
    };
    visit(root); flush(); return runs;
}

/** Reversible, display-only replacements. No writes to chat messages or message metadata. */
export function renderDialogueFloor(root, { config, people, userName, onPlay, modules = [], mutateProse = update => update() }) {
    const images = createDialogueImages();
    const replacements = [], voiceItems = [], emptyContainers = new Set();
    for (const nodes of textRuns(root, config.bilingual)) {
        const runVoiceItems = [];
        const segments = []; let offset = 0;
        for (const node of nodes) { segments.push({ node, start: offset, end: offset + node.length }); offset += node.length; }
        const text = nodes.map(node => node.data).join('');
        // Built-in dialogue keeps ownership of its spans. Additional modules share
        // the same offsets, overlap resolution and reversible replacement below.
        const matches = matchBodyModules(text, modules, parseBodyDialogue(text, config));
        let segmentEnd = segments.length - 1;
        for (const dialogue of matches.reverse()) {
            while (segmentEnd >= 0 && segments[segmentEnd].start >= dialogue.end) segmentEnd--;
            let segmentStart = segmentEnd;
            while (segmentStart > 0 && segments[segmentStart - 1].end > dialogue.start) segmentStart--;
            const parts = segments.slice(segmentStart, segmentEnd + 1).filter(part => part.node.nodeType === 3 || part.node.element);
            segmentEnd = segmentStart;
            if (!parts.length) continue;
            const person = people.get(dialogue.name);
            let view;
            try {
                view = dialogue.module ? createBodyModuleView(dialogue)
                    : createDialogueView({ dialogue, config, person, userName, images, onPlay: (button, reroll) => onPlay(dialogue, person, button, reroll) });
            } catch (error) {
                if (!dialogue.module) throw error;
                dialogue.module.failed = true;
                dialogue.module.report(dialogue.module.entry.id, error);
                continue;
            }
            if (view.playButton) runVoiceItems.push({ dialogue, person, button: view.playButton, rerollButton: view.rerollButton });
            const slots = [];
            // Replace text slices, not their ancestors: <q>, inline formatting and paragraph
            // boundaries must restore in place, without cloning/nesting the original wrappers.
            for (let index = parts.length - 1; index >= 0; index--) {
                const part = parts[index], node = index === 0 ? view.node : document.createComment('yuzi-body-prose');
                let original = part.node.element;
                if (original) original.replaceWith(node);
                else {
                    const range = document.createRange();
                    range.setStart(part.node, Math.max(0, dialogue.start - part.start));
                    range.setEnd(part.node, Math.min(part.node.length, dialogue.end - part.start));
                    original = range.extractContents(); range.insertNode(node);
                }
                slots.push({ node, original });
                for (let parent = node.parentElement; parent && parent !== root && isNativeProse(parent)
                    && (INLINE.has(parent.tagName) || ['P', 'DIV'].includes(parent.tagName)); parent = parent.parentElement) {
                    emptyContainers.add(parent);
                }
            }
            replacements.push({ ...view, slots });
        }
        // Text replacements run backwards; speech follows the visible reading order.
        voiceItems.push(...runVoiceItems.reverse());
    }
    const emptyProse = node => node.nodeType === 8 || (node.nodeType === 3 ? !node.data.trim()
        : node.nodeType === 1 && isNativeProse(node) && (INLINE.has(node.tagName) || ['P', 'DIV', 'BR'].includes(node.tagName))
            && [...node.childNodes].every(emptyProse));
    const hiddenContainers = [...emptyContainers].filter(emptyProse);
    hiddenContainers.forEach(node => { node.hidden = true; });
    const restoreViews = views => {
        const restoredParents = new Set();
        for (const view of views) {
            view.dispose();
            for (const slot of view.slots) if (slot.node.parentNode) {
                restoredParents.add(slot.node.parentNode);
                slot.node.replaceWith(slot.original);
            }
        }
        // Range insertion splits text nodes. Coalesce only touched siblings, never
        // normalize whole subtrees (which may contain other extensions' components).
        for (const parent of restoredParents) {
            let previous = null;
            for (const child of [...parent.childNodes]) {
                if (child.nodeType !== 3) { previous = null; continue; }
                if (!child.length) child.remove();
                else if (previous) { previous.appendData(child.data); child.remove(); }
                else previous = child;
            }
        }
    };
    // Mount only after all original slices are retained; a late failure restores
    // this view without discarding another module or an existing dialogue.
    for (const view of replacements) view.mount?.(() => mutateProse(() => {
        restoreViews([view]);
        hiddenContainers.forEach(node => { if (node.textContent.trim()) node.hidden = false; });
        const index = replacements.indexOf(view);
        if (index >= 0) replacements.splice(index, 1);
    }));
    return {
        voiceItems,
        isIntact: () => replacements.every(view => view.slots.every(slot => root.contains(slot.node))),
        updateStyle: next => replacements.forEach(view => view.updateStyle(next)),
        dispose() {
            images.dispose();
            restoreViews(replacements);
            hiddenContainers.forEach(node => { node.hidden = false; });
        },
    };
}
