// â”€â”€â”€ On-page translation popup (Shadow DOM isolated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Renders near the selection, handles all translation states, save action.
// Light theme by default (Apple / Grammarly-inspired), with a dark variant.

import type { TranslationResult } from "../lib/types";

const POPUP_ID = "cupla-focal-popup-host";

const POPUP_STYLES = `
  :host { all: initial; }

  /* â”€â”€ Theme tokens â”€â”€ */
  .cf-popup {
    --bg:              #FFFFFF;
    --bg-header:       #F7F7F8;
    --bg-footer:       #FAFAFA;
    --border:          #E2E2E7;
    --text:            #1C1C1E;
    --text-muted:      #636366;
    --text-light:      #AEAEB2;
    --accent:          #16A34A;
    --accent-hover:    #15803D;
    --accent-fg:       #FFFFFF;
    --accent-subtle:   #DCFCE7;
    --accent-subtle-text: #166534;
    --chip-bg:         #F3F4F6;
    --chip-hover:      #DCFCE7;
    --chip-border:     transparent;
    --chip-text:       #374151;
    --chip-hover-text: #166534;
    --spinner-track:   rgba(0,0,0,0.1);
    --spinner-head:    #16A34A;
    --shadow:          0 4px 24px rgba(0,0,0,0.10), 0 1px 6px rgba(0,0,0,0.06);
    --radius:          14px;
    --error-text:      #DC2626;
    --error-bg:        #FEF2F2;
    --example-bg:      #F0FDF4;
    --example-border:  #BBF7D0;
    --example-text:    #065F46;
    --example-label:   #16A34A;
  }

  /* â”€â”€ Dark variant â”€â”€ */
  .cf-popup.cf-dark {
    --bg:              #1C1C2E;
    --bg-header:       rgba(255,255,255,0.04);
    --bg-footer:       rgba(0,0,0,0.15);
    --border:          rgba(255,255,255,0.08);
    --text:            #F2F2F7;
    --text-muted:      #AEAEB2;
    --text-light:      #636366;
    --accent:          #34D399;
    --accent-hover:    #10B981;
    --accent-fg:       #022C22;
    --accent-subtle:   rgba(52,211,153,0.15);
    --accent-subtle-text: #6EE7B7;
    --chip-bg:         rgba(255,255,255,0.08);
    --chip-hover:      rgba(52,211,153,0.18);
    --chip-border:     rgba(255,255,255,0.08);
    --chip-text:       #D1D5DB;
    --chip-hover-text: #6EE7B7;
    --spinner-track:   rgba(255,255,255,0.10);
    --spinner-head:    #34D399;
    --shadow:          0 8px 32px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.30);
    --error-text:      #FC8181;
    --error-bg:        rgba(252,129,129,0.10);
    --example-bg:      rgba(52,211,153,0.08);
    --example-border:  rgba(52,211,153,0.25);
    --example-text:    #6EE7B7;
    --example-label:   #34D399;
  }

  /* â”€â”€ Base â”€â”€ */
  .cf-popup {
    position: fixed;
    z-index: 2147483647;
    max-width: 340px;
    min-width: 220px;
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 0;
    overflow: hidden;
    transition: opacity 0.15s ease, transform 0.15s ease;
    opacity: 0;
    transform: translateY(6px) scale(0.97);
    pointer-events: all;
    border: 1px solid var(--border);
  }

  .cf-popup.cf-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* â”€â”€ Header â”€â”€ */
  .cf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 9px;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
  }

  .cf-brand {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .cf-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-light);
    font-size: 15px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.1s, background 0.1s;
  }
  .cf-close:hover { color: var(--text); background: var(--chip-bg); }

  /* â”€â”€ Body â”€â”€ */
  .cf-body { padding: 12px 14px 4px; }

  .cf-source {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cf-irish {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 2px;
    word-break: break-word;
    letter-spacing: -0.3px;
  }

  .cf-phonetic {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-style: italic;
  }

  /* â”€â”€ Context sentence â”€â”€ */
  .cf-context {
    margin-top: 8px;
    padding: 7px 10px;
    background: var(--accent-subtle);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.45;
  }

  .cf-context-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent-subtle-text);
    margin-bottom: 3px;
    opacity: 0.8;
  }

  .cf-context-text {
    color: var(--accent-subtle-text);
    font-style: italic;
  }

  /* â”€â”€ Word chips (per-word breakdown) â”€â”€ */
  .cf-chips-wrap {
    margin-top: 10px;
  }

  .cf-chips-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-light);
    margin-bottom: 6px;
  }

  .cf-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .cf-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    background: var(--chip-bg);
    border: 1px solid var(--chip-border);
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    color: var(--chip-text);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, transform 0.08s;
    user-select: none;
  }
  .cf-chip:hover {
    background: var(--chip-hover);
    color: var(--chip-hover-text);
    transform: translateY(-1px);
  }
  .cf-chip:active { transform: scale(0.95); }

  /* â”€â”€ Example sentence â”€â”€ */
  .cf-example, .cf-example-pending {
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--example-bg);
    border: 1px solid var(--example-border);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
  }

  .cf-example-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--example-label);
    margin-bottom: 4px;
  }

  .cf-example-en {
    color: var(--text-muted);
    margin-bottom: 2px;
  }

  .cf-example-ga {
    color: var(--example-text);
    font-weight: 500;
  }

  .cf-example-pending {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-light);
    font-size: 12px;
  }

  /* â”€â”€ Loading â”€â”€ */
  .cf-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    padding: 6px 0;
  }

  .cf-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--spinner-track);
    border-top-color: var(--spinner-head);
    border-radius: 50%;
    animation: cf-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes cf-spin { to { transform: rotate(360deg); } }

  /* â”€â”€ Error â”€â”€ */
  .cf-error {
    color: var(--error-text);
    font-size: 13px;
    line-height: 1.45;
    background: var(--error-bg);
    border-radius: 8px;
    padding: 8px 10px;
  }

  /* â”€â”€ Actions bar â”€â”€ */
  .cf-actions {
    padding: 10px 14px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .cf-save-btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.08s, box-shadow 0.15s;
    display: flex;
    align-items: center;
    gap: 5px;
    box-shadow: 0 1px 4px rgba(22,163,74,0.18);
  }
  .cf-save-btn:hover { background: var(--accent-hover); box-shadow: 0 2px 8px rgba(22,163,74,0.28); }
  .cf-save-btn:active { transform: scale(0.96); }
  .cf-save-btn:disabled {
    background: var(--accent-subtle);
    color: var(--accent-subtle-text);
    cursor: default;
    box-shadow: none;
  }

  .cf-no-save {
    font-size: 11px;
    color: var(--text-light);
    font-style: italic;
  }

  .cf-saved-ok {
    font-size: 12px;
    color: var(--accent);
    font-weight: 600;
  }

  /* â”€â”€ Footer â”€â”€ */
  .cf-footer {
    padding: 4px 14px 7px;
    font-size: 10px;
    color: var(--text-light);
    background: var(--bg-footer);
    border-top: 1px solid var(--border);
  }

  .cf-truncated-note {
    font-size: 11px;
    color: var(--text-light);
    margin-top: 6px;
    font-style: italic;
  }
`;

