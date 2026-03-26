// â”€â”€â”€ Content Script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Detects text selections on arbitrary pages, orchestrates popup lifecycle,
// and bridges between the page layer and the service worker.

import type { ExtensionResponse, ExtensionRequest } from "../lib/messages";
import { TranslationPopup } from "./popup-ui";
import { startTestMode, stopTestMode } from "./test-mode";

const SELECTION_DEBOUNCE_MS = 350;
const MAX_TEXT_LENGTH = 500;

let popup: TranslationPopup | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTranslatedText = "";
let autoDismissMs = 8000;
let currentTheme: "light" | "dark" | "auto" = "light";

// â”€â”€ Initialise â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function init(): Promise<void> {
  try {
    const resp = await sendMessage({ type: "GET_SETTINGS" });
    if (resp.ok && "settings" in resp) {
      autoDismissMs = resp.settings.popupAutoDismissMs;
      currentTheme = resp.settings.theme ?? "light";
      if (!resp.settings.enabled) return;
    }
  } catch {
    // Continue with defaults
  }

  document.addEventListener("mouseup", onMouseUp, { passive: true });
  document.addEventListener("keydown", onKeyDown, { passive: true });
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
}

// â”€â”€ Event handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function onMouseUp(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.id === "celticly-popup-host") return;

  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => evaluateSelection(e.clientX, e.clientY), SELECTION_DEBOUNCE_MS);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") dismissPopup();
}

function onRuntimeMessage(
  message: { type: string; text?: string; wordCount?: number },
  _sender: chrome.runtime.MessageSender,
  _sendResponse: (r: unknown) => void
): void {
  if (message.type === "START_TEST" && typeof message.wordCount === "number") {
    startTestMode(message.wordCount, sendMessage).catch(console.error);
    return;
  }
  if (message.type === "STOP_TEST") {
    stopTestMode(true);
    return;
  }
  if (message.type === "TRANSLATE_SELECTION" && message.text) {
    const sel = window.getSelection();
    let x = window.scrollX + window.innerWidth / 2;
    let y = window.scrollY + window.innerHeight / 2;
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      // Convert viewport coords to page-absolute coords for position:absolute popup
      x = rect.left + rect.width / 2 + window.scrollX;
      y = rect.bottom + window.scrollY;
    }
    triggerTranslation(message.text, x, y);
  }
}

// â”€â”€ Core logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function evaluateSelection(mouseX: number, mouseY: number): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    dismissPopup();
    return;
  }

  const text = sel.toString().trim();
  if (!text || text.length < 2) {
    dismissPopup();
    return;
  }

  const isSingleToken = !text.includes(" ");

  // Skip very short single tokens (single letters like "a", "I") unless they
  // contain Irish-specific accented characters (e.g. \u00e9 = "\u00e9")
  if (isSingleToken && text.length < 3 && !/[\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da]/.test(text)) {
    dismissPopup();
    return;
  }

  // Skip obvious acronyms/abbreviations (2\u20136 uppercase letters with no lowercase)
  if (isSingleToken && /^[A-Z]{2,6}$/.test(text)) {
    dismissPopup();
    return;
  }

  const anchor = sel.anchorNode;
  if (anchor && isWithinEditableContext(anchor)) return;

  if (text === lastTranslatedText && popup?.isVisible()) return;

  let x = mouseX;
  let y = mouseY;
  if (sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Convert viewport coords to page-absolute coords for position:absolute popup
      x = rect.left + rect.width / 2 + window.scrollX;
      y = rect.bottom + window.scrollY;
    }
  }

  // Extract surrounding sentence for context-aware translation
  const context = getSurroundingContext(sel);

  triggerTranslation(text, x, y, context);
}

/**
 * Extracts the sentence surrounding the current selection from the same text
 * node. Used to give the translation API grammatical context (e.g. case forms).
 */
function getSurroundingContext(sel: Selection): string | undefined {
  if (sel.rangeCount === 0) return undefined;

  const range = sel.getRangeAt(0);
  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) return undefined;

  const fullText = container.textContent ?? "";
  const start = range.startOffset;
  const end = range.endOffset;

  // Walk backwards to find sentence start (.!? or SOF)
  let sentStart = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (".!?".includes(fullText[i])) { sentStart = i + 1; break; }
  }

  // Walk forwards to find sentence end (.!? or EOF)
  let sentEnd = fullText.length;
  for (let i = end; i < fullText.length; i++) {
    if (".!?".includes(fullText[i])) { sentEnd = i + 1; break; }
  }

  const sentence = fullText.slice(sentStart, sentEnd).trim();
  // Return context only when the selection is a single word within a longer sentence
  return sentence.length > (end - start) + 3 ? sentence : undefined;
}

