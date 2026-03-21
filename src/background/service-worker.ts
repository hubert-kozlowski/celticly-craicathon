// ─── Background Service Worker ────────────────────────────────────────────────
// Handles: translation API calls, persistence, cache, context menus.

import type { ExtensionRequest, ExtensionResponse } from "../lib/messages";
import type { SavedWord } from "../lib/types";
import { createProvider } from "../lib/translation-provider";
import {
  getSettings,
  saveSettings,
  saveWord,
  getSavedWords,
  deleteSavedWord,
  getCachedTranslation,
  setCachedTranslation,
  clearCache,
  generateId,
} from "../lib/storage";

// ── Context menu setup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate to Irish",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "translate-selection" || !info.selectionText || !tab?.id) return;

  const text = info.selectionText.trim();
  if (!text) return;

  // Trigger the same translation flow by messaging the content script
  chrome.tabs.sendMessage(tab.id, {
    type: "TRANSLATE_SELECTION",
    text,
  });
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    request: ExtensionRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    handleMessage(request)
      .then(sendResponse)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof Error && (err as NodeJS.ErrnoException).code
            ? ((err as NodeJS.ErrnoException).code as ExtensionResponse extends { code?: infer C } ? C : never)
            : "UNKNOWN";
        sendResponse({ ok: false, error: message, code: code ?? "UNKNOWN" });
      });

    // Return true to signal we'll respond asynchronously
    return true;
  }
);

async function handleMessage(
  request: ExtensionRequest
): Promise<ExtensionResponse> {
  switch (request.type) {
    case "TRANSLATE":
      return handleTranslate(request.text);

    case "SAVE_WORD":
      return handleSaveWord(
        request.sourceText,
        request.irishText,
        request.pageUrl,
        request.pageTitle
      );

    case "GET_SAVED_WORDS": {
      const words = await getSavedWords();
      return { ok: true, words };
    }

    case "DELETE_SAVED_WORD": {
      await deleteSavedWord(request.id);
      return { ok: true };
    }

    case "GET_SETTINGS": {
      const settings = await getSettings();
      return { ok: true, settings };
    }

    case "SAVE_SETTINGS": {
      await saveSettings(request.settings as Parameters<typeof saveSettings>[0]);
      return { ok: true };
    }

    case "CLEAR_CACHE": {
      await clearCache();
      return { ok: true };
    }

    default:
      return { ok: false, error: "Unknown message type", code: "UNKNOWN" };
  }
}

// ── Translation logic ─────────────────────────────────────────────────────────

const TARGET_LANG = "ga"; // ISO 639-1 code for Irish (Gaeilge)
const MAX_TEXT_LENGTH = 500; // chars; avoid billing surprises

async function handleTranslate(rawText: string): Promise<ExtensionResponse> {
  const text = rawText.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) {
    return { ok: false, error: "Empty selection", code: "UNKNOWN" };
  }

  // 1. Check local cache first
  const cached = await getCachedTranslation(text, TARGET_LANG);
  if (cached) {
    return { ok: true, result: cached };
  }

  // 2. Verify we have an API key
  const settings = await getSettings();
  if (!settings.apiKey) {
    return {
      ok: false,
      error:
        "No API key configured. Open the extension options to add your Microsoft Translator key.",
      code: "NO_API_KEY",
    };
  }

  // 3. Call the provider
  const provider = createProvider(settings.apiKey, settings.apiRegion);
  const result = await provider.translate(text, TARGET_LANG);

  // 4. Cache and return
  await setCachedTranslation(text, TARGET_LANG, result);
  return { ok: true, result };
}

// ── Save word logic ───────────────────────────────────────────────────────────

async function handleSaveWord(
  sourceText: string,
  irishText: string,
  pageUrl: string,
  pageTitle: string
): Promise<ExtensionResponse> {
  const word: SavedWord = {
    id: generateId(),
    sourceText,
    irishText,
    pageUrl,
    pageTitle,
    savedAt: Date.now(),
  };
  await saveWord(word);
  return { ok: true, savedWord: word };
}