export interface PopupCallbacks {
  onSave: (sourceText: string, irishText: string) => Promise<void>;
  onClose: () => void;
  onTranslateWord: (word: string) => void;
}

export class TranslationPopup {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private popupEl: HTMLElement | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly autoDismissMs: number,
    private readonly theme: "light" | "dark" | "auto" = "light"
  ) {}

  showLoading(x: number, y: number): void {
    this.lastX = x;
    this.lastY = y;
    this.ensure();
    this.position(x, y);
    this.renderLoading();
    this.setVisible(true);
  }

  showResult(result: TranslationResult, truncated: boolean, callbacks: PopupCallbacks): void {
    this.ensure();
    this.renderResult(result, truncated, callbacks);
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  showError(message: string, callbacks: PopupCallbacks): void {
    this.ensure();
    this.renderError(message, callbacks.onClose);
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  /** Called asynchronously after showResult to inject the example sentence. */
  updateExample(example: { sentence: string; irish: string }): void {
    if (!this.popupEl) return;
    const pending = this.popupEl.querySelector(".cf-example-pending");
    if (!pending) return;

    pending.className = "cf-example";
    pending.innerHTML = `
      <div class="cf-example-label">ðŸ’¡ Try using it</div>
      <div class="cf-example-en">${escapeHtml(example.sentence)}</div>
      <div class="cf-example-ga">${escapeHtml(example.irish)}</div>`;
  }

  dismiss(): void {
    this.clearAutoDismiss();
    this.setVisible(false);
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

  // â”€â”€ Private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private resolvedTheme(): "light" | "dark" {
    if (this.theme === "auto") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return this.theme;
  }

  private ensure(): void {
    if (this.host && !document.contains(this.host)) {
      this.host = null;
      this.shadow = null;
      this.popupEl = null;
    }

    if (!this.host) {
      this.host = document.createElement("div");
      this.host.id = POPUP_ID;
      this.host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
      this.shadow = this.host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = POPUP_STYLES;
      this.shadow.appendChild(style);

      this.popupEl = document.createElement("div");
      this.popupEl.className = "cf-popup";
      if (this.resolvedTheme() === "dark") {
        this.popupEl.classList.add("cf-dark");
      }
      this.shadow.appendChild(this.popupEl);

      document.documentElement.appendChild(this.host);
    }
  }

  private position(x: number, y: number): void {
    if (!this.host) return;

    const margin = 12;
    const popupW = 340;
    const popupH = 180;

    let left = x - popupW / 2;
    let top = y + margin;

    if (left + popupW > window.innerWidth - margin) left = window.innerWidth - popupW - margin;
    if (left < margin) left = margin;
    if (top + popupH > window.innerHeight - margin) top = y - popupH - margin;
    if (top < margin) top = margin;

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }

  private setVisible(visible: boolean): void {
    if (!this.popupEl) return;
    if (visible) {
      void this.popupEl.offsetHeight;
      this.popupEl.classList.add("cf-visible");
    } else {
      this.popupEl.classList.remove("cf-visible");
    }
  }

  private scheduleAutoDismiss(onClose: () => void): void {
    this.clearAutoDismiss();
    if (this.autoDismissMs > 0) {
      this.autoDismissTimer = setTimeout(() => onClose(), this.autoDismissMs);
    }
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  private renderLoading(): void {
    if (!this.popupEl) return;
    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">CÃºpla Focal</span>
      </div>
      <div class="cf-body">
        <div class="cf-loading">
          <div class="cf-spinner"></div>
          <span>Translating to Irishâ€¦</span>
        </div>
      </div>`;
  }

  private renderResult(
    result: TranslationResult,
    truncated: boolean,
    callbacks: PopupCallbacks
  ): void {
    if (!this.popupEl) return;

    const isWord = result.isWord ?? !result.sourceText.includes(" ");
    const sourceEscaped = escapeHtml(result.sourceText);
    const irishEscaped = escapeHtml(result.irishText);

    const phoneticHtml = result.transliteratedText
      ? `<div class="cf-phonetic">${escapeHtml(result.transliteratedText)}</div>`
      : "";

    // Context sentence (grammar-aware in-page context)
    const contextHtml = result.contextSentenceIrish
      ? `<div class="cf-context">
           <span class="cf-context-label">In context</span>
           <span class="cf-context-text">${escapeHtml(result.contextSentenceIrish)}</span>
         </div>`
      : "";

    // Per-word chips when a phrase/sentence was selected
    const wordChipsHtml = !isWord
      ? this.buildWordChips(result.sourceText)
      : "";

    // Example sentence section (single word only)
    let exampleHtml = "";
    if (isWord) {
      if (result.exampleSentence) {
        exampleHtml = `
          <div class="cf-example">
            <div class="cf-example-label">ðŸ’¡ Try using it</div>
            <div class="cf-example-en">${escapeHtml(result.exampleSentence)}</div>
            <div class="cf-example-ga">${escapeHtml(result.exampleSentenceIrish ?? "")}</div>
          </div>`;
      } else {
        // Placeholder â€“ updated later by updateExample()
        exampleHtml = `
          <div class="cf-example-pending">
            <div class="cf-spinner" style="width:12px;height:12px;border-width:1.5px;"></div>
            <span>Loading exampleâ€¦</span>
          </div>`;
      }
    }

    const truncatedNote = truncated
      ? `<div class="cf-truncated-note">âš  Only the first 500 characters were translated.</div>`
      : "";

    const cachedNote = result.fromCache
      ? `<div class="cf-footer">Cached result</div>`
      : "";

    // Save button â€“ disabled for phrases/sentences
    const saveAreaHtml = isWord
      ? `<button class="cf-save-btn"><span>ï¼‹</span> Save to Word Bank</button>`
      : `<span class="cf-no-save">Select a single word to save to Word Bank</span>`;

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">CÃºpla Focal</span>
        <button class="cf-close" title="Close">âœ•</button>
      </div>
      <div class="cf-body">
        <div class="cf-source">${sourceEscaped}</div>
        <div class="cf-irish">${irishEscaped}</div>
        ${phoneticHtml}
        ${contextHtml}
        ${wordChipsHtml}
        ${exampleHtml}
        ${truncatedNote}
      </div>
      <div class="cf-actions">${saveAreaHtml}</div>
      ${cachedNote}`;

    // Close
    this.popupEl.querySelector(".cf-close")?.addEventListener("click", () => callbacks.onClose());

    // Save (single words only)
    if (isWord) {
      const saveBtn = this.popupEl.querySelector<HTMLButtonElement>(".cf-save-btn");
      saveBtn?.addEventListener("click", async () => {
        if (!saveBtn) return;
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<div class="cf-spinner" style="width:11px;height:11px;border-width:2px;"></div> Savingâ€¦`;
        try {
          await callbacks.onSave(result.sourceText, result.irishText);
          if (this.popupEl) {
            const actionsEl = this.popupEl.querySelector(".cf-actions");
            if (actionsEl) actionsEl.innerHTML = `<span class="cf-saved-ok">âœ“ Saved to Word Bank!</span>`;
          }
        } catch {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<span>ï¼‹</span> Save to Word Bank`;
        }
      });
    }

    // Word chip clicks
    this.popupEl.querySelectorAll<HTMLElement>(".cf-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const word = chip.dataset.word ?? "";
        if (word) callbacks.onTranslateWord(word);
      });
    });
  }

  private buildWordChips(text: string): string {
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 1) // skip single-char filler
      .map((w) => w.replace(/[.,!?;:'"()\[\]{}]/g, "")); // strip punctuation

    const unique = [...new Set(words)].filter(Boolean);
    if (unique.length === 0) return "";

    const chips = unique
      .map((w) => `<span class="cf-chip" data-word="${escapeHtml(w)}">${escapeHtml(w)}</span>`)
      .join("");

    return `
      <div class="cf-chips-wrap">
        <div class="cf-chips-label">Translate a word</div>
        <div class="cf-chips">${chips}</div>
      </div>`;
  }

  private renderError(message: string, onClose: () => void): void {
    if (!this.popupEl) return;

    const isNoKey =
      message.toLowerCase().includes("no api key") || message.includes("NO_API_KEY");
    const displayMsg = isNoKey
      ? "No API key set. Open <strong>Extension Options</strong> to add your Google Cloud Translation API key."
      : escapeHtml(message);

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">CÃºpla Focal</span>
        <button class="cf-close" title="Close">âœ•</button>
      </div>
      <div class="cf-body">
        <div class="cf-error">âš  ${displayMsg}</div>
      </div>`;

    this.popupEl.querySelector(".cf-close")?.addEventListener("click", onClose);
  }
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