function triggerTranslation(text: string, x: number, y: number, context?: string): void {
  const truncated = text.length > MAX_TEXT_LENGTH;
  const displayText = truncated ? text.slice(0, MAX_TEXT_LENGTH) : text;
  const isWord = !displayText.includes(" ");

  lastTranslatedText = displayText;

  ensurePopup();
  popup!.showLoading(x, y);

  sendMessage({ type: "TRANSLATE", text: displayText, context })
    .then((resp: ExtensionResponse) => {
      if (!popup) return;
      if (resp.ok && "result" in resp) {
        popup.showResult(resp.result, truncated, {
          onSave: async (src, irish) => {
            await sendMessage({
              type: "SAVE_WORD",
              sourceText: src,
              irishText: irish,
              pageUrl: location.href,
              pageTitle: document.title,
            });
          },
          onClose: dismissPopup,
          onTranslateWord: (word: string) => {
            triggerTranslation(word, x, y);
          },
          onRetranslateWithMeaning: (word: string, pos: string) => {
            // Retranslate the word with POS context to get alternative translation
            triggerTranslation(word, x, y, `as a ${pos}`);
          },
          onSpeak: async (irishText: string) => {
            // Strip anything that isn't an English/Irish letter, space, or hyphen
            const cleanText = irishText.replace(/[^a-zA-Z\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da\s-]/g, '').trim();
            if (!cleanText) return;
            const resp = await sendMessage({ type: "SPEAK_WORD", text: cleanText, langCode: "ga-IE" });
            if (resp.ok && "audioContent" in resp) {
              const audio = new Audio(`data:audio/wav;base64,${(resp as { audioContent: string }).audioContent}`);
              audio.play().catch(() => { /* autoplay policy – silently ignore */ });
            }
          },
          onCheckGrammar: async (irishText: string) => {
            const grammarResp = await sendMessage({ type: "CHECK_GRAMMAR", text: irishText });
            if (grammarResp.ok && "errors" in grammarResp) {
              return (grammarResp as { ok: true; errors: import("../lib/types").GrammarError[] }).errors;
            }
            return [];
          },
          onBlacklistTranslation: async (sourceText: string, irishText: string) => {
            await sendMessage({
              type: "BLACKLIST_TRANSLATION",
              sourceText,
              irishText,
            });
          },
        });
      } else {
        const errMsg = resp.ok ? "Unexpected response" : (resp as { error: string }).error;
        popup.showError(errMsg, { onSave: async () => {}, onClose: dismissPopup, onTranslateWord: () => {}, onSpeak: async () => {}, onCheckGrammar: async () => [], onBlacklistTranslation: async () => {} });
      }
    })
    .catch((err: unknown) => {
      if (!popup) return;
      const msg = err instanceof Error ? err.message : String(err);
      popup.showError(msg, { onSave: async () => {}, onClose: dismissPopup, onTranslateWord: () => {}, onSpeak: async () => {}, onCheckGrammar: async () => [], onBlacklistTranslation: async () => {} });
    });
}

function dismissPopup(): void {
  popup?.dismiss();
  popup = null;
  lastTranslatedText = "";
}

function ensurePopup(): void {
  if (!popup) {
    popup = new TranslationPopup(autoDismissMs, currentTheme);
  }
}

// â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isWithinEditableContext(node: Node): boolean {
  let el: Node | null = node instanceof Element ? node : node.parentElement;
  while (el) {
    if (el instanceof HTMLElement) {
      const tag = el.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable ||
        el.getAttribute("role") === "textbox" ||
        el.getAttribute("role") === "combobox"
      ) {
        return true;
      }
      if (tag === "input" && el.getAttribute("type") === "password") return true;
    }
    el = el.parentElement;
  }
  return false;
}

function sendMessage(request: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error("Refresh this page to reconnect the extension."));
      return;
    }

    chrome.runtime.sendMessage(request as unknown as string, (response: ExtensionResponse) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message ?? "Unknown error";
        if (msg.toLowerCase().includes("context invalidated")) {
          reject(new Error("Refresh this page to reconnect the extension."));
        } else {
          reject(new Error(msg));
        }
      } else {
        resolve(response);
      }
    });
  });
}

// â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

init().catch(console.error);

