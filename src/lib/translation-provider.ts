// ─── Translation provider abstraction ────────────────────────────────────────
// Translation calls are proxied through the Vercel serverless function
// (api/translate.ts) so the Google API key stays server-side.
// Word type: Wiktionary REST API (free, no key).
// Grammar check: an Gramadóir web API (free, no key).
// To swap providers: implement the TranslationProvider interface and update
// createProvider() below.

import type { TranslationResult, GrammarError, WordDefinition } from "./types";
import { PROXY_BASE_URL } from "./config";
import { preprocessText } from "./text-preprocess";
import { detectProperNoun } from "./proper-noun-detector";
import { getWordNetGaeilge } from "./wordnet-gaeilge";

export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
  translateRaw(text: string, targetLang: string): Promise<string>;
  fetchWordType(irishWord: string): Promise<string | null>;
  fetchWordDefinitions(englishWord: string): Promise<{ wordType: string | null; definitions: WordDefinition[] }>;
  fetchSimilarWords(englishWord: string): Promise<Array<{ word: string; irish: string }>>;
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
    // Step 1: Preprocess text (numbers → words, month names)
    const { preprocessed, hasChanges } = preprocessText(text);
    
    // Step 2: Translate the (potentially preprocessed) text
    const translated = await this.translateRaw(preprocessed, targetLang);
    
    // Step 3: Detect if this is a proper noun (place, person, etc.)
    const properNoun = await detectProperNoun(text);
    
    // Step 4: For single words, fetch similar words from WordNet-Gaeilge
    let similarWords: Array<{ word: string; irish: string }> = [];
    const isWord = !text.includes(" ");
    if (isWord) {
      try {
        similarWords = await this.fetchSimilarWords(text);
      } catch {
        // Gracefully handle similar words fetch failure
        similarWords = [];
      }
    }
    
    return {
      sourceText: text,
      irishText: translated,
      sameInBothLanguages: translated.toLowerCase().trim() === text.toLowerCase().trim(),
      isWord,
      isPreprocessed: hasChanges,
      properNounType: properNoun.isProperNoun ? properNoun.type : undefined,
      provider: "google",
      fromCache: false,
      similarWords: similarWords.length > 0 ? similarWords : undefined,
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
    return (await this.fetchWordDefinitions(irishWord).catch(() => ({ wordType: null, definitions: [] }))).wordType;
  }

  /**
   * Fetch multiple English definitions and part-of-speech for an English word
   * from Wiktionary. Returns up to 4 senses across all parts of speech.
   * Definitions have HTML stripped. Falls back gracefully on any error.
   * 
   * ENHANCEMENT OPPORTUNITY: Enrich definitions with:
   * - irishMeaning: Translation of this specific sense (can fetch from cadhan.com)
   * - example: Simple example sentence showing typical usage
   * 
   * Example via cadhan.com (Irish-English dictionary):
   * GET https://cadhan.com/api/entries/{word}
   * Returns Irish translations and usage examples for each sense.
   */
  async fetchWordDefinitions(englishWord: string): Promise<{ wordType: string | null; definitions: WordDefinition[] }> {
    try {
      const url = `${WIKTIONARY_ENDPOINT}/${encodeURIComponent(englishWord.toLowerCase())}`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) return { wordType: null, definitions: [] };

      const data = (await resp.json()) as Record<string, Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string }>;
      }>>;

      // Prefer the English ("en") section
      const enSection = data["en"];
      if (!Array.isArray(enSection) || enSection.length === 0) {
        return { wordType: null, definitions: [] };
      }

      const stripHtml = (s: string) =>
        s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();

      const definitions: WordDefinition[] = [];
      let wordType: string | null = null;

      for (const group of enSection) {
        const pos = group.partOfSpeech?.toLowerCase() ?? "";
        if (!wordType && pos) wordType = pos;
        if (!Array.isArray(group.definitions)) continue;
        for (const def of group.definitions) {
          const text = def.definition ? stripHtml(def.definition) : "";
          if (!text) continue;
          definitions.push({ pos, definition: text });
          if (definitions.length >= 4) break;
        }
        if (definitions.length >= 4) break;
      }

      // Attempt to provide Irish translations for each sense by translating
      // the English definition into Irish when an Irish sense isn't available
      // from the upstream source. This improves bilingual display in the UI.
      try {
        const defsWithIrish = await Promise.all(
          definitions.map(async (d) => {
            try {
              const irish = await this.translateRaw(d.definition, "ga");
              return { ...d, irishMeaning: irish } as WordDefinition;
            } catch {
              return d;
            }
          })
        );
        return { wordType, definitions: defsWithIrish };
      } catch {
        return { wordType, definitions };
      }
    } catch {
      return { wordType: null, definitions: [] };
    }
  }

  /**
   * Helper to deduplicate definitions that are too similar.
   * Only keeps definitions that represent genuinely different usage contexts.
   * Removes near-duplicate meanings to keep the UI clean.
   */
  private deduplicateDefinitions(definitions: WordDefinition[]): WordDefinition[] {
    if (definitions.length <= 1) return definitions;

    const kept: WordDefinition[] = [];
    const seenPhrases = new Set<string>();

    for (const def of definitions) {
      // Normalize for comparison: lowercase, first 40 chars, alphanumeric only
      const normalized = def.definition
        .toLowerCase()
        .substring(0, 40)
        .replace(/[^a-z0-9\s]/g, "");

      // Skip if we've seen a very similar definition
      if (seenPhrases.has(normalized)) continue;

      seenPhrases.add(normalized);
      kept.push(def);
    }

    return kept;
  }

  /**
   * Fetch semantically similar English words using WordNet-Gaeilge.
   * Returns up to 5 similar words with their Irish translations.
   * Falls back gracefully if the database is unavailable.
   */
  async fetchSimilarWords(englishWord: string): Promise<Array<{ word: string; irish: string }>> {
    try {
      const wn = getWordNetGaeilge();
      const similar = await wn.findSimilarWords(englishWord);
      return similar;
    } catch (err) {
      console.warn("Error fetching similar words:", err);
      return [];
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
