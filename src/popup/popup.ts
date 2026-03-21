// ─── Browser action popup script ─────────────────────────────────────────────

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

async function init(): Promise<void> {
  const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;
  const enabledLabel = document.getElementById("enabled-label")!;
  const wordCount = document.getElementById("word-count")!;
  const recentList = document.getElementById("recent-list")!;
  const keyWarning = document.getElementById("key-warning")!;
  const openOptions = document.getElementById("open-options")!;
  const openOptionsKey = document.getElementById("open-options-key");

  const openOptionsPage = (e: Event): void => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  openOptions.addEventListener("click", openOptionsPage);
  openOptionsKey?.addEventListener("click", openOptionsPage);

  // Load settings
  const settingsResp = await sendMsg({ type: "GET_SETTINGS" });
  let settings: ExtensionSettings | null = null;
  if (settingsResp.ok && "settings" in settingsResp) {
    settings = settingsResp.settings;
    toggle.checked = settings.enabled;
    enabledLabel.textContent = settings.enabled ? "On" : "Off";
    if (!settings.apiKey) {
      keyWarning.style.display = "block";
    }
  }

  toggle.addEventListener("change", async () => {
    enabledLabel.textContent = toggle.checked ? "On" : "Off";
    await sendMsg({ type: "SAVE_SETTINGS", settings: { enabled: toggle.checked } });
  });

  // Load word bank stats
  const wordsResp = await sendMsg({ type: "GET_SAVED_WORDS" });
  if (wordsResp.ok && "words" in wordsResp) {
    const words = wordsResp.words as SavedWord[];
    wordCount.textContent = String(words.length);

    if (words.length === 0) {
      recentList.innerHTML = `<li class="empty-state">Nothing saved yet.<br>Select text on any page to start!</li>`;
    } else {
      const recent = words.slice(0, 5);
      recentList.innerHTML = recent
        .map(
          (w) => `
          <li class="recent-item">
            <div>
              <div class="recent-source">${escapeHtml(w.sourceText)}</div>
              <div class="recent-irish">${escapeHtml(w.irishText)}</div>
            </div>
          </li>`
        )
        .join("");
    }
  }
}

init().catch(console.error);
