import { getPhoneSettings, savePhoneSetting, flushPhoneSettingsSave, waitForPhoneSettingsSave } from '../../settings.js';
import { getQQV2Facade } from '../../qq-v2/runtime/default-runtime.js';

/** Persistent appearance assets use the existing Blob codec; never the cache or workshop. */
export function createBuiltinTheaterAssets({chatScope, isCurrent, signal, getSettings = getPhoneSettings}) {
    const facade = getQQV2Facade();
    const leases = new Set();
    const urls = new Map();
    let pendingSave = Promise.resolve();
    const release = leaseId => { void facade?.intent?.releaseMediaRender?.({leaseId}).catch(() => {}); };
    signal.addEventListener('abort', () => { leases.forEach(release); leases.clear(); urls.clear(); }, {once:true});
    const getRender = async assetId => {
        if (!assetId || !isCurrent()) return '';
        const result = await facade?.query?.mediaRender?.({assetId});
        const render = result?.render;
        if(!render?.url) return '';
        if(!isCurrent()) { release(render.leaseId); return ''; }
        leases.add(render.leaseId); return render.url;
    };
    let contacts;
    const getUrl = slot => {
        if(urls.has(slot)) return urls.get(slot);
        const promise = (async () => {
            if(!isCurrent()) return '';
            if(slot === 'protagonist-avatar') {
                const [profile, context] = await Promise.all([facade?.query?.currentProfile?.(), facade?.query?.currentContext?.()]);
                const custom = await getRender(profile?.profile?.avatarAssetId);
                const fallback = context?.context?.user?.avatar || '';
                return custom || (fallback && !fallback.includes('/') ? '/User Avatars/' + encodeURIComponent(fallback) : fallback);
            }
            const prefix='character-avatar-'; if(!slot.startsWith(prefix)) return '';
            const name=decodeURIComponent(slot.slice(prefix)).normalize('NFKC').trim();
            contacts ||= Promise.resolve(facade?.query?.conversations?.()).then(result => {
                const byName = new Map();
                for (const person of result?.conversations || []) {
                    if (person.kind !== 'private') continue;
                    const name = String(person.formalName).normalize('NFKC').trim();
                    byName.set(name, byName.has(name) ? null : person);
                }
                return byName;
            });
            const person = (await contacts).get(name);
            return person ? getRender(person.avatarAssetId) : '';
        })().catch(() => ''); urls.set(slot,promise); return promise;
    };
    return {
        presetAssets: {getUrl},
        profile: {
            get: (key, fallback='') => getSettings()?.theaterProfiles?.[chatScope]?.[key] || fallback,
            set(key,value) {
                const run = async () => {
                    if(!isCurrent() || !chatScope) throw new Error('当前聊天已改变，未保存外观');
                    if(!['name','signature','background','avatar'].includes(key)) throw new Error('未知广场外观项');
                    const profiles=getPhoneSettings().theaterProfiles || {};
                    if(!Object.hasOwn(profiles,chatScope) && Object.keys(profiles).length >= 100) throw new Error('广场外观最多保存 100 个聊天');
                    const next={...profiles,[chatScope]:{...profiles[chatScope],[key]:String(value).slice(0,key === 'name' || key === 'signature' ? 500 : 12*1024*1024)}};
                    if(!savePhoneSetting('theaterProfiles',next) || !flushPhoneSettingsSave() || !await waitForPhoneSettingsSave()) {
                        savePhoneSetting('theaterProfiles',profiles); throw new Error('外观保存失败，未覆盖原外观');
                    }
                };
                const result=pendingSave.then(run); pendingSave=result.catch(()=>{}); return result;
            },
        },
        async importImage(file) {
            if(!(file instanceof Blob) || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size === 0 || file.size > 8*1024*1024) throw new Error('请选择不超过 8 MB 的 PNG、JPEG、WebP 或 GIF 图片');
            return new Promise((resolve,reject) => {
                const reader=new FileReader();
                const abort=()=>reader.abort(); signal.addEventListener('abort',abort,{once:true});
                reader.onload=()=>{signal.removeEventListener('abort',abort); isCurrent() ? resolve(String(reader.result)) : reject(new Error('页面已关闭'));};
                reader.onerror=reader.onabort=()=>{signal.removeEventListener('abort',abort);reject(new Error('图片读取失败或已取消'));};
                reader.readAsDataURL(file);
            });
        },
    };
}
