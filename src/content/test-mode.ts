// ─── Test Mode ────────────────────────────────────────────────────────────────
// Replaces keyword DOM text with Irish translations and quizzes the user on
// hover. A fixed progress bar tracks progress. Stop reverts all mutations.

import type { ExtensionRequest, ExtensionResponse } from "../lib/messages";

type SendMessageFn = (request: ExtensionRequest) => Promise<ExtensionResponse>;

// ── Module state ──────────────────────────────────────────────────────────────
let correctCount = 0;
let totalCount = 0;
let progressBar: HTMLElement | null = null;
let activeInput: HTMLElement | null = null;
let messageFn: SendMessageFn | null = null;

// Tags whose text content is never candidate material
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "CODE", "PRE",
  "INPUT", "TEXTAREA", "SELECT", "BUTTON", "LABEL", "OPTION",
  "HEAD", "META", "LINK", "NAV", "FOOTER",
]);

// Ancestor selectors that make text inaccessible for hovering/interaction
const SKIP_ANCESTOR_SELECTOR =
  'a, button, [role="button"], [onclick], [contenteditable="true"], summary';

/** Check whether a text node lives in a visible, non-interactive context. */
function isNodeEligible(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.closest("[data-celticly-test]")) return false;
  // Reject text inside interactive elements (links, buttons, etc.)
  if (parent.closest(SKIP_ANCESTOR_SELECTOR)) return false;
  // Reject hidden or zero-size elements
  const el = parent;
  if (el.offsetParent === null && el.tagName !== "BODY" && el.tagName !== "HTML") {
    // offsetParent is null for hidden elements (display:none or not in DOM)
    const style = getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  // Reject elements scrolled out of the document entirely (e.g. overflow:hidden crops)
  if (rect.bottom < 0 || rect.top > document.documentElement.clientHeight * 2) return false;
  return true;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Start a test session, replacing `wordCount` random keywords with Irish. */
export async function startTestMode(
  wordCount: number,
  sendMessage: SendMessageFn
): Promise<void> {
  // Clean up any prior test first
  cleanupTestMode();
  messageFn = sendMessage;

  const candidates = collectCandidateWords(wordCount);
  if (candidates.length === 0) return;

  // Translate all candidates in parallel (cache hits are instant)
  const results = await Promise.all(
    candidates.map(async (word): Promise<[string, string, string] | null> => {
      try {
        const resp = await sendMessage({ type: "TRANSLATE", text: word });
        if (resp.ok && "result" in resp) {
          const irish = resp.result.irishText.trim();
          // Skip words where translation equals original (no useful quiz item)
          if (irish.toLowerCase() !== word.toLowerCase() && irish.length > 0) {
            const pronunciation = resp.result.pronunciation ?? "";
            return [word, irish, pronunciation];
          }
        }
      } catch {
        // ignore individual translation failures
      }
      return null;
    })
  );

  const wordMap = new Map<string, { irish: string; pronunciation: string }>(
    results
      .filter((t): t is [string, string, string] => t !== null)
      .map(([word, irish, pronunciation]) => [word, { irish, pronunciation }])
  );

  if (wordMap.size === 0) return;

  replaceWordsInDom(wordMap);
  totalCount = wordMap.size;
  correctCount = 0;
  injectProgressBar();
}

/** Stop the test, reverting all DOM mutations. If userQuit is true, show summary first. */
export function stopTestMode(userQuit = false): void {
  if (userQuit && totalCount > 0) {
    const missed = collectMissedWords();
    showResultsOverlay(false, correctCount, totalCount, missed);
  }
  cleanupTestMode();
}

/** Internal cleanup — revert DOM, remove UI, reset state. */
function cleanupTestMode(): void {
  revertAllSpans();
  removeProgressBar();
  removeActiveInput();
  removeResultsOverlay();
  correctCount = 0;
  totalCount = 0;
}

// ── Candidate word collection ──────────────────────────────────────────────────

function collectCandidateWords(max: number): string[] {
  // Gather 4× what we need so shuffling gives good variety
  const gatherLimit = max * 4;
  const seen = new Map<string, string>(); // lowercase → original casing

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return isNodeEligible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    const matches = text.match(/\b[a-zA-Z]{4,}\b/g);
    if (matches) {
      for (const m of matches) {
        const key = m.toLowerCase();
        if (!seen.has(key)) seen.set(key, m);
      }
    }
    if (seen.size >= gatherLimit) break;
  }

  const words = Array.from(seen.values());
  shuffleArray(words);
  return words.slice(0, max);
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── DOM replacement ────────────────────────────────────────────────────────────

function replaceWordsInDom(wordMap: Map<string, { irish: string; pronunciation: string }>): void {
  const escaped = Array.from(wordMap.keys()).map(escapeRegex);
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  // Collect matching text nodes before mutating (avoid live-list issues)
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!isNodeEligible(node)) return NodeFilter.FILTER_REJECT;
        pattern.lastIndex = 0;
        return pattern.test(node.textContent ?? "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    }
  );

  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const word = match[0];
      const start = match.index;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const entry = wordMap.get(word.toLowerCase());
      const irishText = entry?.irish ?? word;
      const pronunciation = entry?.pronunciation ?? "";
      const span = document.createElement("span");
      span.dataset.celticlyTest = "word";
      span.dataset.original = word;
      span.dataset.irish = irishText;
      span.dataset.pronunciation = pronunciation;
      span.dataset.answered = "false";
      span.textContent = irishText;
      applySpanUnansweredStyle(span);

      span.addEventListener("mouseenter", () => onSpanHover(span));
      span.addEventListener("mouseleave", (e) => onSpanLeave(e));

      frag.appendChild(span);
      lastIndex = start + word.length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

function applySpanUnansweredStyle(span: HTMLElement): void {
  span.style.cssText =
    "background:rgba(22,163,74,0.12);" +
    "border-bottom:2px dashed #16A34A;" +
    "border-radius:3px;" +
    "padding:0 2px;" +
    "cursor:help;" +
    "transition:background 0.2s;";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Hover quiz input ───────────────────────────────────────────────────────────

function onSpanHover(span: HTMLElement): void {
  if (span.dataset.answered === "true") return;
  removeActiveInput();

  const rect = span.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.id = "cf-test-input-wrap";

  // Fixed positioning uses viewport coords — getBoundingClientRect is already viewport-relative
  const top = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 260);

  wrap.style.cssText = [
    "position:fixed",
    `top:${top}px`,
    `left:${left}px`,
    "z-index:2147483647",
    "background:#fff",
    "border:1.5px solid #16A34A",
    "border-radius:8px",
    "padding:8px 10px",
    "box-shadow:0 4px 16px rgba(0,0,0,0.15)",
    "display:flex",
    "flex-direction:column",
    "gap:6px",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "max-width:260px",
  ].join(";");

  // ── Phonetic pronunciation ──
  const pronunciation = span.dataset.pronunciation ?? "";
  if (pronunciation) {
    const phoneticRow = document.createElement("div");
    phoneticRow.style.cssText =
      "font-size:12px;color:#6B7280;font-style:italic;padding:0 2px;" +
      "display:flex;align-items:center;gap:4px;";
    phoneticRow.textContent = `🔤 ${pronunciation}`;
    wrap.appendChild(phoneticRow);
  }

  // ── Input row ──
  const inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex;align-items:center;gap:6px;";

  const flag = document.createElement("span");
  flag.textContent = "🇮🇪";
  flag.style.cssText = "font-size:13px;user-select:none;flex-shrink:0;";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "English…";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  input.style.cssText =
    "border:none;outline:none;font-size:13px;width:120px;" +
    "background:transparent;color:#1C1C1E;font-family:inherit;";

  // ── Hint button ──
  const hintBtn = document.createElement("button");
  hintBtn.textContent = "💡";
  hintBtn.title = "Get a hint";
  hintBtn.style.cssText =
    "background:rgba(22,163,74,0.10);border:1px solid rgba(22,163,74,0.3);" +
    "border-radius:5px;padding:2px 6px;font-size:13px;cursor:pointer;" +
    "transition:background 0.15s;flex-shrink:0;";
  hintBtn.addEventListener("mouseenter", () => {
    hintBtn.style.background = "rgba(22,163,74,0.22)";
  });
  hintBtn.addEventListener("mouseleave", () => {
    hintBtn.style.background = "rgba(22,163,74,0.10)";
  });

  // ── Hint area (hidden initially) ──
  const hintArea = document.createElement("div");
  hintArea.style.cssText = "display:none;font-size:12px;color:#4B5563;padding:2px 2px 0;";

  let hintRequested = false;
  hintBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (hintRequested) return;
    hintRequested = true;
    hintBtn.textContent = "⏳";
    hintBtn.style.cursor = "default";

    const original = span.dataset.original ?? "";
    const irishText = span.dataset.irish ?? "";

    if (messageFn) {
      try {
        const resp = await messageFn({
          type: "GET_HINT",
          sourceText: original,
          irishText,
        });
        if (resp.ok && "hints" in resp) {
          const lines: string[] = [];
          if (resp.hints.length > 0) {
            lines.push("Similar words: " + resp.hints.join(", "));
          }
          if (resp.phonetic && !pronunciation) {
            lines.push(`🔤 ${resp.phonetic}`);
          }
          hintArea.textContent = lines.length > 0 ? lines.join(" · ") : "No hints available";
        } else {
          hintArea.textContent = "Could not load hints";
        }
      } catch {
        hintArea.textContent = "Could not load hints";
      }
    } else {
      hintArea.textContent = "Hints unavailable";
    }

    hintBtn.textContent = "💡";
    hintBtn.style.cursor = "default";
    hintBtn.style.opacity = "0.5";
    hintArea.style.display = "block";
  });

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      checkAnswer(span, input.value);
    }
    if (e.key === "Escape") {
      removeActiveInput();
    }
  });

  inputRow.appendChild(flag);
  inputRow.appendChild(input);
  inputRow.appendChild(hintBtn);

  wrap.addEventListener("mouseleave", onWrapLeave);
  wrap.appendChild(inputRow);
  wrap.appendChild(hintArea);
  document.body.appendChild(wrap);
  activeInput = wrap;

  // Short delay so the hover event doesn't trigger blur immediately
  setTimeout(() => input.focus(), 10);
}

