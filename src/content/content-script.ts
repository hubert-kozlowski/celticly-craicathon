// ─── Content Script ────────────────────────────────────────────────────────────
// Detects text selections on arbitrary pages, orchestrates popup lifecycle,
// and bridges between the page layer and the service worker.

import type { ExtensionResponse, ExtensionRequest } from "../lib/messages";
import { TranslationPopup } from "./popup-ui";

const SELECTION_DEBOUNCE_MS = 350;
const MAX_TEXT_LENGTH = 500;

let popup: TranslationPopup | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTranslatedText = "";
let autoDismissMs = 8000; // will be synced from settings

// ── Initialise ─────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Load settings once on injection; use defaults if service worker unavailable
  try {
    const resp = await sendMessage({ type: "GET_SETTINGS" });
    if (resp.ok && "settings" in resp) {
      autoDismissMs = resp.settings.popupAutoDismissMs;
      if (!resp.settings.enabled) return; // Extension disabled by user
    }
  } catch {
    // Continue with defaults; settings unavailable shouldn't block functionality
  }

  document.addEventListener("mouseup", onMouseUp, { passive: true });
  document.addEventListener("keydown", onKeyDown, { passive: true });

  // Listen for messages from the service worker (context-menu trigger)
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
}

// ── Event handlers ─────────────────────────────────────────────────────────────

function onMouseUp(e: MouseEvent): void {
  // Ignore clicks inside our own popup
  const target = e.target as HTMLElement;
  if (target.id === "cupla-focal-popup-host") return;

  // Small delay to let the browser finalise the selection range
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => evaluateSelection(e.clientX, e.clientY), SELECTION_DEBOUNCE_MS);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") dismissPopup();
}

function onRuntimeMessage(
  message: { type: string; text?: string },
  _sender: chrome.runtime.MessageSender,
  _sendResponse: (r: unknown) => void
): void {
  if (message.type === "TRANSLATE_SELECTION" && message.text) {
    // Context menu triggered – get current selection anchor for positioning
    const sel = window.getSelection();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.bottom;
    }
    triggerTranslation(message.text, x, y);
  }
}

// ── Core logic ─────────────────────────────────────────────────────────────────

function evaluateSelection(mouseX: number, mouseY: number): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    // User clicked without selecting – dismiss if nothing useful selected
    dismissPopup();
    return;
  }

  const text = sel.toString().trim();
  if (!text || text.length < 2) {
    dismissPopup();
    return;
  }

  // Never translate inside sensitive or editable fields
  const anchor = sel.anchorNode;
  if (anchor && isWithinEditableContext(anchor)) {
    return;
  }

  // Avoid re-requesting the exact same text that is already shown
  if (text === lastTranslatedText && popup?.isVisible()) return;

  // Compute position from the selection bounding rect if possible
  let x = mouseX;
  let y = mouseY;
  if (sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      x = rect.left + rect.width / 2;
      y = rect.bottom;
    }
  }

  triggerTranslation(text, x, y);
}

function triggerTranslation(text: string, x: number, y: number): void {
  const truncated = text.length > MAX_TEXT_LENGTH;
  const displayText = truncated ? text.slice(0, MAX_TEXT_LENGTH) : text;

  lastTranslatedText = displayText;

  // Show (or re-show) popup in loading state
  ensurePopup();
  popup!.showLoading(x, y);

  sendMessage({ type: "TRANSLATE", text: displayText })
    .then((resp: ExtensionResponse) => {
      if (!popup) return; // dismissed while request was in-flight
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
        });
      } else {
        const errMsg = resp.ok ? "Unexpected response" : (resp as { error: string }).error;
        popup.showError(errMsg, { onSave: async () => {}, onClose: dismissPopup });
      }
    })
    .catch((err: unknown) => {
      if (!popup) return;
      const msg = err instanceof Error ? err.message : String(err);
      popup.showError(msg, { onSave: async () => {}, onClose: dismissPopup });
    });
}

function dismissPopup(): void {
  popup?.dismiss();
  popup = null;
  lastTranslatedText = "";
}

function ensurePopup(): void {
  if (!popup) {
    popup = new TranslationPopup(autoDismissMs);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

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
      // Check for password fields specifically
      if (tag === "input" && el.getAttribute("type") === "password") return true;
    }
    el = el.parentElement;
  }
  return false;
}

function sendMessage(request: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    // The @types/chrome overloads require casting the message as `unknown` when
    // not supplying an explicit extensionId
    chrome.runtime.sendMessage(request as unknown as string, (response: ExtensionResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────────

init().catch(console.error);
