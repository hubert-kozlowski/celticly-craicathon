// ─── Background Service Worker ────────────────────────────────────────────────
// Handles: translation API calls, persistence, cache, context menus.

import type { ExtensionRequest, ExtensionResponse } from "../lib/messages";
import type { SavedWord } from "../lib/types";
import { createProvider } from "../lib/translation-provider";
import { getWordSuggestions } from "../lib/gaelspell";
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
  blacklistTranslation,
  isBlacklisted,
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

    case "GET_HINT":
      return handleGetHint(request.sourceText, request.irishText);

    case "CHECK_GRAMMAR":
      return handleCheckGrammar(request.text);

    case "BLACKLIST_TRANSLATION": {
      await handleBlacklistTranslation(request.sourceText, request.irishText, request.langCode);
      return { ok: true };
    }

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

  // 2. Translate via proxy
  const provider = createProvider();
  const contextPromise = context && isWord
    ? translateContextSentence(context, text, TARGET_LANG)
    : Promise.resolve(null);

  const [result, contextSentenceIrish] = await Promise.all([
    provider.translate(text, TARGET_LANG),
    contextPromise,
  ]);

  // If the provider returned a translation that the user has explicitly blacklisted,
  // try to obtain an alternative for single words (similar-word lookup) before returning.
  if (isWord) {
    try {
      const blacklisted = await isBlacklisted(text, TARGET_LANG, result.irishText);
      if (blacklisted) {
        // Try to pick an alternative from similar-words database
        const similar = await provider.fetchSimilarWords(text).catch(() => []);
        const alternative = (similar || []).map(s => s.irish).find(i => i && i.toLowerCase().trim() !== result.irishText.toLowerCase().trim());
        if (alternative) {
          result.irishText = alternative;
        }
      }
    } catch (err) {
      // Ignore errors in blacklist check — fall back to original translation
      console.warn("Blacklist check failed:", err);
    }
  }

  if (contextSentenceIrish) {
    result.contextSentenceIrish = contextSentenceIrish;
  }

  // 3. For single words, look up definitions + word type from Wiktionary.
  if (isWord && !result.sameInBothLanguages) {
    const { wordType, definitions } = await provider.fetchWordDefinitions(text).catch(() => ({ wordType: null, definitions: [] }));
    if (wordType) result.wordType = wordType;
    if (definitions.length > 0) result.definitions = definitions;
  }

  // 4. Validate the Irish translation with GaelSpell (cadhan.com).
  //    Suggestions mean the word may be mis-spelled; surface them as alternatives.
  //    Non-fatal: if GaelSpell is unavailable the translation is returned as-is.
  if (isWord && !result.sameInBothLanguages) {
    try {
      const suggestions = await getWordSuggestions(result.irishText, 3);
      if (suggestions.length > 0) result.spellSuggestions = suggestions;
    } catch {
      // GaelSpell unavailable — silently ignore
    }
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
  const provider = createProvider();
  try {
    return await provider.translateRaw(context.slice(0, MAX_CONTEXT_LENGTH), targetLang);
  } catch {
    return null;
  }
}

// ── TTS logic ──────────────────────────────────────────────────────────────────────

async function handleSpeakWord(
  text: string,
  langCode: string
): Promise<ExtensionResponse> {
  const provider = createProvider();
  const audioContent = await provider.synthesizeSpeech(text, langCode);
  return { ok: true, audioContent };
}

// ── Hint logic ─────────────────────────────────────────────────────────────────

async function handleGetHint(
  sourceText: string,
  _irishText: string
): Promise<ExtensionResponse> {
  const provider = createProvider();
  const { hints } = provider.generateLocalHints(sourceText);
  return { ok: true, hints, phonetic: "" };
}

// ── Grammar check logic ─────────────────────────────────────────────────────────────────

async function handleCheckGrammar(text: string): Promise<ExtensionResponse> {
  // an Gramadóir is a free public API — no API key needed.
  const provider = createProvider();
  const errors = await provider.checkGrammar(text);
  return { ok: true, errors };
}

// ── Rating logic ──────────────────────────────────────────────────────────────

async function handleBlacklistTranslation(
  sourceText: string,
  irishText: string,
  langCode?: string
): Promise<void> {
  const lang = langCode || "ga";
  await blacklistTranslation(sourceText, lang, irishText);
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
