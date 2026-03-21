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

const DB_NAME = "cupla_focal";
const DB_VERSION = 1;
const STORE_WORDS = "words";
const STORE_CACHE = "translation_cache";

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

// ── ID generation ──────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
