// ─── On-page translation popup (Shadow DOM isolated) ─────────────────────────
// Renders near the selection, handles all translation states, save action.

import type { TranslationResult } from "../lib/types";

const POPUP_ID = "cupla-focal-popup-host";

// Styles injected into the shadow root so host-page CSS cannot affect them
const POPUP_STYLES = `
  :host {
    all: initial;
  }

  .cf-popup {
    position: fixed;
    z-index: 2147483647;
    max-width: 320px;
    min-width: 200px;
    background: #1a1a2e;
    color: #e0e0e0;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 0;
    overflow: hidden;
    transition: opacity 0.15s ease, transform 0.15s ease;
    opacity: 0;
    transform: translateY(4px) scale(0.97);
    pointer-events: all;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .cf-popup.cf-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .cf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }

  .cf-brand {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #16c784;
    opacity: 0.85;
  }

  .cf-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #888;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.1s;
  }

  .cf-close:hover { color: #ccc; }

  .cf-body {
    padding: 12px 14px;
  }

  .cf-source {
    font-size: 12px;
    color: #999;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .cf-irish {
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    margin-bottom: 4px;
    word-break: break-word;
  }

  .cf-phonetic {
    font-size: 12px;
    color: #7eb8f4;
    margin-bottom: 8px;
    font-style: italic;
  }

  .cf-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #aaa;
    padding: 4px 0;
  }

  .cf-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: #16c784;
    border-radius: 50%;
    animation: cf-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes cf-spin {
    to { transform: rotate(360deg); }
  }

  .cf-error {
    color: #ff6b6b;
    font-size: 13px;
    line-height: 1.4;
  }

  .cf-error-code {
    font-size: 11px;
    color: #ff9c9c;
    margin-top: 4px;
    word-break: break-all;
  }

  .cf-actions {
    padding: 8px 14px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cf-save-btn {
    background: #16c784;
    color: #0a0a16;
    border: none;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .cf-save-btn:hover { background: #12b070; }
  .cf-save-btn:active { transform: scale(0.97); }
  .cf-save-btn:disabled { background: #2a5a3d; color: #7cc9a4; cursor: default; }

  .cf-saved-text {
    font-size: 12px;
    color: #16c784;
    font-weight: 600;
  }

  .cf-footer {
    padding: 4px 14px 8px;
    font-size: 10px;
    color: #555;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  .cf-truncated-note {
    font-size: 11px;
    color: #888;
    margin-top: 6px;
    font-style: italic;
  }
`;

export interface PopupCallbacks {
  onSave: (sourceText: string, irishText: string) => Promise<void>;
  onClose: () => void;
}

