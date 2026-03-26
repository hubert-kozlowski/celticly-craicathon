// ─── Persistence layer ────────────────────────────────────────────────────────
// Settings: chrome.storage.sync (small, syncs across devices)
// Saved words + translation cache: IndexedDB (larger, local)

import type { ExtensionSettings, SavedWord, TranslationResult } from "./types";
import { DEFAULT_SETTINGS } from "./types";

// ── Settings (chrome.storage.sync) ────────────────────────────────────────────

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve(items as ExtensionSettings);
    });
  });
}

export async function saveSettings(
  partial: Partial<ExtensionSettings>
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(partial, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ── IndexedDB bootstrap ───────────────────────────────────────────────────────

const DB_NAME = "celticly";
const DB_VERSION = 3; // Bumped to 3 for blacklist store
const STORE_WORDS = "words";
const STORE_CACHE = "translation_cache";
const STORE_BLACKLIST = "translation_blacklist";

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_WORDS)) {
        const store = db.createObjectStore(STORE_WORDS, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const cache = db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        cache.createIndex("cachedAt", "cachedAt", { unique: false });
      }

      // New object store for blacklisted translations
      if (!db.objectStoreNames.contains(STORE_BLACKLIST)) {
        const blacklist = db.createObjectStore(STORE_BLACKLIST, { keyPath: "key" });
        blacklist.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Saved words ────────────────────────────────────────────────────────────────

export async function saveWord(word: SavedWord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORDS, "readwrite");
    tx.objectStore(STORE_WORDS).put(word);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSavedWords(): Promise<SavedWord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORDS, "readonly");
    const req = tx.objectStore(STORE_WORDS).index("savedAt").getAll();
    req.onsuccess = () => {
      // Return newest first
      resolve((req.result as SavedWord[]).reverse());
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSavedWord(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORDS, "readwrite");
    tx.objectStore(STORE_WORDS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Translation cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  key: string;
  result: TranslationResult;
  cachedAt: number;
  userRating?: 0 | -1;      // User's rating of this translation (0 = not rated, -1 = blacklisted)
  ratingTimestamp?: number;  // When the user rated this translation
}

interface BlacklistEntry {
  key: string;               // cache key of blacklisted translation (e.g., "ga:hello")
  timestamp: number;         // when it was blacklisted
  sourceText: string;        // original English word
  irishText: string;         // bad translation to avoid
}

function cacheKey(text: string, lang: string): string {
  return `${lang}:${text.trim().toLowerCase()}`;
}

export async function getCachedTranslation(
  text: string,
  lang: string
): Promise<TranslationResult | null> {
  const db = await openDb();
  const key = cacheKey(text, lang);

  return new Promise((resolve, reject) => {
    // Check if this translation is blacklisted first
    const txBlacklist = db.transaction(STORE_BLACKLIST, "readonly");
    const blacklistReq = txBlacklist.objectStore(STORE_BLACKLIST).get(key);
    
    blacklistReq.onsuccess = () => {
      if (blacklistReq.result) {
        // This translation is blacklisted, treat as cache miss
        resolve(null);
        return;
      }

      // Not blacklisted, check cache
      const tx = db.transaction(STORE_CACHE, "readonly");
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
          // Expired – delete asynchronously, treat as miss
          openDb().then((db2) => {
            const tx2 = db2.transaction(STORE_CACHE, "readwrite");
            tx2.objectStore(STORE_CACHE).delete(key);
          });
          resolve(null);
          return;
        }

        resolve({ ...entry.result, fromCache: true });
      };
      req.onerror = () => reject(req.error);
    };
    blacklistReq.onerror = () => reject(blacklistReq.error);
  });
}

export async function setCachedTranslation(
  text: string,
  lang: string,
  result: TranslationResult
): Promise<void> {
  const db = await openDb();
  const entry: CacheEntry = {
    key: cacheKey(text, lang),
    result,
    cachedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearCache(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    tx.objectStore(STORE_CACHE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Blacklist system ──────────────────────────────────────────────────────────

/**
 * Add a translation to the user's personal blacklist.
 * Blacklisted translations won't be returned from cache.
 */
export async function blacklistTranslation(
  text: string,
  lang: string,
  irishText: string
): Promise<void> {
  const db = await openDb();
  const key = `${lang}:${text.trim().toLowerCase()}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_BLACKLIST, STORE_CACHE], "readwrite");
    
    // Add to blacklist store
    const blacklistEntry = {
      key,
      text,
      irishText,
      lang,
      timestamp: Date.now(),
    };
    tx.objectStore(STORE_BLACKLIST).put(blacklistEntry);

    // Mark in cache entry that user voted it down
    const cacheStore = tx.objectStore(STORE_CACHE);
    const getReq = cacheStore.get(key);
    
    getReq.onsuccess = () => {
      const entry = (getReq.result as CacheEntry | undefined);
      if (entry) {
        entry.userRating = -1;
        entry.ratingTimestamp = Date.now();
        cacheStore.put(entry);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a translation from the user's blacklist.
 */
export async function unblacklistTranslation(text: string, lang: string): Promise<void> {
  const db = await openDb();
  const key = `${lang}:${text.trim().toLowerCase()}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_BLACKLIST, STORE_CACHE], "readwrite");
    
    // Remove from blacklist
    tx.objectStore(STORE_BLACKLIST).delete(key);

    // Clear user rating in cache entry
    const cacheStore = tx.objectStore(STORE_CACHE);
    const getReq = cacheStore.get(key);
    
    getReq.onsuccess = () => {
      const entry = (getReq.result as CacheEntry | undefined);
      if (entry) {
        entry.userRating = 0;
        cacheStore.put(entry);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get list of all blacklisted translations.
 */
export async function getBlacklist(): Promise<
  Array<{ key: string; text: string; irishText: string; lang: string; timestamp: number }>
> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLACKLIST, "readonly");
    const req = tx.objectStore(STORE_BLACKLIST).getAll();
    
    req.onsuccess = () => {
      resolve(
        (req.result as Array<{
          key: string;
          text: string;
          irishText: string;
          lang: string;
          timestamp: number;
        }>) || []
      );
    };
    
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all blacklist entries.
 */
export async function clearBlacklist(): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLACKLIST, "readwrite");
    tx.objectStore(STORE_BLACKLIST).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Returns true if the given translation (text -> irishText) is present in the blacklist.
 */
export async function isBlacklisted(text: string, lang: string, irishText: string): Promise<boolean> {
  const db = await openDb();
  const key = `${lang}:${text.trim().toLowerCase()}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLACKLIST, "readonly");
    const req = tx.objectStore(STORE_BLACKLIST).get(key);
    req.onsuccess = () => {
      const entry = req.result as (BlacklistEntry | undefined);
      if (!entry) return resolve(false);
      // Compare normalized Irish text
      const a = (entry.irishText || "").toLowerCase().trim();
      const b = (irishText || "").toLowerCase().trim();
      resolve(a === b);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── ID generation ──────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
