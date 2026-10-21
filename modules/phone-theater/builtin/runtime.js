import { getTableData } from '../../phone-core/data-api.js';
import { navigateBack } from '../../phone-core/routing.js';
import { registerRoutePageCleanup } from '../../phone-core/route-page-lifecycle.js';
import { subscribeTableUpdate } from '../../phone-core/callbacks.js';
import { subscribePhoneActivity, getPhoneCoreState } from '../../phone-core/state.js';
import { requestTableNavigationSwitch, buildTableNavigationControlState } from '../../table-navigation/controls.js';
import { getPhoneSettings, subscribePhoneSettingsUpdates } from '../../settings.js';
import { resolveStableChatId } from '../../integration/chat-identity.js';
import { getFreshSillyTavernContext } from '../../integration/context-bridge.js';
import { showToast } from '../../settings-app/ui/toast.js';
import { showImageViewerDialog } from '../../settings-app/services/image-viewer-dialog.js';
import { navigateToEditableTable } from '../interactions.js';
import { buildBuiltinTheaterSnapshot } from './model.js';
import { createBuiltinTheaterAssets } from './host-assets.js';
import { createBuiltinTheaterImageService } from './images.js';
import { createBuiltinImageController } from './image-controller.js';

const services = new Map();
/** Native scene mounting only. The route's existing content-preset precedence stays untouched. */
export function mountBuiltinTheater(container, options, deps = {}) {
    container.__yuziBuiltinDispose?.();
    const {scene, sheetKey, lifecycle} = options;
    const getRawData=deps.getRawData || getTableData;
    const getSettings=deps.getSettings || getPhoneSettings;
    const getChatScope=deps.getChatScope || resolveStableChatId;
    const chatScope=getChatScope();
    const controller=new AbortController();
    const {signal}=controller;
    const active=()=>!signal.aborted && lifecycle.isActive({allowDetached:true}) && getChatScope() === chatScope;
    const root=document.createElement('div'); root.className='yuzi-phone-theater-builtin';
    container.replaceChildren(root);
    let snapshot=buildBuiltinTheaterSnapshot(options.rawData, sheetKey,scene.id);
    let navigation=options.navigation || {};
    const listeners=new Set();
    const cleanups=[];
    const toastRuntime={registerCleanup:cleanup=>cleanups.push(cleanup),setTimeout:(callback,delay)=>{const id=setTimeout(()=>{if(active())callback();},delay);cleanups.push(()=>clearTimeout(id));return id;}};
    const assets=createBuiltinTheaterAssets({chatScope,isCurrent:active,signal,getSettings});
    if(!services.has(scene.id)) services.set(scene.id,createBuiltinTheaterImageService({sceneId:scene.id}));
    const imageController=createBuiltinImageController({
        root,sceneId:scene.id,signal,service:deps.imageService || services.get(scene.id),getSettings,getChatScope,isCurrent:active,
        getSnapshot:()=>buildBuiltinTheaterSnapshot(getRawData(),sheetKey,scene.id),
        notify:message=>{if(active()) showToast(root,message,true,toastRuntime);},
        showImage:(imagePath,description)=>{ const close=showImageViewerDialog({imagePath,altText:description,frameless:true}); if(close)cleanups.push(close); },
    });
    const theme={mode:getSettings().phoneThemeMode === 'dark' ? 'dark':'light'};
    const guarded=action=>()=>{if(active())return action();};
    const context={root,signal,theme,...assets,isCurrent:active,readOnly:!!options.readOnly,userName:getFreshSillyTavernContext()?.name1 || '我',
        getState:()=>({...snapshot,canPrevious:!navigation.previous?.disabled && !!navigation.previous?.target,canNext:!navigation.next?.disabled && !!navigation.next?.target}),
        subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
        mountImages:()=>imageController.mount(),
        isVisible:options.isVisible || (()=>getPhoneCoreState().isPhoneActive !== false),
        subscribeActivity:options.subscribeActivity || subscribePhoneActivity,
        notify:message=>{if(active())showToast(root,message,true,toastRuntime);},
        actions:options.actions || {back:guarded(navigateBack),previousTable:guarded(()=>requestTableNavigationSwitch(sheetKey,'previous')),nextTable:guarded(()=>requestTableNavigationSwitch(sheetKey,'next')),editCurrentTable:guarded(()=>navigateToEditableTable({sheetKey}))},
    };
    let unmount;
    const syncAppearance=()=>{
        if(!active())return;
        theme.mode=getSettings().phoneThemeMode === 'dark' ? 'dark':'light';
        root.firstElementChild?.setAttribute('data-theme',theme.mode);
        root.querySelectorAll('[data-theme]').forEach(node=>{node.dataset.theme=theme.mode;});
        imageController.updateSettings();
    };
    const dispose=()=>{
        if(signal.aborted)return; controller.abort(); unmount?.(); imageController.dispose();
        cleanups.splice(0).reverse().forEach(cleanup=>cleanup?.()); listeners.clear(); root.remove();
        if(container.__yuziBuiltinDispose === dispose) container.__yuziBuiltinDispose=null;
    };
    container.__yuziBuiltinDispose=dispose;
    cleanups.push(registerRoutePageCleanup(container,dispose));
    try {
        unmount=scene.mountBuiltin(context);
        cleanups.push((deps.subscribeSettings || subscribePhoneSettingsUpdates)(syncAppearance));
        cleanups.push((deps.subscribeTables || subscribeTableUpdate)(()=>{
            if(!active())return;
            const raw=getRawData(); snapshot=buildBuiltinTheaterSnapshot(raw,sheetKey,scene.id);
            navigation=buildTableNavigationControlState(raw,sheetKey);
            listeners.forEach(listener=>listener(context.getState()));
        }));
        requestAnimationFrame(()=>{if(active()){syncAppearance();imageController.mount();}});
    } catch(error) {dispose();throw error;}
    return dispose;
}
