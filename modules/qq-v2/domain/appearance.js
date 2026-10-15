// Automatic frame/bubble assignment is limited to new NPCs and the current user.
function choose(values, random) {
    if (!values.length) return null;
    const value = Number(random());
    return values[Math.max(0, Math.min(values.length - 1, Math.floor((Number.isFinite(value) ? value : 0) * values.length)))];
}
function matchingOutfits(state, person) {
    const assets = state.sharedResources?.imageLibraryAssets || {};
    return Object.values(state.sharedResources?.imageLibraryOutfits || {}).filter(outfit =>
        assets[outfit.avatarFrame]?.library === 'avatar-frame' && assets[outfit.bubble]?.library === 'bubble'
        && (!person.avatarFrameAssetId || person.avatarFrameAssetId === outfit.avatarFrame)
        && (!person.bubbleAssetId || person.bubbleAssetId === outfit.bubble));
}
function fillPersonProfileBackground(state, person, random) {
    const missing = !person.avatarFrameAssetId || !person.bubbleAssetId;
    const outfit = missing ? choose(matchingOutfits(state, person), random) : matchingOutfits(state, person)[0];
    if (!person.profileBackgroundAssetId && state.sharedResources?.imageLibraryAssets?.[outfit?.profileBackground]) person.profileBackgroundAssetId = outfit.profileBackground;
    return outfit;
}
export function assignPersonAppearance(state, person, random) {
    const assets = Object.values(state.sharedResources?.imageLibraryAssets || {});
    const outfit = fillPersonProfileBackground(state, person, random);
    for (const [field, slot, library] of [['avatarFrameAssetId', 'avatarFrame', 'avatar-frame'], ['bubbleAssetId', 'bubble', 'bubble']]) {
        if (person[field]) continue;
        const id = outfit?.[slot] || choose(assets.filter(asset => asset.library === library), random)?.assetId;
        if (id) person[field] = id;
    }
    return outfit;
}
export function outfitChatBackground(state, person) {
    const outfit = matchingOutfits(state, person)[0];
    return state.sharedResources?.imageLibraryAssets?.[outfit?.chatBackground]?.library === 'chat-background' ? outfit.chatBackground : '';
}
export function fillScopeAppearance(state, scope, random) {
    assignPersonAppearance(state, scope.selfProfile, random);
    // Existing NPCs keep their frame and bubble choices, including empty slots.
    for (const person of Object.values(scope.people)) fillPersonProfileBackground(state, person, random);
    for (const conversation of Object.values(scope.conversations)) {
        if (conversation.kind === 'private' && !conversation.backgroundAssetId) conversation.backgroundAssetId = outfitChatBackground(state, scope.people[conversation.personId] || {});
    }
}
