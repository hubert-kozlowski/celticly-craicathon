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

// Tags whose text content is never candidate material
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "CODE", "PRE",
  "INPUT", "TEXTAREA", "SELECT", "BUTTON", "LABEL", "OPTION",
  "HEAD", "META", "LINK",
]);

// ── Public API ─────────────────────────────────────────────────────────────────

/** Start a test session, replacing `wordCount` random keywords with Irish. */
export async function startTestMode(
  wordCount: number,
  sendMessage: SendMessageFn
): Promise<void> {
  // Clean up any prior test first
  stopTestMode();

  const candidates = collectCandidateWords(wordCount);
  if (candidates.length === 0) return;

  // Translate all candidates in parallel (cache hits are instant)
  const results = await Promise.all(
    candidates.map(async (word): Promise<[string, string] | null> => {
      try {
        const resp = await sendMessage({ type: "TRANSLATE", text: word });
        if (resp.ok && "result" in resp) {
          const irish = resp.result.irishText.trim();
          // Skip words where translation equals original (no useful quiz item)
          if (irish.toLowerCase() !== word.toLowerCase() && irish.length > 0) {
            return [word, irish];
          }
        }
      } catch {
        // ignore individual translation failures
      }
      return null;
    })
  );

  const wordMap = new Map<string, string>(
    results.filter((t): t is [string, string] => t !== null)
  );

  if (wordMap.size === 0) return;

  replaceWordsInDom(wordMap);
  totalCount = wordMap.size;
  correctCount = 0;
  injectProgressBar();
}

/** Stop the test, reverting all DOM mutations. */
export function stopTestMode(): void {
  revertAllSpans();
  removeProgressBar();
  removeActiveInput();
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
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-celticly-test]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
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

function replaceWordsInDom(wordMap: Map<string, string>): void {
  const escaped = Array.from(wordMap.keys()).map(escapeRegex);
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  // Collect matching text nodes before mutating (avoid live-list issues)
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-celticly-test]")) return NodeFilter.FILTER_REJECT;
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

      const irishText = wordMap.get(word.toLowerCase()) ?? word;
      const span = document.createElement("span");
      span.dataset.celticlyTest = "word";
      span.dataset.original = word;
      span.dataset.irish = irishText;
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
  const left = Math.min(rect.left, window.innerWidth - 210);

  wrap.style.cssText = [
    "position:fixed",
    `top:${top}px`,
    `left:${left}px`,
    "z-index:2147483647",
    "background:#fff",
    "border:1.5px solid #16A34A",
    "border-radius:8px",
    "padding:5px 10px",
    "box-shadow:0 4px 16px rgba(0,0,0,0.15)",
    "display:flex",
    "align-items:center",
    "gap:6px",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  ].join(";");

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
    "border:none;outline:none;font-size:13px;width:130px;" +
    "background:transparent;color:#1C1C1E;font-family:inherit;";

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

  wrap.addEventListener("mouseleave", onWrapLeave);
  wrap.appendChild(flag);
  wrap.appendChild(input);
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
  stopBtn.addEventListener("click", stopTestMode);

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
  const label = document.getElementById("cf-test-bar-label");
  if (label) {
    label.textContent = `🎉 Tá tú foirfe! ${totalCount} / ${totalCount}`;
    label.style.color = "#34D399";
  }
}

// ── Revert all mutations ───────────────────────────────────────────────────────

function revertAllSpans(): void {
  // Query for all test spans (including partially-answered ones still in DOM)
  document.querySelectorAll<HTMLElement>("[data-celticly-test]").forEach((span) => {
    const original = span.dataset.original ?? span.textContent ?? "";
    span.parentNode?.replaceChild(document.createTextNode(original), span);
  });
}
