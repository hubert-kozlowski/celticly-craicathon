// ─── Translation provider abstraction ────────────────────────────────────────
// Currently implemented: Google Cloud Translation API v2 + Gemini for examples.
// To swap providers: implement the TranslationProvider interface and update
// createProvider() below.

import type { TranslationResult } from "./types";

export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
  translateRaw(text: string, targetLang: string): Promise<string>;
  generateWordInsights(
    word: string,
    irishWord: string
  ): Promise<{ english: string; irish: string; pronunciation: string; wordType: string } | null>;
  generateHints(
    sourceWord: string,
    irishWord: string
  ): Promise<{ hints: string[]; phonetic: string } | null>;
  synthesizeSpeech(text: string, langCode: string): Promise<string>;
}

// ── Google Cloud Translation ──────────────────────────────────────────────────
// Docs: https://cloud.google.com/translate/docs/reference/rest/v2/translate
// Free tier: 500,000 chars/month. Irish (ga) is a supported language.

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";
// ── Abair.ie Text-to-Speech ─────────────────────────────────────────────────
// API at api.abair.ie — Irish-language TTS built at Trinity College Dublin.
// No API key required. Supports Connacht, Munster, and Ulster dialects.
const ABAIR_TTS_ENDPOINT = "https://api.abair.ie/v3/synthesis";
// Default voice: Sibéal — Connemara (Connacht Irish), female, PIPER model.
const ABAIR_DEFAULT_VOICE = "ga_CO_snc_piper";
// ── Google Gemini ─────────────────────────────────────────────────────────────
// Used for generating context-aware example sentences.
// Requires the "Generative Language API" to be enabled on the same project.
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export class GoogleTranslationProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string
  ) {}

  /** Core translate call – returns a full TranslationResult. */
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    const translated = await this.translateRaw(text, targetLang);
    return {
      sourceText: text,
      irishText: translated,
      sameInBothLanguages: translated.toLowerCase().trim() === text.toLowerCase().trim(),
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
   * Call Gemini to produce: a phonetic pronunciation guide, grammatical type,
   * and one daily-life example sentence (English + Irish). Returns null on any
   * failure so callers can degrade gracefully.
   */
  async generateWordInsights(
    word: string,
    irishWord: string
  ): Promise<{ english: string; irish: string; pronunciation: string; wordType: string } | null> {
    try {
      const prompt =
        `For the Irish word "${irishWord}" (from English "${word}"), reply with EXACTLY these 4 lines and nothing else:\n` +
        `PHONETIC: readable pronunciation for an English speaker (e.g. "GAH-luh")\n` +
        `TYPE: grammatical type (e.g. "masculine noun", "feminine noun", "verb", "adjective")\n` +
        `EXAMPLE_EN: one short natural sentence (6-10 words) using the English word "${word}"\n` +
        `EXAMPLE_GA: Irish (Gaeilge) translation of that sentence, with correct mutations`;

      const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.5 },
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const phoneticMatch = raw.match(/PHONETIC:\s*(.+)/i);
      const typeMatch     = raw.match(/TYPE:\s*(.+)/i);
      const enMatch       = raw.match(/EXAMPLE_EN:\s*(.+)/i);
      const gaMatch       = raw.match(/EXAMPLE_GA:\s*(.+)/i);
      if (!enMatch || !gaMatch) return null;

      return {
        english:       enMatch[1].trim(),
        irish:         gaMatch[1].trim(),
        pronunciation: phoneticMatch ? phoneticMatch[1].trim() : "",
        wordType:      typeMatch     ? typeMatch[1].trim()     : "",
      };
    } catch {
      return null;
    }
  }

  /**
   * Call Gemini to produce hint words (similar/related English words) and a
   * phonetic pronunciation guide for the Irish word. Returns null on failure.
   */
  async generateHints(
    sourceWord: string,
    irishWord: string
  ): Promise<{ hints: string[]; phonetic: string } | null> {
    try {
      const prompt =
        `For the English word "${sourceWord}" (Irish: "${irishWord}"), reply with EXACTLY these lines and nothing else:\n` +
        `PHONETIC: readable pronunciation of the Irish word for an English speaker (e.g. "GAH-luh")\n` +
        `HINT1: a single English synonym or closely related word (NOT the answer "${sourceWord}")\n` +
        `HINT2: another single English synonym or related word (NOT the answer "${sourceWord}")\n` +
        `HINT3: a third single English synonym or related word (NOT the answer "${sourceWord}")`;

      const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const phoneticMatch = raw.match(/PHONETIC:\s*(.+)/i);
      const hint1 = raw.match(/HINT1:\s*(.+)/i);
      const hint2 = raw.match(/HINT2:\s*(.+)/i);
      const hint3 = raw.match(/HINT3:\s*(.+)/i);

      const hints = [hint1, hint2, hint3]
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => m[1].trim())
        .filter((h) => h.toLowerCase() !== sourceWord.toLowerCase());

      return {
        hints,
        phonetic: phoneticMatch ? phoneticMatch[1].trim() : "",
      };
    } catch {
      return null;
    }
  }

  /**
   * Call abair.ie TTS API and return base64-encoded WAV audio.
   * No API key required. Uses the PIPER neural voice for natural Irish speech.
   */
  async synthesizeSpeech(text: string, _langCode: string): Promise<string> {
    const resp = await fetch(ABAIR_TTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        synthinput: { text, ssml: "string" },
        voiceparams: {
          languageCode: "ga-IE",
          name: ABAIR_DEFAULT_VOICE,
          ssmlGender: "UNSPECIFIED",
        },
        audioconfig: {
          audioEncoding: "LINEAR16",
          speakingRate: 1,
          volumeGainDb: 1,
          htsParams: "string",
          sampleRateHertz: 0,
          effectsProfileId: [],
        },
        outputType: "JSON",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Abair.ie TTS returned HTTP ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as { audioContent?: string };
    if (!data.audioContent) {
      throw new Error("Abair.ie TTS returned no audio content");
    }
    return data.audioContent;
  }
}

export function createProvider(apiKey: string): TranslationProvider {
  return new GoogleTranslationProvider(apiKey);
}
