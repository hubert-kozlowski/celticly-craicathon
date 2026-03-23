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

let loadedWords: SavedWord[] = [];

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
  const header = "English,Irish,Saved At,Page URL\n";
  const rows = loadedWords
    .map(
      (w) =>
        `"${w.sourceText.replace(/"/g, '""')}","${w.irishText.replace(/"/g, '""')}","${formatDate(w.savedAt)}","${w.pageUrl.replace(/"/g, '""')}"`
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `celticly-wordbank-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Init
Promise.all([loadSettings(), loadWords()]).catch(console.error);
