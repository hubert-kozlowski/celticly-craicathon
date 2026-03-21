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

    return true;
  }
);

async function handleMessage(
  request: ExtensionRequest
): Promise<ExtensionResponse> {
  switch (request.type) {
    case "TRANSLATE":
      return handleTranslate(request.text, request.context);

    case "GET_EXAMPLE":
      return handleGetExample(request.sourceText, request.irishText);

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

    case "SPEAK_WORD":
      return handleSpeakWord(request.text, request.langCode);

    default:
      return { ok: false, error: "Unknown message type", code: "UNKNOWN" };
  }
}

// ── Translation logic ─────────────────────────────────────────────────────────

const TARGET_LANG = "ga";
const MAX_TEXT_LENGTH = 500;
const MAX_CONTEXT_LENGTH = 400;

async function handleTranslate(rawText: string, context?: string): Promise<ExtensionResponse> {
  const text = rawText.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) {
    return { ok: false, error: "Empty selection", code: "UNKNOWN" };
  }

  const isWord = !text.includes(" ");

  // 1. Check local cache
  const cached = await getCachedTranslation(text, TARGET_LANG);
  if (cached) {
    // Context translation is always fresh (not stored in cache)
    if (context && isWord) {
      const contextResult = await translateContextSentence(context, text, TARGET_LANG);
      if (contextResult) {
        return { ok: true, result: { ...cached, contextSentenceIrish: contextResult, fromCache: true } };
      }
    }
    return { ok: true, result: cached };
  }

  // 2. Verify API key
  const settings = await getSettings();
  if (!settings.apiKey) {
    return {
      ok: false,
      error: "No API key configured. Open the extension options to add your Google Cloud Translation API key.",
      code: "NO_API_KEY",
    };
  }

  const provider = createProvider(settings.apiKey, settings.elevenLabsApiKey);
  const contextPromise = context && isWord
    ? translateContextSentence(context, text, TARGET_LANG)
    : Promise.resolve(null);

  const [result, contextSentenceIrish] = await Promise.all([
    provider.translate(text, TARGET_LANG),
    contextPromise,
  ]);

  if (contextSentenceIrish) {
    result.contextSentenceIrish = contextSentenceIrish;
  }

  // 4. Cache the core result (without context sentence, which varies per page)
  const toCache = { ...result };
  delete toCache.contextSentenceIrish;
  await setCachedTranslation(text, TARGET_LANG, toCache);

  return { ok: true, result };
}

/** Translates the full sentence containing the selected word for context. */
async function translateContextSentence(
  context: string,
  _selectedWord: string,
  targetLang: string
): Promise<string | null> {
  const settings = await getSettings();
  if (!settings.apiKey) return null;
  const provider = createProvider(settings.apiKey, settings.elevenLabsApiKey);
  try {
    return await provider.translateRaw(context.slice(0, MAX_CONTEXT_LENGTH), targetLang);
  } catch {
    return null;
  }
}

// ── Example sentence generation ───────────────────────────────────────────────

async function handleGetExample(
  sourceText: string,
  irishText: string
): Promise<ExtensionResponse> {
  // Only generate examples for single words
  if (sourceText.includes(" ")) {
    return { ok: false, error: "Examples only for single words", code: "UNKNOWN" };
  }

  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "No API key", code: "NO_API_KEY" };
  }

  const provider = createProvider(settings.apiKey, settings.elevenLabsApiKey);
  const insights = await provider.generateWordInsights(sourceText, irishText);

  if (!insights) {
    return { ok: false, error: "Could not generate insights", code: "UNKNOWN" };
  }

  return {
    ok: true,
    exampleSentence: insights.english,
    exampleSentenceIrish: insights.irish,
    pronunciation: insights.pronunciation,
    wordType: insights.wordType,
  };
}
// ── TTS logic ──────────────────────────────────────────────────────────────────────

async function handleSpeakWord(
  text: string,
  langCode: string
): Promise<ExtensionResponse> {
  const settings = await getSettings();
  if (!settings.elevenLabsApiKey) {
    return { ok: false, error: "No ElevenLabs API key configured. Open extension settings to add your key.", code: "NO_API_KEY" };
  }
  const provider = createProvider(settings.apiKey, settings.elevenLabsApiKey);
  const audioContent = await provider.synthesizeSpeech(text, langCode);
  return { ok: true, audioContent };
}
// ── Save word logic ───────────────────────────────────────────────────────────

async function handleSaveWord(
  sourceText: string,
  irishText: string,
  pageUrl: string,
  pageTitle: string
): Promise<ExtensionResponse> {
  // Guard: only single words may be added to the word bank
  if (sourceText.trim().includes(" ")) {
    return {
      ok: false,
      error: "Only individual words can be saved to the Word Bank.",
      code: "UNKNOWN",
    };
  }

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
