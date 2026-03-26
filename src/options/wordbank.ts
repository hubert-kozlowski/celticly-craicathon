// ─── Word Bank page script ────────────────────────────────────────────────────

import type { ExtensionResponse } from "../lib/messages";
import type { SavedWord } from "../lib/types";

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
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function applyTheme(theme: "light" | "dark" | "auto"): void {
  const resolved =
    theme === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

// DOM refs
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const wbTbody = document.getElementById("wb-tbody")!;
const wbCount = document.getElementById("wb-count")!;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const clearWbBtn = document.getElementById("clear-wb-btn") as HTMLButtonElement;

let loadedWords: SavedWord[] = [];
let filteredWords: SavedWord[] = [];
let currentTheme: "light" | "dark" | "auto" = "light";

async function loadSettings(): Promise<void> {
  const resp = await sendMsg({ type: "GET_SETTINGS" });
  if (resp.ok && "settings" in resp) {
    currentTheme = resp.settings.theme ?? "light";
    applyTheme(currentTheme);
  }
}

async function loadWords(): Promise<void> {
  const resp = await sendMsg({ type: "GET_SAVED_WORDS" });
  if (resp.ok && "words" in resp) {
    loadedWords = resp.words as SavedWord[];
    filteredWords = [...loadedWords];
    renderWords();
  }
}

function filterWords(query: string): void {
  const q = query.toLowerCase().trim();
  if (!q) {
    filteredWords = [...loadedWords];
  } else {
    filteredWords = loadedWords.filter(
      (w) =>
        w.sourceText.toLowerCase().includes(q) ||
        w.irishText.toLowerCase().includes(q)
    );
  }
  renderWords();
}

function renderWords(): void {
  wbCount.textContent =
    filteredWords.length === 0 && searchInput.value
      ? `No results`
      : `${loadedWords.length} word${loadedWords.length !== 1 ? "s" : ""} saved`;

  if (filteredWords.length === 0) {
    const message =
      searchInput.value && loadedWords.length > 0
        ? "No words match your search."
        : "No words saved yet. Select text on any page to start!";
    wbTbody.innerHTML = `<tr><td colspan="3" class="empty-wb">${message}</td></tr>`;
    return;
  }

  wbTbody.innerHTML = filteredWords
    .map(
      (w) => `
      <tr data-id="${escapeHtml(w.id)}">
        <td>
          <div class="td-word-pair">
            <span class="word-irish" title="${escapeHtml(w.irishText)}">${escapeHtml(w.irishText)}</span>
            <span class="word-arrow">→</span>
            <span class="word-english" title="${escapeHtml(w.sourceText)}">${escapeHtml(w.sourceText)}</span>
          </div>
        </td>
        <td class="td-date">${escapeHtml(formatDate(w.savedAt))}</td>
        <td class="td-actions">
          <button class="delete-btn" data-id="${escapeHtml(w.id)}" title="Delete word">✕</button>
        </td>
      </tr>`
    )
    .join("");

  wbTbody.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.id ?? "";
      await sendMsg({ type: "DELETE_SAVED_WORD", id });
      loadedWords = loadedWords.filter((w) => w.id !== id);
      filterWords(searchInput.value);
    })
  );
}



// Search/filter
searchInput.addEventListener("input", (e) => {
  filterWords((e.target as HTMLInputElement).value);
});

// Clear all
clearWbBtn.addEventListener("click", async () => {
  if (
    !confirm(
      `Delete all ${loadedWords.length} saved words? This cannot be undone.`
    )
  )
    return;
  for (const w of loadedWords) {
    await sendMsg({ type: "DELETE_SAVED_WORD", id: w.id });
  }
  loadedWords = [];
  filteredWords = [];
  renderWords();
});

// Export as Flash Cards (proprietary format)
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

// Listen for storage changes to sync across tabs
chrome.storage.onChanged.addListener(() => {
  loadWords();
});

// Init
Promise.all([loadSettings(), loadWords()]).catch(console.error);
