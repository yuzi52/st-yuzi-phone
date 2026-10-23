import { getBuiltinImageCanvases } from './model.js';

/** One controller per page. List and detail subscribe to the same record/canvas state. */
export function createBuiltinImageController(options) {
    const { root, service, sceneId, signal } = options;
    const states = new Map();
    const frames = new Map();
    const chatScope = options.getChatScope();
    let disposed = false;
    const active = () => !disposed && !signal.aborted && options.isCurrent() && options.getChatScope() === chatScope;
    const enabled = () => options.getSettings()?.imageGeneration?.enabled === true && options.getSettings()?.imageGeneration?.theaterEnabled?.[sceneId] === true;
    const sourceInput = (canvas, record) => {
        const snapshot = options.getSnapshot();
        return { canvas, rowValues: record.fields, candidateRows: snapshot.records.map(row => row.fields), chatScope,
            requestContext: { isStillCurrent: () => active() && options.getSnapshot().records.some(row => canvas.stableIdentityFields.every(field => row.fields[field] === record.fields[field]) && canvas.promptFields.every(field => row.fields[field] === record.fields[field])) },
        };
    };
    function paint(frame, binding) {
        // Routes prepare detached DOM before committing it; painting needs no layout.
        // The lifecycle guard still rejects disposed pages and stale chat scopes.
        if (!active()) return;
        const { state, button, description, image, canvas } = binding;
        const imagePath=binding.validIdentity ? state.imagePath : '';
        button.hidden = !enabled(); button.disabled = state.busy || !binding.validIdentity;
        const label = state.busy ? '生成中…' : imagePath ? '重新生成图片' : '生成图片';
        button.title = binding.validIdentity ? label : '记录标识重复，无法安全关联图片';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-busy', String(state.busy));
        button.classList.toggle('is-loading', state.busy);
        button.firstElementChild.className = 'fa-solid fa-' + (imagePath ? 'rotate' : 'wand-magic-sparkles');
        frame.dataset.hasImage = String(Boolean(imagePath));
        image.hidden = !imagePath;
        if (imagePath && image.getAttribute('src') !== imagePath) image.src = imagePath;
        description.hidden = Boolean(imagePath);
        if (canvas.canvas === 'background') {
            root.querySelector('.yuzi-theater-live')?.setAttribute('data-has-generated-image', String(Boolean(imagePath)));
        }
    }
    function repaint() {
        for (const [frame, binding] of frames) {
            if (!root.contains(frame)) { binding.dispose(); frames.delete(frame); continue; }
            paint(frame, binding);
        }
    }
    function mount() {
        if (!active()) return;
        const snapshot = options.getSnapshot();
        root.querySelectorAll('[data-image-canvas]').forEach(frame => {
            const record = snapshot.records[Number(frame.dataset.recordIndex)];
            if (!record) return;
            const canvas = getBuiltinImageCanvases(snapshot, record).find(item => item.canvas === frame.dataset.imageCanvas);
            if (!canvas) return;
            const stamp=JSON.stringify(record.fields);
            const previous=frames.get(frame);
            if(previous?.stamp === stamp) return;
            previous?.dispose(); frames.delete(frame);
            const frameController=new AbortController();
            const frameSignal=frameController.signal;
            const abortFrame=()=>frameController.abort();
            signal.addEventListener('abort',abortFrame,{once:true});
            const validIdentity=snapshot.records.filter(row=>canvas.stableIdentityFields.every(field=>row.fields[field] === record.fields[field])).length === 1;
            const key = JSON.stringify([canvas.canvas, ...canvas.stableIdentityFields.map(field => record.fields[field])]);
            let state = states.get(key);
            if (!state) { state = { busy: false, imagePath: '', revision: 0 }; states.set(key, state); }
            const description = document.createElement('span'); description.className = 'yuzi-phone-theater-image-note';
            const imageDescription=canvas.promptFields.filter(field => field !== '发帖账号名').map(field => record.fields[field]).filter(Boolean).join('\n');
            description.textContent = sceneId === 'forum' ? record.fields['分区/版面名'] || '图文主图' : imageDescription;
            const image = document.createElement('img'); image.className = 'yuzi-phone-theater-generated-image'; image.alt = imageDescription; image.hidden = true;
            const button = document.createElement('button'); button.type='button'; button.className='yuzi-phone-theater-image-button'; button.dataset.theaterGenerate = canvas.canvas;
            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            button.append(icon);
            if (canvas.canvas === 'background') {
                frame.append(image);
                root.querySelector('.yuzi-theater-live').append(button);
            } else frame.replaceChildren(image, description, button);
            const binding = { state, button, description, image, canvas, stamp, validIdentity, dispose:()=>{frameController.abort();signal.removeEventListener('abort',abortFrame);if(canvas.canvas === 'background'){button.remove();image.remove();}} };
            frames.set(frame, binding); paint(frame, binding);
            if (validIdentity && !state.readRequested) { state.readRequested=true; void service.read({ canvas, rowValues: record.fields, chatScope }).then(saved => { if (active() && state.revision === 0) { state.imagePath=saved?.imagePath || ''; repaint(); } }).catch(() => {}); }
            button.addEventListener('click', async event => {
                event.preventDefault(); event.stopPropagation();
                if (!active() || !enabled() || state.busy || !validIdentity) return;
                state.revision += 1; state.busy=true; repaint();
                try {
                    const requestCanvas = {...canvas};
                    if (canvas.canvas === 'background') {
                        const rect=frame.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) requestCanvas.promptSuffix='画布尺寸为 ' + Math.round(rect.width) + '×' + Math.round(rect.height) + '，宽高比为 ' + Math.round(rect.width) + ':' + Math.round(rect.height) + '，主体完整呈现。';
                    }
                    const result=await service.generate(sourceInput(requestCanvas, record));
                    if (!active()) return;
                    if (result.ok) state.imagePath=result.imagePath;
                    else options.notify?.(result.reason === 'identity-duplicate' ? '记录标识重复，无法安全关联图片' : '图片生成失败，已保留原图：' + (result.reason || result.status || '未知错误'));
                } catch(error) { if(active()) options.notify?.(error.message || '图片生成失败'); }
                finally { state.busy=false; if(active()) repaint(); }
            }, {signal:frameSignal});
            image.tabIndex=0; image.setAttribute('role','button');
            const view = event => { event.stopPropagation(); if(active() && state.imagePath) options.showImage?.(state.imagePath, imageDescription); };
            // In the forum feed the card owns navigation; only detail opens the viewer.
            image.addEventListener('click', event => { if(!frame.closest('[data-post-index]')) view(event); }, {signal:frameSignal});
            image.addEventListener('keydown', event => { if(event.key === 'Enter' && !frame.closest('[data-post-index]')) view(event); }, {signal:frameSignal});
        });
        repaint();
    }
    function dispose() { disposed=true; for(const binding of frames.values())binding.dispose(); frames.clear(); states.clear(); }
    signal.addEventListener('abort', dispose, {once:true});
    return { mount, updateSettings: repaint, dispose };
}
