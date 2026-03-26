// â”€â”€â”€ Options page script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import type { ExtensionResponse } from "../lib/messages";
import type { SavedWord, ExtensionSettings } from "../lib/types";

async function sendMsg(req: object): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(req, (r: ExtensionResponse) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function applyTheme(theme: "light" | "dark" | "auto"): void {
  const resolved =
    theme === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

// DOM refs
const enabledToggle = document.getElementById("enabled") as HTMLInputElement;
const autoDismissInput = document.getElementById("auto-dismiss") as HTMLInputElement;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const clearCacheBtn = document.getElementById("clear-cache-btn") as HTMLButtonElement;
const saveStatus = document.getElementById("save-status")!;
const wbTbody = document.getElementById("wb-tbody")!;
const wbCount = document.getElementById("wb-count")!;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const clearWbBtn = document.getElementById("clear-wb-btn") as HTMLButtonElement;
const blacklistTbody = document.getElementById("blacklist-tbody");
const blacklistCount = document.getElementById("blacklist-count");
const clearBlacklistBtn = document.getElementById("clear-blacklist-btn") as HTMLButtonElement | null;

let loadedWords: SavedWord[] = [];
let loadedBlacklist: Array<{ key: string; text: string; irishText: string; lang: string; timestamp: number }> = [];

async function loadSettings(): Promise<void> {
  const resp = await sendMsg({ type: "GET_SETTINGS" });
  if (resp.ok && "settings" in resp) {
    const s = resp.settings as ExtensionSettings;
    enabledToggle.checked = s.enabled;
    autoDismissInput.value = String(s.popupAutoDismissMs);
    themeSelect.value = s.theme ?? "light";
    applyTheme(s.theme ?? "light");
  }
}

async function loadWords(): Promise<void> {
  const resp = await sendMsg({ type: "GET_SAVED_WORDS" });
  if (resp.ok && "words" in resp) {
    loadedWords = resp.words as SavedWord[];
    renderWords();
  }
}

async function loadBlacklist(): Promise<void> {
  // Query the blacklist from IndexedDB
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("celticly", 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction("translation_blacklist", "readonly");
  const store = tx.objectStore("translation_blacklist");
  
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      loadedBlacklist = (req.result || []) as Array<{ key: string; text: string; irishText: string; lang: string; timestamp: number }>;
      renderBlacklist();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function renderBlacklist(): void {
  if (!blacklistTbody || !blacklistCount) return; // Elements don't exist

  blacklistCount.textContent = `${loadedBlacklist.length} translation${loadedBlacklist.length !== 1 ? "s" : ""} blacklisted`;

  if (loadedBlacklist.length === 0) {
    blacklistTbody.innerHTML = `<tr><td colspan="3" class="empty-wb">No blacklisted translations yet.</td></tr>`;
    return;
  }

  blacklistTbody.innerHTML = loadedBlacklist
    .sort((a, b) => b.timestamp - a.timestamp) // Newest first
    .map(
      (entry) => `
      <tr data-key="${escapeHtml(entry.key)}">
        <td title="${escapeHtml(entry.text)}">${escapeHtml(entry.text)}</td>
        <td title="${escapeHtml(entry.irishText)}">${escapeHtml(entry.irishText)}</td>
        <td><small>${escapeHtml(formatDate(entry.timestamp))}</small></td>
        <td class="td-actions">
          <button class="delete-blacklist-btn" data-key="${escapeHtml(entry.key)}" title="Remove from blacklist">✕</button>
        </td>
      </tr>`
    )
    .join("");

  blacklistTbody.querySelectorAll(".delete-blacklist-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const key = (btn as HTMLElement).dataset.key ?? "";
      if (!key) return;
      
      // Remove from IndexedDB
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("celticly", 3);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const tx = db.transaction("translation_blacklist", "readwrite");
      const store = tx.objectStore("translation_blacklist");
      store.delete(key);
      
      tx.oncomplete = () => {
        loadedBlacklist = loadedBlacklist.filter((e) => e.key !== key);
        renderBlacklist();
      };
    })
  );
}

function renderWords(): void {
  wbCount.textContent = `${loadedWords.length} word${loadedWords.length !== 1 ? "s" : ""}`;

  if (loadedWords.length === 0) {
    wbTbody.innerHTML = `<tr><td colspan="4" class="empty-wb">No words saved yet. Select text on any page to start!</td></tr>`;
    return;
  }

  wbTbody.innerHTML = loadedWords
    .map(
      (w) => `
      <tr data-id="${escapeHtml(w.id)}">
        <td title="${escapeHtml(w.sourceText)}">${escapeHtml(w.sourceText)}</td>
        <td title="${escapeHtml(w.irishText)}">${escapeHtml(w.irishText)}</td>
        <td>${escapeHtml(formatDate(w.savedAt))}</td>
        <td class="td-actions">
          <button class="delete-btn" data-id="${escapeHtml(w.id)}" title="Delete">&#215;</button>
        </td>
      </tr>`
    )
    .join("");

  wbTbody.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.id ?? "";
      await sendMsg({ type: "DELETE_SAVED_WORD", id });
      loadedWords = loadedWords.filter((w) => w.id !== id);
      renderWords();
    })
  );
}

// Live preview theme change
themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value as "light" | "dark" | "auto");
});

saveBtn.addEventListener("click", async () => {
  const settings: Partial<ExtensionSettings> = {
    enabled: enabledToggle.checked,
    popupAutoDismissMs: Math.max(0, parseInt(autoDismissInput.value, 10) || 0),
    theme: themeSelect.value as "light" | "dark" | "auto",
  };
  await sendMsg({ type: "SAVE_SETTINGS", settings });
  saveStatus.textContent = "\u2713 Settings saved!";
  setTimeout(() => { saveStatus.textContent = ""; }, 3000);
});

clearCacheBtn.addEventListener("click", async () => {
  await sendMsg({ type: "CLEAR_CACHE" });
  saveStatus.textContent = "\u2713 Translation cache cleared.";
  setTimeout(() => { saveStatus.textContent = ""; }, 3000);
});

clearWbBtn.addEventListener("click", async () => {
  if (!confirm(`Delete all ${loadedWords.length} saved words? This cannot be undone.`)) return;
  for (const w of loadedWords) {
    await sendMsg({ type: "DELETE_SAVED_WORD", id: w.id });
  }
  loadedWords = [];
  renderWords();
});

exportBtn.addEventListener("click", () => {
  if (loadedWords.length === 0) return;
  const flashCards = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    language: "Irish",
    cards: loadedWords.map((w) => ({
      front: w.sourceText,
      back: w.irishText,
      savedAt: w.savedAt,
      pageUrl: w.pageUrl,
    })),
  };
  const blob = new Blob([JSON.stringify(flashCards, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `celticly-flashcards-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

if (clearBlacklistBtn) {
  clearBlacklistBtn.addEventListener("click", async () => {
    if (loadedBlacklist.length === 0) return;
    if (!confirm(`Remove all ${loadedBlacklist.length} blacklisted translations? This cannot be undone.`)) return;
    
    // Clear blacklist from IndexedDB
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("celticly", 3);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction("translation_blacklist", "readwrite");
    const store = tx.objectStore("translation_blacklist");
    store.clear();
    
    tx.oncomplete = () => {
      loadedBlacklist = [];
      renderBlacklist();
      saveStatus.textContent = "\u2713 Blacklist cleared.";
      setTimeout(() => { saveStatus.textContent = ""; }, 3000);
    };
  });
}

// Init
Promise.all([loadSettings(), loadWords(), loadBlacklist()]).catch(console.error);
