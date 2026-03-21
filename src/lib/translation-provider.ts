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
  synthesizeSpeech(text: string, langCode: string): Promise<string>;
}

// ── Google Cloud Translation ──────────────────────────────────────────────────
// Docs: https://cloud.google.com/translate/docs/reference/rest/v2/translate
// Free tier: 500,000 chars/month. Irish (ga) is a supported language.

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";
// ── ElevenLabs Text-to-Speech ────────────────────────────────────────────────
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
// eleven_multilingual_v2 model supports Irish (Gaeilge).
const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
// Default: "Adam" voice – neutral, works well with Irish through the multilingual model.
const ELEVENLABS_DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
// ── Google Gemini ─────────────────────────────────────────────────────────────
// Used for generating context-aware example sentences.
// Requires the "Generative Language API" to be enabled on the same project.
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export class GoogleTranslationProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly elevenLabsApiKey: string = ""
  ) {}

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
        signal: AbortSignal.timeout(7000),
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
   * Call ElevenLabs TTS API and return base64-encoded MP3 audio.
   * Uses the eleven_multilingual_v2 model which supports Irish (Gaeilge).
   */
  async synthesizeSpeech(text: string, _langCode: string): Promise<string> {
    if (!this.elevenLabsApiKey) {
      throw new Error("No ElevenLabs API key configured");
    }
    const url = `${ELEVENLABS_TTS_ENDPOINT}/${ELEVENLABS_DEFAULT_VOICE_ID}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.elevenLabsApiKey,
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.85 },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`ElevenLabs TTS returned HTTP ${resp.status}: ${body}`);
    }

    // Convert binary audio/mpeg response to base64
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

export function createProvider(apiKey: string, elevenLabsApiKey = ""): TranslationProvider {
  return new GoogleTranslationProvider(apiKey, elevenLabsApiKey);
}
