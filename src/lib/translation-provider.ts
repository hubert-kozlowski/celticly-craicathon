// ─── Translation provider abstraction ────────────────────────────────────────
// Currently implemented: Google Cloud Translation API v2 + Gemini for examples.
// To swap providers: implement the TranslationProvider interface and update
// createProvider() below.

import type { TranslationResult } from "./types";

export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
  translateRaw(text: string, targetLang: string): Promise<string>;
  generateExample(
    word: string,
    irishWord: string
  ): Promise<{ english: string; irish: string } | null>;
}

// ── Google Cloud Translation ──────────────────────────────────────────────────
// Docs: https://cloud.google.com/translate/docs/reference/rest/v2/translate
// Free tier: 500,000 chars/month. Irish (ga) is a supported language.

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";

// ── Google Gemini ─────────────────────────────────────────────────────────────
// Used for generating context-aware example sentences.
// Requires the "Generative Language API" to be enabled on the same project.
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export class GoogleTranslationProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  /** Core translate call – returns a full TranslationResult. */
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    const translated = await this.translateRaw(text, targetLang);
    return {
      sourceText: text,
      irishText: translated,
      isWord: !text.includes(" "),
      provider: "google",
      fromCache: false,
    };
  }

  /** Translate arbitrary text and return only the translated string. */
  async translateRaw(text: string, targetLang: string): Promise<string> {
    const url = `${GOOGLE_TRANSLATE_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target: targetLang, format: "text" }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
      const err = new Error("Rate limit exceeded");
      (err as NodeJS.ErrnoException).code = "RATE_LIMIT";
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err = new Error(
        `Google Cloud Translation returned HTTP ${response.status}: ${body}`
      );
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    const data = (await response.json()) as {
      data: { translations: Array<{ translatedText: string }> };
    };

    const translated = data?.data?.translations?.[0]?.translatedText;
    if (!translated) {
      const err = new Error("Unexpected response shape from translation provider");
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    return translated;
  }

  /**
   * Ask Gemini to produce one short daily-life example sentence for the word,
   * plus its Irish translation. Returns null on any failure so callers can
   * degrade gracefully.
   */
  async generateExample(
    word: string,
    irishWord: string
  ): Promise<{ english: string; irish: string } | null> {
    try {
      const prompt =
        `Create one short, natural sentence (6–10 words) a person could say ` +
        `in daily life that includes the word "${word}". ` +
        `Then provide its Irish (Gaeilge) translation. ` +
        `The Irish translation must correctly reflect grammar, word order, and ` +
        `any required mutations (lenition/eclipsis) for that context. ` +
        `Reply with EXACTLY these two lines and nothing else:\n` +
        `EN: [English sentence]\n` +
        `GA: [Irish translation]`;

      const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const enMatch = raw.match(/EN:\s*(.+)/i);
      const gaMatch = raw.match(/GA:\s*(.+)/i);
      if (!enMatch || !gaMatch) return null;

      return { english: enMatch[1].trim(), irish: gaMatch[1].trim() };
    } catch {
      return null;
    }
  }
}

export function createProvider(apiKey: string): TranslationProvider {
  return new GoogleTranslationProvider(apiKey);
}
