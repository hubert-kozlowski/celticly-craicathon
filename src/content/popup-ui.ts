// â”€â”€â”€ On-page translation popup (Shadow DOM isolated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Renders near the selection, handles all translation states, save action.
// Light theme by default (Apple / Grammarly-inspired), with a dark variant.

import type { TranslationResult, GrammarError, WordDefinition } from "../lib/types";

const POPUP_ID = "celticly-popup-host";

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
    position: absolute;
    z-index: 2147483647;
    width: 340px;
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 0;
    overflow: hidden;
    transition: opacity 140ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 160ms cubic-bezier(0.2, 0.9, 0.2, 1), width 220ms cubic-bezier(0.35, 0.46, 0.6, 1);
    will-change: opacity, transform;
    opacity: 0;
    transform: translateY(6px) scale(0.97);
    pointer-events: all;
    border: 1px solid var(--border);
  }

  .cf-popup.cf-wide {
    width: 480px;
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
    transition: color 120ms cubic-bezier(0.2,0.8,0.2,1), background 120ms cubic-bezier(0.2,0.8,0.2,1);
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
    padding: 6px 12px;
    background: var(--chip-bg);
    border: 1px solid var(--chip-border);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: var(--chip-text);
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1), color 140ms cubic-bezier(0.2,0.8,0.2,1), transform 140ms cubic-bezier(0.2,0.85,0.2,1), box-shadow 140ms cubic-bezier(0.2,0.8,0.2,1);
    will-change: transform, opacity;
    user-select: none;
  }
  .cf-chip:hover {
    background: var(--chip-hover);
    color: var(--chip-hover-text);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.06);
  }
  .cf-chip:active { transform: scale(0.95); }

  /* â”€â”€ Example sentence â”€â”€ */
  .cf-example {
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--example-bg);
    border: 1px solid var(--example-border);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
  }

  .cf-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    margin-bottom: 2px;
    flex-wrap: wrap;
  }

  .cf-pron {
    font-style: italic;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .cf-meta-sep { color: var(--text-light); }

  .cf-word-type-badge {
    background: var(--accent-subtle);
    color: var(--accent-subtle-text);
    border-radius: 20px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 600;
  }

  .cf-proper-noun-badge {
    background: rgba(59, 130, 246, 0.12);
    color: #1e40af;
    border-radius: 20px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 600;
  }

  .cf-popup.cf-dark .cf-proper-noun-badge {
    background: rgba(96, 165, 250, 0.15);
    color: #93c5fd;
  }

  .cf-preprocessed-badge {
    background: rgba(168, 85, 247, 0.12);
    color: #7e22ce;
    border-radius: 20px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 600;
  }

  .cf-popup.cf-dark .cf-preprocessed-badge {
    background: rgba(196, 181, 253, 0.15);
    color: #d8b4fe;
  }

  .cf-same-word {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
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

  .cf-actions-left { display: flex; gap: 8px; align-items: center; }
  .cf-actions-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }

  .cf-save-btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1), transform 120ms cubic-bezier(0.2,0.85,0.2,1), box-shadow 160ms cubic-bezier(0.2,0.8,0.2,1);
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

  .cf-irish-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .cf-irish-row .cf-irish { margin-bottom: 0; }

  .cf-speak-btn {
    background: var(--chip-bg);
    border: 1px solid var(--border);
    padding: 4px 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border-radius: 6px;
    transition: color 140ms cubic-bezier(0.2,0.8,0.2,1), background 140ms cubic-bezier(0.2,0.8,0.2,1), border-color 140ms cubic-bezier(0.2,0.8,0.2,1), transform 120ms cubic-bezier(0.2,0.85,0.2,1);
    flex-shrink: 0;
    line-height: 0;
  }
  .cf-speak-btn:hover {
    color: var(--accent);
    background: var(--accent-subtle);
    border-color: var(--accent);
  }
  .cf-speak-btn:active { transform: scale(0.93); }
  .cf-speak-btn:disabled { cursor: default; opacity: 0.45; }

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

  /* ── Blacklist button ── */
  .cf-blacklist-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 6px 10px;
    cursor: pointer;
    border-radius: 6px;
    font-size: 16px;
    transition: color 140ms cubic-bezier(0.2,0.8,0.2,1), background 140ms cubic-bezier(0.2,0.8,0.2,1), border-color 140ms cubic-bezier(0.2,0.8,0.2,1), transform 120ms cubic-bezier(0.2,0.85,0.2,1), opacity 200ms cubic-bezier(0.2,0.8,0.2,1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    flex-shrink: 0;
  }
  
  .cf-blacklist-btn:hover:not(:disabled) {
    color: #dc2626; /* red */
    background: rgba(220, 38, 38, 0.08);
    border-color: #dc2626;
  }
  
  .cf-blacklist-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  
  .cf-blacklist-btn:disabled {
    opacity: 0.4;
    cursor: default;
    color: #dc2626;
    background: rgba(220, 38, 38, 0.08);
    border-color: #dc2626;
  }
  
  .cf-blacklist-btn.cf-blacklisted {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.08);
    border-color: #dc2626;
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

  /* ── Grammar check button ── */
  .cf-grammar-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1), color 140ms cubic-bezier(0.2,0.8,0.2,1), border-color 140ms cubic-bezier(0.2,0.8,0.2,1);
  }
  .cf-grammar-btn:hover {
    background: var(--accent-subtle);
    color: var(--accent-subtle-text);
    border-color: var(--accent);
  }
  .cf-grammar-btn:disabled { opacity: 0.45; cursor: default; }

  /* ── Grammar results section ── */
  .cf-grammar-section {
    padding: 8px 14px 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .cf-grammar-ok {
    color: var(--accent);
    font-weight: 600;
    font-size: 12px;
  }

  .cf-grammar-error {
    margin-bottom: 7px;
    padding: 6px 9px;
    background: var(--error-bg);
    border-radius: 6px;
    line-height: 1.45;
  }
  .cf-grammar-error:last-child { margin-bottom: 0; }

  .cf-grammar-errortext {
    font-weight: 700;
    color: var(--error-text);
    margin-right: 5px;
  }

  .cf-grammar-msg {
    color: var(--text);
  }

  .cf-grammar-ctx {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-light);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Meanings list (multiple definitions from Wiktionary) ── */
  .cf-meanings {
    margin-top: 8px;
    padding: 7px 10px;
    background: var(--chip-bg);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .cf-meanings-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-light);
    margin-bottom: 4px;
  }

  .cf-meanings-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cf-meanings-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .cf-meanings-item:last-child {
    border-bottom: none;
  }

  .cf-meanings-header {
    display: flex;
    gap: 5px;
    align-items: baseline;
  }

  .cf-meanings-pos {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--accent);
    letter-spacing: 0.04em;
    min-width: 28px;
  }

  .cf-meanings-def {
    color: var(--text-muted);
    flex: 1;
    font-size: 12px;
  }

  .cf-meanings-irish {
    color: var(--accent);
    font-weight: 500;
    font-size: 13px;
    margin-left: 28px;
  }

  .cf-meanings-example {
    color: var(--text-light);
    font-size: 11px;
    margin-left: 28px;
    line-height: 1.4;
  }

  .cf-meanings-example.cf-example-placeholder {
    opacity: 0.6;
    font-style: normal;
    color: var(--text-muted);
  }

  .cf-meanings-retranslate {
    align-self: flex-end;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--accent);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 10px;
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1), color 140ms cubic-bezier(0.2,0.8,0.2,1), border-color 140ms cubic-bezier(0.2,0.8,0.2,1);
    min-width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .cf-meanings-retranslate:hover {
    background: var(--accent-subtle);
    border-color: var(--accent);
  }

  .cf-meanings-retranslate:active {
    opacity: 0.7;
  }

  /* ── Spell alternatives (GaelSpell corrections) ── */
  .cf-spell-alts {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-light);
    font-style: italic;
  }

  .cf-spell-alts-word {
    cursor: pointer;
    color: var(--accent);
    font-style: normal;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .cf-spell-alts-word:hover { color: var(--accent-hover); }

  /* ── Similar words button ── */
  .cf-similar-words-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .cf-similar-words-btn:hover {
    background: var(--accent-subtle);
    color: var(--accent-subtle-text);
    border-color: var(--accent);
  }
  .cf-similar-words-btn:disabled { opacity: 0.45; cursor: default; }

  /* ── Similar words section ── */
  .cf-similar-words-section {
    padding: 8px 14px 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .cf-similar-words-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cf-similar-word-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--accent-subtle);
    border-radius: 6px;
    border: 1px solid var(--accent);
    gap: 8px;
  }

  .cf-similar-word-text {
    flex: 1;
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cf-similar-word-irish {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
    max-width: 60px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cf-similar-words-title {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .cf-similar-word-btn {
    flex-shrink: 0;
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1), opacity 140ms cubic-bezier(0.2,0.8,0.2,1);
  }
  .cf-similar-word-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .cf-similar-word-btn:disabled { opacity: 0.6; cursor: default; }

  .cf-info-section {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Expandable sections ── */
  .cf-expandable {
    margin-top: 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .cf-expandable-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--chip-bg);
    cursor: pointer;
    transition: background 140ms cubic-bezier(0.2,0.8,0.2,1);
    user-select: none;
  }
  .cf-expandable-header:hover {
    background: var(--accent-subtle);
  }

  .cf-expandable-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .cf-expandable-toggle {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 12px;
    transition: transform 140ms cubic-bezier(0.2,0.85,0.2,1);
    flex-shrink: 0;
  }

  .cf-expandable.cf-expanded .cf-expandable-toggle {
    transform: rotate(180deg);
  }

  .cf-expandable-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 220ms cubic-bezier(0.2,0.8,0.2,1);
  }

  .cf-expandable.cf-expanded .cf-expandable-content {
    max-height: 500px;
  }

  .cf-expandable-inner {
    padding: 10px 12px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }
`;

export interface PopupCallbacks {
  onSave: (sourceText: string, irishText: string) => Promise<void>;
  onClose: () => void;
  onTranslateWord: (word: string) => void;
  onRetranslateWithMeaning?: (word: string, pos: string) => void;  // Retranslate with a specific part of speech
  onSpeak: (irishText: string) => Promise<void>;
  onCheckGrammar: (irishText: string) => Promise<GrammarError[]>;
  onBlacklistTranslation: (sourceText: string, irishText: string) => Promise<void>;  // Blacklist a bad translation
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
    // Re-position using actual rendered dimensions so the popup is never clipped
    requestAnimationFrame(() => this.position(this.lastX, this.lastY));
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  showError(message: string, callbacks: PopupCallbacks): void {
    this.ensure();
    this.renderError(message, callbacks.onClose);
    this.scheduleAutoDismiss(callbacks.onClose);
  }

  /** Called asynchronously after showResult to inject word insights. */
  // NOTE: insights are now returned synchronously in the translate response;
  //       this method is retained only as a no-op safety net.
  updateInsights(_data: { sentence: string; irish: string; pronunciation?: string; wordType?: string }): void {}

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
      this.host.style.cssText = "all: initial; position: absolute; z-index: 2147483647;";
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
    // Use actual rendered dimensions when available; fall back to estimates
    // Default 340px, or 480px if wide mode
    const estimatedWidth = this.popupEl?.classList.contains("cf-wide") ? 480 : 340;
    const popupW = this.popupEl?.offsetWidth || estimatedWidth;
    const popupH = this.popupEl?.offsetHeight || 340;

    const pageW = document.documentElement.scrollWidth;
    const pageH = document.documentElement.scrollHeight;

    let left = x - popupW / 2;
    let top = y + margin;

    if (left + popupW > pageW - margin) left = pageW - popupW - margin;
    if (left < margin) left = margin;
    if (top + popupH > pageH - margin) top = y - popupH - margin;
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
    this.popupEl.classList.remove("cf-wide");
    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Celticly</span>
      </div>
      <div class="cf-body">
        <div class="cf-loading">
          <div class="cf-spinner"></div>
          <span>Translating to Irish...</span>
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

    // Word-type badge (single words only; from Wiktionary)
    const wordTypeBadge = (isWord && result.wordType)
      ? `<span class="cf-word-type-badge">${escapeHtml(result.wordType)}</span>`
      : "";
    
    // Proper noun type badge with SVG icons
    const properNounLabels = {
      place: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>', label: 'Place' },
      person: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', label: 'Person' },
      brand: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7v-2a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>', label: 'Brand' },
      organization: { icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', label: 'Organization' }
    };
    const properNounBadge = result.properNounType && result.properNounType !== "unknown"
      ? `<span class="cf-proper-noun-badge" data-type="${result.properNounType}">
          ${properNounLabels[result.properNounType]?.icon || ''} ${properNounLabels[result.properNounType]?.label || result.properNounType}
        </span>`
      : "";
    
    // Preprocessing badge (indicates numbers/dates were converted)
    const preproccBadge = result.isPreprocessed
      ? `<span class="cf-preprocessed-badge" title="Numbers and dates converted to words"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="12" fill="white" font-weight="bold">i</text></svg> Preprocessed</span>`
      : "";
    
    const metaHtml = (wordTypeBadge || properNounBadge || preproccBadge)
      ? `<div class="cf-meta">${wordTypeBadge}${properNounBadge}${preproccBadge}</div>`
      : "";

    // Note shown when the word has the same spelling in Irish
    const sameWordHtml = result.sameInBothLanguages
      ? `<div class="cf-same-word"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Same spelling in Irish</div>`
      : "";

    const truncatedNote = truncated
      ? `<div class="cf-truncated-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Only the first 500 characters were translated.</div>`
      : "";

    const cachedNote = result.fromCache
      ? `<div class="cf-footer">Cached result</div>`
      : "";

    // Save button -- disabled for phrases/sentences
    const saveAreaHtml = isWord
      ? `<button class="cf-save-btn"><span>+</span> Save to Word Bank</button>`
      : `<span class="cf-no-save">Select a single word to save to Word Bank</span>`;

    // Blacklist button (downvote/report bad translation) -- for single words only
    const thumbDownOutline = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14v6a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-6"/><path d="M21 10h-6l1-5-4.5 0.5"/><path d="M7 10V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></svg>`;
    const thumbDownFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14v6a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-6h-7z"/><path d="M21 10h-6l1-5-4.5.5V10h9z"/><path d="M7 10V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3V10z"></svg>`;
    const isBlacklisted = result.userRating === -1 || result.isBlacklisted === true;
    const blacklistIcon = isBlacklisted ? thumbDownFilled : thumbDownOutline;
    const blacklistButtonHtml = isWord
      ? `<button class="cf-blacklist-btn ${isBlacklisted ? "cf-blacklisted" : ""}" 
               title="Report this translation as incorrect" 
               aria-pressed="${isBlacklisted ? "true" : "false"}" 
               ${isBlacklisted ? "disabled" : ""}>${blacklistIcon}</button>`
      : "";
    const speakSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    const speakHtml = isWord
      ? `<button class="cf-speak-btn" title="Hear Irish pronunciation">${speakSvg}</button>`
      : "";
    // Phonetic spelling (greyed out, minimal text)
    const phoneticHtml = result.phoneticSpelling
      ? `<div class="cf-phonetic">${escapeHtml(result.phoneticSpelling)}</div>`
      : "";

    // Helper: deduplicate definitions and generate example text if missing
    const deduplicateDefinitions = (defs: WordDefinition[]): WordDefinition[] => {
      if (!defs || defs.length <= 1) return defs || [];
      const seen = new Set<string>();
      return defs.filter(d => {
        // Normalize for dedup: first 40 chars, alphanumeric only
        const norm = d.definition.toLowerCase().substring(0, 40).replace(/[^a-z0-9\s]/g, "");
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
    };

    const generateExampleText = (word: string, pos: string): string => {
      // Generate a simple "ghost text" example showing word usage pattern
      const examples: Record<string, string[]> = {
        noun: [
          `The ${word} was essential.`,
          `I found a ${word}.`,
          `This ${word} is important.`,
        ],
        verb: [
          `He will ${word} tomorrow.`,
          `They ${word} every day.`,
          `We need to ${word} this.`,
        ],
        adjective: [
          `That is very ${word}.`,
          `The ${word} result was clear.`,
          `This seems ${word}.`,
        ],
        adverb: [
          `Done ${word}.`,
          `Very ${word} speaking.`,
          `He acted ${word}.`,
        ],
      };
      const posKey = pos.toLowerCase().includes("verb") ? "verb" : 
                     pos.toLowerCase().includes("adj") ? "adjective" :
                     pos.toLowerCase().includes("adv") ? "adverb" : "noun";
      const list = examples[posKey] || examples.noun;
      return list[Math.floor(Math.random() * list.length)];
    };

    const deduped = deduplicateDefinitions(result.definitions || []);
    const definitionsWithExamples = deduped.map(d => ({
      ...d,
      // English example (from Wiktionary) or generated placeholder
      exampleEn: d.example || generateExampleText(result.sourceText, d.pos),
      // Irish meaning if provided by provider/Wiktionary
      exampleGa: d.irishMeaning || "",
    }));

    // Multiple meanings (from Wiktionary, single words only)
    const meaningsHtml = (isWord && definitionsWithExamples.length > 0)
      ? `<div class="cf-meanings">
           <span class="cf-meanings-label">Meanings</span>
           <ul class="cf-meanings-list">
             ${definitionsWithExamples.map((d, idx) =>
               `<li class="cf-meanings-item" data-pos="${escapeHtml(d.pos)}" data-idx="${idx}">
                 <div class="cf-meanings-header">
                   <span class="cf-meanings-pos">${escapeHtml(d.pos.slice(0, 4))}</span>
                   <span class="cf-meanings-def">${escapeHtml(d.definition)}</span>
                 </div>
                 ${d.irishMeaning ? `<div class="cf-meanings-irish">${escapeHtml(d.irishMeaning)}</div>` : ""}
                 <div class="cf-meanings-example">
                   ${d.exampleGa ? `<div class="cf-example-ga">${escapeHtml(d.exampleGa)}</div>` : ""}
                   ${d.exampleEn ? `<div class="cf-example-en">${escapeHtml(d.exampleEn)}</div>` : ""}
                 </div>
                 <button class="cf-meanings-retranslate" title="Retranslate as ${escapeHtml(d.pos)}">↻</button>
               </li>`
             ).join("")}
           </ul>
         </div>`
      : "";

    // GaelSpell alternatives (if Irish translation has a better spelling)
    const spellAltsHtml = (result.spellSuggestions && result.spellSuggestions.length > 0)
      ? `<div class="cf-spell-alts">Also: ${result.spellSuggestions
           .map(s => `<span class="cf-spell-alts-word" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`)
           .join(" · ")}</div>`
      : "";

    // Check if there's enough content to warrant an expandable section:
    // Show expandable for: multiple genuinely different meanings (3+) OR a phrase that needs word breakdown
    const hasManyMeanings = definitionsWithExamples.length >= 3;
    const isPhrase = result.sourceText.includes(" ");
    const hasExpandable = hasManyMeanings || isPhrase;

    // Separate content: some always visible, some in expandable
    const defaultContent = `
      ${phoneticHtml}
      ${metaHtml}
      ${contextHtml}
      ${spellAltsHtml}
      ${sameWordHtml}
      ${truncatedNote}
    `;

    const expandableInnerHtml = `
      ${hasManyMeanings ? meaningsHtml : ""}
      ${isPhrase ? wordChipsHtml : ""}
      ${!hasManyMeanings ? meaningsHtml : ""}
      <div class="cf-similar-words-placeholder" data-parent="expandable-inner"></div>
    `.trim();

    const expandableHtml = hasExpandable
      ? `<div class="cf-expandable">
           <div class="cf-expandable-header">
             <span class="cf-expandable-title">${hasManyMeanings && isPhrase ? "More options" : hasManyMeanings ? "All meanings" : "Words in phrase"}</span>
             <div class="cf-expandable-toggle">▼</div>
           </div>
           <div class="cf-expandable-content">
             <div class="cf-expandable-inner">
               ${expandableInnerHtml}
             </div>
           </div>
         </div>`
      : `<div>${meaningsHtml}</div>`;

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Celticly</span>
        <button class="cf-close" title="Close">&#215;</button>
      </div>
      <div class="cf-body">
        <div class="cf-source">${sourceEscaped}</div>
        <div class="cf-irish-row">
          <div class="cf-irish">${irishEscaped}</div>
          ${speakHtml}
        </div>
        <div class="cf-info-section">
          ${defaultContent}
        </div>
        ${expandableHtml}
      </div>
      <div class="cf-actions">
        <div class="cf-actions-left">${saveAreaHtml}</div>
        <div class="cf-actions-right">${blacklistButtonHtml}</div>
      </div>
      ${cachedNote}`;

    // Apply wide mode if there are multiple meanings (3+ definitions make it wider for better layout)
    if (definitionsWithExamples.length >= 3) {
      this.popupEl.classList.add("cf-wide");
    } else {
      this.popupEl.classList.remove("cf-wide");
    }

    // Close
    this.popupEl.querySelector(".cf-close")?.addEventListener("click", () => callbacks.onClose());

    // Toggle expandable section
    const expandableEl = this.popupEl.querySelector<HTMLElement>(".cf-expandable");
    const expandableHeader = expandableEl?.querySelector<HTMLElement>(".cf-expandable-header");
    expandableHeader?.addEventListener("click", () => {
      expandableEl?.classList.toggle("cf-expanded");
    });

    // Save (single words only)
    if (isWord) {
      const saveBtn = this.popupEl.querySelector<HTMLButtonElement>(".cf-save-btn");
      saveBtn?.addEventListener("click", async () => {
        if (!saveBtn) return;
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<div class="cf-spinner" style="width:11px;height:11px;border-width:2px;"></div> Saving...`;
        try {
          await callbacks.onSave(result.sourceText, result.irishText);
          if (this.popupEl) {
            const actionsEl = this.popupEl.querySelector(".cf-actions");
            if (actionsEl) actionsEl.innerHTML = `<span class="cf-saved-ok">&#x2713; Saved to Word Bank!</span>`;
          }
        } catch (err) {
          // Show an error message to the user and restore the save button state
          const message = err instanceof Error ? err.message : String(err ?? "Failed to save word");
          this.showError(message, callbacks);
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<span>+</span> Save to Word Bank`;
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

    // Spell-alternative clicks (GaelSpell corrections)
    this.popupEl.querySelectorAll<HTMLElement>(".cf-spell-alts-word").forEach((span) => {
      span.addEventListener("click", () => {
        const word = span.dataset.word ?? "";
        if (word) callbacks.onTranslateWord(word);
      });
    });

    // Retranslate with specific meaning/POS (from meanings list)
    this.popupEl.querySelectorAll<HTMLElement>(".cf-meanings-retranslate").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".cf-meanings-item") as HTMLElement | null;
        const pos = item?.dataset.pos ?? "";
        if (pos && callbacks.onRetranslateWithMeaning) {
          callbacks.onRetranslateWithMeaning(result.sourceText, pos);
        }
      });
    });

    // Speak button (single words)
    if (isWord) {
      const speakBtn = this.popupEl.querySelector<HTMLButtonElement>(".cf-speak-btn");
      speakBtn?.addEventListener("click", async () => {
        if (!speakBtn) return;
        const origContent = speakBtn.innerHTML;
        speakBtn.disabled = true;
        speakBtn.innerHTML = `<div class="cf-spinner" style="width:12px;height:12px;border-width:1.5px;"></div>`;
        try {
          await callbacks.onSpeak(result.irishText);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err ?? "Failed to play pronunciation");
          this.showError(message, callbacks);
        } finally {
          speakBtn.disabled = false;
          speakBtn.innerHTML = origContent;
        }
      });
    }

    // Fetch and render similar words (single words only)
    if (isWord && result.similarWords && result.similarWords.length > 0) {
      const placeholder = this.popupEl.querySelector<HTMLElement>(
        ".cf-similar-words-placeholder"
      );
      if (placeholder) {
        const similarWordsHtml = `
          <div class="cf-similar-words-section">
            <div class="cf-similar-words-title">Similar words</div>
            <div class="cf-similar-words-list">
              ${result.similarWords
                .map(
                  (sw) => `
                <div class="cf-similar-word-item">
                  <span class="cf-similar-word-text">${escapeHtml(sw.word)}</span>
                  <span class="cf-similar-word-irish">${escapeHtml(sw.irish)}</span>
                  <button class="cf-similar-word-btn" data-word="${escapeHtml(sw.word)}" title="Translate">→</button>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
        placeholder.innerHTML = similarWordsHtml;

        // Wire up similar word translate buttons
        placeholder.querySelectorAll<HTMLButtonElement>(".cf-similar-word-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const word = btn.dataset.word ?? "";
            if (word) callbacks.onTranslateWord(word);
          });
        });
      }
    }

    // Blacklist button handler
    if (isWord) {
      const blacklistBtn = this.popupEl.querySelector<HTMLButtonElement>(".cf-blacklist-btn");
      if (blacklistBtn) {
        blacklistBtn.addEventListener("click", async () => {
          if (blacklistBtn.disabled) return;

          // Disable button and add visual feedback
          blacklistBtn.disabled = true;
          blacklistBtn.classList.add("cf-blacklisted");

          try {
            // Submit blacklist request
            await callbacks.onBlacklistTranslation(result.sourceText, result.irishText);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err ?? "Failed to report translation");
            this.showError(message, callbacks);
            // Re-enable button on failure
            blacklistBtn.disabled = false;
            blacklistBtn.classList.remove("cf-blacklisted");
          }
        });
      }
    }
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
    this.popupEl.classList.remove("cf-wide");

    const isNoKey =
      message.toLowerCase().includes("no api key") || message.includes("NO_API_KEY");
    const displayMsg = isNoKey
      ? "No API key set. Open <strong>Extension Options</strong> to add your Google Cloud Translation API key."
      : escapeHtml(message);

    this.popupEl.innerHTML = `
      <div class="cf-header">
        <span class="cf-brand">Celticly</span>
        <button class="cf-close" title="Close">&#215;</button>
      </div>
      <div class="cf-body">
        <div class="cf-error">&#x26A0; ${displayMsg}</div>
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

