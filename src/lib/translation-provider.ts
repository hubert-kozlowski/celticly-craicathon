// ─── Translation provider abstraction ────────────────────────────────────────
// Translation calls are proxied through the Vercel serverless function
// (api/translate.ts) so the Google API key stays server-side.
// Word type: Wiktionary REST API (free, no key).
// Grammar check: an Gramadóir web API (free, no key).
// To swap providers: implement the TranslationProvider interface and update
// createProvider() below.

import type { TranslationResult, GrammarError } from "./types";
import { PROXY_BASE_URL } from "./config";

export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
  translateRaw(text: string, targetLang: string): Promise<string>;
  fetchWordType(irishWord: string): Promise<string | null>;
  generateLocalHints(sourceWord: string): { hints: string[] };
  checkGrammar(text: string): Promise<GrammarError[]>;
  synthesizeSpeech(text: string, langCode: string): Promise<string>;
}

// ── Celticly Translation Proxy ───────────────────────────────────────────────
// Requests go through the Vercel Edge Function which holds the Google API key.
// Update PROXY_BASE_URL in src/lib/config.ts after deploying to Vercel.

const PROXY_TRANSLATE_ENDPOINT = `${PROXY_BASE_URL}/api/translate`;
// ── Abair.ie Text-to-Speech ─────────────────────────────────────────────────
// API at api.abair.ie — Irish-language TTS built at Trinity College Dublin.
// No API key required. Supports Connacht, Munster, and Ulster dialects.
const ABAIR_TTS_ENDPOINT = "https://api.abair.ie/v3/synthesis";
// Default voice: Sibéal — Connemara (Connacht Irish), female, PIPER model.
const ABAIR_DEFAULT_VOICE = "ga_CO_snc_piper";
// ── Wiktionary REST API ───────────────────────────────────────────────────
// Free, no key. Used to look up the grammatical part-of-speech for Irish words.
const WIKTIONARY_ENDPOINT = "https://en.wiktionary.org/api/rest_v1/page/definition";
// ── an Gramadóir web API ──────────────────────────────────────────────────
// Free Irish grammar checker from cadhan.com. No key required.
const GRAMADOIR_ENDPOINT = "https://cadhan.com/api/gramadoir/1.0";

export class GoogleTranslationProvider implements TranslationProvider {

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
    const response = await fetch(PROXY_TRANSLATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
      const err = new Error("Rate limit exceeded");
      (err as NodeJS.ErrnoException).code = "RATE_LIMIT";
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err = new Error(`Translation proxy returned HTTP ${response.status}: ${body}`);
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    const data = (await response.json()) as { translatedText?: string };
    const translated = data?.translatedText;
    if (!translated) {
      const err = new Error("Unexpected response from translation proxy");
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    return translated;
  }

  /**
   * Look up the grammatical part-of-speech for an Irish word via the free
   * Wiktionary REST API. Returns null if the word is not found or on failure.
   */
  async fetchWordType(irishWord: string): Promise<string | null> {
    try {
      const url = `${WIKTIONARY_ENDPOINT}/${encodeURIComponent(irishWord.toLowerCase())}`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as Record<string, Array<{ partOfSpeech?: string }>>;
      const gaSection = data["ga"];
      if (Array.isArray(gaSection) && gaSection.length > 0 && gaSection[0].partOfSpeech) {
        return gaSection[0].partOfSpeech.toLowerCase();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate quiz hint clues locally - no network request needed.
   * Returns three clues about the source English word to help the learner.
   */
  generateLocalHints(sourceWord: string): { hints: string[] } {
    const w = sourceWord.trim();
    const hints: string[] = [
      `Starts with '${(w[0] ?? "?").toUpperCase()}'`,
      `${w.length} letter${w.length !== 1 ? "s" : ""} long`,
    ];
    const vowel = w.match(/[aeiou]/i)?.[0];
    if (vowel) hints.push(`Contains the vowel '${vowel.toUpperCase()}'`);
    return { hints };
  }

  /**
   * Check Irish text for grammatical errors using the free an Gramadóir API
   * (cadhan.com). No API key required. Returns an empty array on failure.
   */
  async checkGrammar(text: string): Promise<GrammarError[]> {
    try {
      const body = new URLSearchParams({
        teacs: text,
        teanga: "en",
        cliant: "celticly",
      });
      const resp = await fetch(GRAMADOIR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return [];
      return (await resp.json()) as GrammarError[];
    } catch {
      return [];
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

export function createProvider(): TranslationProvider {
  return new GoogleTranslationProvider();
}