export class TranslationPopup {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private popupEl: HTMLElement | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly autoDismissMs: number) {}

  /** Show popup with a loading indicator near (x, y) on the page. */
  showLoading(x: number, y: number): void {
    this.ensure();
    this.position(x, y);
    this.renderLoading();
    this.setVisible(true);
  }

  /** Replace loading state with a successful translation. */
  showResult(
    result: TranslationResult,
    truncated: boolean,
    callbacks: PopupCallbacks
  ): void {
    this.ensure();
    this.renderResult(result, truncated, callbacks);
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  /** Replace loading state with an error. */
  showError(message: string, callbacks: PopupCallbacks): void {
    this.ensure();
    this.renderError(message, callbacks.onClose);
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  dismiss(): void {
    this.clearAutoDismiss();
    this.setVisible(false);
    // Remove from DOM after transition
    setTimeout(() => {
      this.host?.remove();
      this.host = null;
      this.shadow = null;
      this.popupEl = null;
    }, 200);
  }

  isVisible(): boolean {
    return this.popupEl?.classList.contains("cf-visible") ?? false;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private ensure(): void {
    // Remove stale host if it somehow got detached
    if (this.host && !document.contains(this.host)) {
      this.host = null;
      this.shadow = null;
      this.popupEl = null;
    }

    if (!this.host) {
      this.host = document.createElement("div");
      this.host.id = POPUP_ID;
      // Reset all inherited styles on the host element itself
      this.host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
      this.shadow = this.host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = POPUP_STYLES;
      this.shadow.appendChild(style);

      this.popupEl = document.createElement("div");
      this.popupEl.className = "cf-popup";
      this.shadow.appendChild(this.popupEl);

      document.documentElement.appendChild(this.host);
    }
  }

  private position(x: number, y: number): void {
    if (!this.host) return;

    const margin = 12;
    const popupW = 320;
    const popupH = 150; // rough estimate; real height may vary

    let left = x;
    let top = y + margin;

    // Prevent clipping at right edge
    if (left + popupW > window.innerWidth - margin) {
      left = window.innerWidth - popupW - margin;
    }
    if (left < margin) left = margin;

    // Flip above selection if clipping at bottom
    if (top + popupH > window.innerHeight - margin) {
      top = y - popupH - margin;
    }
    if (top < margin) top = margin;

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }

  private setVisible(visible: boolean): void {
    if (!this.popupEl) return;
    if (visible) {
      // Force reflow before adding class so transition plays
      void this.popupEl.offsetHeight;
      this.popupEl.classList.add("cf-visible");
    } else {
      this.popupEl.classList.remove("cf-visible");
    }
  }

  private renderLoading(): void {
    if (!this.popupEl) return;
    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Cúpla Focal</span>
      </div>
      <div class="cf-body">
        <div class="cf-loading">
          <div class="cf-spinner"></div>
          <span>Translating to Irish…</span>
        </div>
      </div>`;
  }

  private renderResult(
    result: TranslationResult,
    truncated: boolean,
    callbacks: PopupCallbacks
  ): void {
    if (!this.popupEl) return;

    const sourceEscaped = escapeHtml(result.sourceText);
    const irishEscaped = escapeHtml(result.irishText);
    const phoneticHtml = result.transliteratedText
      ? `<div class="cf-phonetic">${escapeHtml(result.transliteratedText)}</div>`
      : "";
    const truncatedNote = truncated
      ? `<div class="cf-truncated-note">⚠ Only the first 500 characters were translated.</div>`
      : "";
    const cachedNote = result.fromCache
      ? `<div class="cf-footer">Cached result</div>`
      : "";

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Cúpla Focal</span>
        <button class="cf-close" title="Close">✕</button>
      </div>
      <div class="cf-body">
        <div class="cf-source">${sourceEscaped}</div>
        <div class="cf-irish">${irishEscaped}</div>
        ${phoneticHtml}
        ${truncatedNote}
      </div>
      <div class="cf-actions">
        <button class="cf-save-btn">
          <span class="cf-save-icon">＋</span> Save to Word Bank
        </button>
      </div>
      ${cachedNote}`;

    // Close button
    this.popupEl
      .querySelector(".cf-close")
      ?.addEventListener("click", () => callbacks.onClose());

    // Save button
    const saveBtn = this.popupEl.querySelector<HTMLButtonElement>(".cf-save-btn");
    saveBtn?.addEventListener("click", async () => {
      if (!saveBtn) return;
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<div class="cf-spinner" style="width:12px;height:12px;border-width:2px;"></div> Saving…`;
      try {
        await callbacks.onSave(result.sourceText, result.irishText);
        saveBtn.innerHTML = `✓ Saved!`;
        saveBtn.style.background = "#2a5a3d";
        saveBtn.style.color = "#7cc9a4";
      } catch {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<span class="cf-save-icon">＋</span> Save to Word Bank`;
      }
    });
  }

  private renderError(message: string, onClose: () => void): void {
    if (!this.popupEl) return;

    // Categorise for user-friendly wording
    const isNoKey = message.toLowerCase().includes("no api key") || message.includes("NO_API_KEY");
    const displayMsg = isNoKey
      ? "No API key set. Open <strong>Extension Options</strong> to add your Microsoft Translator key."
      : escapeHtml(message);

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Cúpla Focal</span>
        <button class="cf-close" title="Close">✕</button>
      </div>
      <div class="cf-body">
        <div class="cf-error">⚠ ${displayMsg}</div>
      </div>`;

    this.popupEl
      .querySelector(".cf-close")
      ?.addEventListener("click", onClose);
  }

  private scheduleAutoDismiss(onClose: () => void): void {
    this.clearAutoDismiss();
    if (this.autoDismissMs > 0) {
      this.autoDismissTimer = setTimeout(onClose, this.autoDismissMs);
    }
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
