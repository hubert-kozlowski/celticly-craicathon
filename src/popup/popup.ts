// â”€â”€â”€ Browser action popup script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function applyTheme(theme: "light" | "dark" | "auto"): void {
  const resolved =
    theme === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

async function init(): Promise<void> {
  const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;
  const enabledLabel = document.getElementById("enabled-label")!;
  const wordCount = document.getElementById("word-count")!;
  const recentList = document.getElementById("recent-list")!;
  const openOptions = document.getElementById("open-options")!;
  const openWordBank = document.getElementById("open-wordbank") as HTMLButtonElement | null;

  const openOptionsPage = (e: Event): void => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  openOptions.addEventListener("click", openOptionsPage);

  // Open word bank page
  if (openWordBank) {
    openWordBank.addEventListener("click", () => {
      const wordBankUrl = chrome.runtime.getURL("wordbank.html");
      chrome.tabs.create({ url: wordBankUrl });
    });
  }

  // Load settings & apply theme
  const settingsResp = await sendMsg({ type: "GET_SETTINGS" });
  let settings: ExtensionSettings | null = null;
  if (settingsResp.ok && "settings" in settingsResp) {
    settings = settingsResp.settings;
    applyTheme(settings.theme ?? "light");
    toggle.checked = settings.enabled;
    enabledLabel.textContent = settings.enabled ? "On" : "Off";
  }

  toggle.addEventListener("change", async () => {
    enabledLabel.textContent = toggle.checked ? "On" : "Off";
    await sendMsg({ type: "SAVE_SETTINGS", settings: { enabled: toggle.checked } });
  });

  // Test yourself
  const testWordCount = document.getElementById("test-word-count") as HTMLInputElement;
  const testCountLabel = document.getElementById("test-count-label")!;
  const testStartBtn = document.getElementById("test-start-btn")!;

  testWordCount.addEventListener("input", () => {
    testCountLabel.textContent = testWordCount.value;
  });

  testStartBtn.addEventListener("click", async () => {
    const wordCount = parseInt(testWordCount.value, 10);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: "START_TEST", wordCount });
      }
    } catch {
      // Silently ignore if the content script isn't injected on this page
    }
    window.close();
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
            <div class="recent-pair">
              <span class="recent-irish">${escapeHtml(w.irishText)}</span>
              <span class="recent-arrow">→</span>
              <span class="recent-source">${escapeHtml(w.sourceText)}</span>
            </div>
          </li>`
        )
        .join("");
    }
  }
}

init().catch(console.error);