function onSpanLeave(e: MouseEvent): void {
  const rel = e.relatedTarget as Node | null;
  if (activeInput?.contains(rel)) return;
  scheduleInputRemoval();
}

function onWrapLeave(e: MouseEvent): void {
  const rel = e.relatedTarget as Node | null;
  if (rel instanceof Element && rel.getAttribute("data-celticly-test") === "word") return;
  scheduleInputRemoval();
}

function scheduleInputRemoval(): void {
  setTimeout(() => {
    const inputEl = activeInput?.querySelector("input");
    if (document.activeElement !== inputEl) removeActiveInput();
  }, 150);
}

function removeActiveInput(): void {
  activeInput?.remove();
  activeInput = null;
}

// ── Answer checking ────────────────────────────────────────────────────────────

function checkAnswer(span: HTMLElement, answer: string): void {
  const original = span.dataset.original ?? "";

  if (answer.trim().toLowerCase() === original.toLowerCase()) {
    // Correct — revert all occurrences of this word on the page
    const selector = `[data-celticly-test="word"][data-original="${CSS.escape(original)}"]`;
    document.querySelectorAll<HTMLElement>(selector).forEach((s) => {
      s.dataset.answered = "true";
      s.textContent = original;
      // Flash green, then fade out entirely
      s.style.cssText =
        "background:rgba(22,163,74,0.28);border-bottom:2px solid #16A34A;" +
        "border-radius:3px;padding:0 2px;transition:background 0.6s,border-color 0.6s;";
      setTimeout(() => {
        s.style.background = "transparent";
        s.style.borderBottomColor = "transparent";
      }, 800);
      setTimeout(() => {
        s.style.cssText = "";
        s.removeAttribute("data-celticly-test");
      }, 1500);
    });

    correctCount++;
    removeActiveInput();
    updateProgressBar();
    if (correctCount >= totalCount) onTestComplete();
  } else {
    // Wrong — flash red border and clear
    if (activeInput) {
      const wrap = activeInput;
      const inputEl = wrap.querySelector("input") as HTMLInputElement | null;
      wrap.style.borderColor = "#DC2626";
      if (inputEl) inputEl.style.color = "#DC2626";
      setTimeout(() => {
        if (activeInput === wrap) {
          wrap.style.borderColor = "#16A34A";
          if (inputEl) {
            inputEl.style.color = "#1C1C1E";
            inputEl.value = "";
            inputEl.focus();
          }
        }
      }, 600);
    }
  }
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function injectProgressBar(): void {
  const bar = document.createElement("div");
  bar.id = "cf-test-bar";
  bar.style.cssText = [
    "position:fixed",
    "bottom:20px",
    "right:20px",
    "z-index:2147483647",
    "background:#1C1C2E",
    "color:#F2F2F7",
    "border-radius:12px",
    "padding:10px 16px",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "font-size:14px",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "box-shadow:0 4px 24px rgba(0,0,0,0.35)",
    "border:1px solid rgba(255,255,255,0.10)",
    "user-select:none",
  ].join(";");

  const label = document.createElement("span");
  label.id = "cf-test-bar-label";
  label.textContent = `🍀 Test: 0 / ${totalCount}`;

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";
  stopBtn.style.cssText =
    "background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.18);" +
    "color:#F2F2F7;border-radius:6px;padding:3px 10px;font-size:12px;" +
    "cursor:pointer;font-family:inherit;transition:background 0.15s;";
  stopBtn.addEventListener("mouseenter", () => {
    stopBtn.style.background = "rgba(255,255,255,0.22)";
  });
  stopBtn.addEventListener("mouseleave", () => {
    stopBtn.style.background = "rgba(255,255,255,0.10)";
  });
  stopBtn.addEventListener("click", () => stopTestMode(true));

  bar.appendChild(label);
  bar.appendChild(stopBtn);
  document.body.appendChild(bar);
  progressBar = bar;
}

function updateProgressBar(): void {
  const label = document.getElementById("cf-test-bar-label");
  if (label) label.textContent = `🍀 Test: ${correctCount} / ${totalCount}`;
}

function removeProgressBar(): void {
  progressBar?.remove();
  progressBar = null;
}

function onTestComplete(): void {
  removeActiveInput();
  const missed = collectMissedWords();
  showResultsOverlay(true, correctCount, totalCount, missed);
}

// ── Results overlay ────────────────────────────────────────────────────────────

let resultsOverlay: HTMLElement | null = null;

/** Gather unanswered words still on the page. */
function collectMissedWords(): Array<{ english: string; irish: string }> {
  const seen = new Set<string>();
  const missed: Array<{ english: string; irish: string }> = [];
  document.querySelectorAll<HTMLElement>('[data-celticly-test="word"]').forEach((s) => {
    if (s.dataset.answered !== "true") {
      const key = (s.dataset.original ?? "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        missed.push({
          english: s.dataset.original ?? "",
          irish: s.dataset.irish ?? "",
        });
      }
    }
  });
  return missed;
}

