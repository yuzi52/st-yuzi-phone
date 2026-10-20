import { createQQV2GlobalRuntimeSettings } from './global-runtime-settings.js';
import { createQQV2ResourceService } from '../resources/service.js';
import { createQQV2SharedResourceStorage } from '../storage/state-store.js';

/** Reuse the existing settings owners inside one commit, without nested database writes. */
export function createQQV2VoicePresetTransaction({ stateStore, cryptoApi }) {
    return operation => stateStore.transact(async state => {
        // These views belong only to this transaction's draft; reads never clone the QQ root.
        const draftStore = {
            async read() { return state; },
            async transact(mutator) { return mutator(state); },
        };
        const resources = createQQV2ResourceService({
            storage: createQQV2SharedResourceStorage({ stateStore: draftStore }),
            cryptoApi,
        });
        await operation(resources);
        const connection = await resources.getVoiceConnection();
        await createQQV2GlobalRuntimeSettings({ stateStore: draftStore })
            .update('', { voice: connection.settings });
        return resources.listVoicePresets();
    });
}
