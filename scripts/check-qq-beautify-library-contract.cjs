const assert = require('node:assert/strict');
(async () => {
  const { createMemoryQQV2StateStore } = await import('../modules/qq-v2/storage/state-store.js');
  const { createQQImageLibraryPackService } = await import('../modules/qq-v2/resources/image-library-pack.js');
  const store = createMemoryQQV2StateStore();
  const library = createQQImageLibraryPackService({ stateStore: store });
  const asset = id => ({ id, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AQID' });
  const pack = { format: 'yuzi-phone-qq-image-library-pack', schemaVersion: 1, libraries: {
    avatars: [], profileBackgrounds: [], chatBackgrounds: [], stickers: [],
    avatarFrames: [asset('pink-frame')], bubbles: [{ ...asset('pink-bubble'), bubble: { padding: 12, textColor: '#123456' } }],
  }, outfits: [{ id: 'pink', avatarFrame: 'pink-frame', bubble: 'pink-bubble' }] };
  const firstImport = await library.importPack(pack);
  assert.deepEqual(firstImport, { avatars: 0, profileBackgrounds: 0, chatBackgrounds: 0, avatarFrames: 1, bubbles: 1, stickers: 0, outfits: 1 });
  const exported = await library.exportPack();
  assert.equal(exported.libraries.avatarFrames.length, 1);
  assert.deepEqual(exported.libraries.bubbles[0].bubble, { padding: 12, textColor: '#123456' });
  assert.deepEqual(exported.outfits, pack.outfits, 'Library export preserves outfit relationships');
  const beauty = { id: 'sakura-preset', qq: {
    resources: [{ id: 'frame', library: 'avatar-frame', file: 'f.png' }, { id: 'bubble', library: 'bubble', file: 'f.png', bubble: { padding: 9 } }],
    outfits: [{ id: 'matched', avatarFrame: 'frame', bubble: 'bubble' }],
  }, files: { 'f.png': { mimeType: 'image/png', encoding: 'base64', content: 'BAUG' } } };
  await library.importBeautifyPreset(beauty);
  await library.importBeautifyPreset(beauty);
  assert.equal((await library.exportPack()).libraries.avatarFrames.length, 2, 'Same beauty resource imported twice is appended only once');
  const revised = structuredClone(beauty); revised.files['f.png'].content = 'BwgJ';
  await library.importBeautifyPreset(revised);
  assert.equal((await library.exportPack()).libraries.avatarFrames.length, 3, 'Revised resource appends without replacing the old one');
  assert.equal((await library.exportPack()).outfits.length, 3, 'Revised outfits retain previous references');
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const fallbackStore = createMemoryQQV2StateStore();
  const fallbackLibrary = createQQImageLibraryPackService({ stateStore: fallbackStore });
  await fallbackLibrary.importBeautifyPreset(beauty);
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    await fallbackLibrary.importBeautifyPreset(beauty);
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else delete globalThis.crypto;
  }
  assert.equal((await fallbackLibrary.exportPack()).libraries.avatarFrames.length, 1, 'Stable deduplication works when WebCrypto is unavailable');
  const { createQQV2Repository } = await import('../modules/qq-v2/domain/repository.js');
  const repository = createQQV2Repository({ stateStore: store, random: () => 0 });
  await repository.ensureScope('chat-a');
  const created = await repository.createPrivateConversation('chat-a', { name: '小樱' });
  assert.equal(created.person.avatarFrameAssetId, 'pink-frame');
  assert.equal(created.person.bubbleAssetId, 'pink-bubble');
  assert.equal((await repository.getCurrentProfile('chat-a')).avatarFrameAssetId, 'pink-frame');
  await repository.ensureScope('chat-a');
  assert.equal((await repository.getPerson('chat-a', created.person.personId)).bubbleAssetId, 'pink-bubble', 'Entering again preserves assigned outfit');
  const lateStore = createMemoryQQV2StateStore();
  const lateRepository = createQQV2Repository({ stateStore: lateStore, random: () => 0 });
  await lateRepository.ensureScope('old-chat');
  const oldPerson = await lateRepository.createPrivateConversation('old-chat', { name: '老朋友' });
  const lateLibrary = createQQImageLibraryPackService({ stateStore: lateStore });
  await lateLibrary.importPack(pack);
  await lateRepository.ensureScope('old-chat');
  const oldAppearance = await lateRepository.getPerson('old-chat', oldPerson.person.personId);
  assert.deepEqual([oldAppearance.avatarFrameAssetId || '', oldAppearance.bubbleAssetId || ''], ['', ''], 'Importing materials does not fill existing NPC decoration slots');
  await lateRepository.updatePrivateProfile('old-chat', oldPerson.conversation.conversationId, { avatarFrameAssetId: 'pink-frame' });
  await lateRepository.deleteImageLibraryAssets('old-chat', ['pink-frame']);
  assert.equal((await lateLibrary.exportPack()).outfits?.length || 0, 0, 'Deleting core material cannot export dangling outfits');
  assert.equal((await lateRepository.getPerson('old-chat', oldPerson.person.personId)).avatarFrameAssetId || '', '', 'Deleted frame is removed from personal references');
  console.log('QQ beautify library contract passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