/** Show a centered overlay with test results. */
function showResultsOverlay(
  completed: boolean,
  correct: number,
  total: number,
  missed: Array<{ english: string; irish: string }>
): void {
  removeResultsOverlay();

  const backdrop = document.createElement("div");
  backdrop.id = "cf-results-overlay";
  backdrop.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:rgba(0,0,0,0.55)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "background:#fff",
    "border-radius:16px",
    "padding:32px 36px",
    "max-width:420px",
    "width:90vw",
    "max-height:80vh",
    "overflow-y:auto",
    "box-shadow:0 12px 48px rgba(0,0,0,0.3)",
    "text-align:center",
    "color:#1C1C2E",
  ].join(";");

  // ── Emoji + Title ──
  const emoji = document.createElement("div");
  emoji.style.cssText = "font-size:48px;margin-bottom:8px;";
  emoji.textContent = completed ? "🎉" : "🍀";

  const title = document.createElement("div");
  title.style.cssText = "font-size:22px;font-weight:700;margin-bottom:4px;";
  title.textContent = completed ? "Tá tú foirfe!" : "Test Ended";

  const subtitle = document.createElement("div");
  subtitle.style.cssText = "font-size:14px;color:#6B7280;margin-bottom:20px;";
  subtitle.textContent = completed
    ? "You got every word right — go n-éirí leat!"
    : "You quit early — here's how you did.";

  card.appendChild(emoji);
  card.appendChild(title);
  card.appendChild(subtitle);

  // ── Score ──
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreWrap = document.createElement("div");
  scoreWrap.style.cssText = [
    "display:flex",
    "justify-content:center",
    "gap:24px",
    "margin-bottom:20px",
  ].join(";");

  const makeStatBox = (value: string, label: string, color: string) => {
    const box = document.createElement("div");
    box.style.cssText = `background:${color};border-radius:10px;padding:12px 18px;min-width:80px;`;
    const val = document.createElement("div");
    val.style.cssText = "font-size:28px;font-weight:800;color:#1C1C2E;";
    val.textContent = value;
    const lbl = document.createElement("div");
    lbl.style.cssText = "font-size:11px;color:#4B5563;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;";
    lbl.textContent = label;
    box.appendChild(val);
    box.appendChild(lbl);
    return box;
  };

  scoreWrap.appendChild(makeStatBox(`${correct}/${total}`, "Score", "rgba(22,163,74,0.10)"));
  scoreWrap.appendChild(makeStatBox(`${pct}%`, "Accuracy", "rgba(59,130,246,0.10)"));
  card.appendChild(scoreWrap);

  // ── Missed words table ──
  if (missed.length > 0) {
    const missedTitle = document.createElement("div");
    missedTitle.style.cssText =
      "font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;" +
      "letter-spacing:0.5px;margin-bottom:8px;text-align:left;";
    missedTitle.textContent = `Words to review (${missed.length})`;
    card.appendChild(missedTitle);

    const table = document.createElement("div");
    table.style.cssText =
      "background:#F9FAFB;border-radius:8px;padding:8px 12px;text-align:left;" +
      "max-height:180px;overflow-y:auto;margin-bottom:20px;";

    for (const { english, irish } of missed) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;justify-content:space-between;padding:5px 0;" +
        "border-bottom:1px solid rgba(0,0,0,0.06);font-size:13px;";

      const eng = document.createElement("span");
      eng.style.cssText = "color:#1C1C2E;font-weight:500;";
      eng.textContent = english;

      const irl = document.createElement("span");
      irl.style.cssText = "color:#16A34A;font-style:italic;";
      irl.textContent = irish;

      row.appendChild(eng);
      row.appendChild(irl);
      table.appendChild(row);
    }
    // Remove last border
    const lastRow = table.lastElementChild as HTMLElement | null;
    if (lastRow) lastRow.style.borderBottom = "none";

    card.appendChild(table);
  }

  // ── Close button ──
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = [
    "background:#16A34A",
    "color:#fff",
    "border:none",
    "border-radius:8px",
    "padding:10px 32px",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "font-family:inherit",
    "transition:background 0.15s",
  ].join(";");
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "#15803D";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "#16A34A";
  });
  closeBtn.addEventListener("click", () => {
    cleanupTestMode();
  });

  card.appendChild(closeBtn);
  backdrop.appendChild(card);

  // Close on backdrop click
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cleanupTestMode();
  });

  document.body.appendChild(backdrop);
  resultsOverlay = backdrop;
}

function removeResultsOverlay(): void {
  resultsOverlay?.remove();
  resultsOverlay = null;
}

// ── Revert all mutations ───────────────────────────────────────────────────────

function revertAllSpans(): void {
  // Query for all test spans (including partially-answered ones still in DOM)
  document.querySelectorAll<HTMLElement>("[data-celticly-test]").forEach((span) => {
    const original = span.dataset.original ?? span.textContent ?? "";
    span.parentNode?.replaceChild(document.createTextNode(original), span);
  });
}
