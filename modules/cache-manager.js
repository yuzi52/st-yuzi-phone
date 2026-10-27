// modules/cache-manager.js
/**
 * Yuzi Phone - 历史 IndexedDB 缓存清理
 */

const DB_NAME = 'yuzi-phone-cache';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'templates';
const STORE_IMAGES = 'images';
const STORE_SETTINGS = 'settings';

let dbPromise = null;

function initializeStores(db) {
    if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES);
    }
    if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES);
    }
    if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
    }
}

function clearCachedDbPromise(promise) {
    if (dbPromise === promise) {
        dbPromise = null;
    }
}

function openDb() {
    if (dbPromise) {
        return dbPromise;
    }

    let nextPromise;
    nextPromise = new Promise((resolve, reject) => {
        let request;
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }

        request.onerror = () => {
            reject(request.error);
        };
        request.onupgradeneeded = () => {
            initializeStores(request.result);
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                clearCachedDbPromise(nextPromise);
            };
            resolve(db);
        };
    });

    nextPromise.catch(() => {
        clearCachedDbPromise(nextPromise);
    });
    dbPromise = nextPromise;
    return dbPromise;
}

export async function cacheRemove(storeName, key) {
    await openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).delete(key);
        request.addEventListener('error', () => reject(request.error || tx.error), { once: true });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
    return true;
}

export const CACHE_STORES = Object.freeze({
    templates: STORE_TEMPLATES,
    images: STORE_IMAGES,
    settings: STORE_SETTINGS,
});
