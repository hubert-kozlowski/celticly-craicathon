// ─── Translation provider abstraction ────────────────────────────────────────
// Currently implemented: Microsoft Translator (Azure Cognitive Services).
// To swap providers: implement the TranslationProvider interface and update
// createProvider() below.

import type { TranslationResult } from "./types";

export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
}

// ── Microsoft Translator ──────────────────────────────────────────────────────
// Docs: https://learn.microsoft.com/en-us/azure/ai-services/translator/reference/v3-0-translate
// Free tier: 2 million chars/month. Irish (ga) is a supported language.

const MS_TRANSLATE_ENDPOINT =
  "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";

export class MicrosoftTranslationProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly region: string
  ) {}

  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    const url = `${MS_TRANSLATE_ENDPOINT}&to=${encodeURIComponent(targetLang)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Ocp-Apim-Subscription-Region": this.region,
      },
      body: JSON.stringify([{ Text: text }]),
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
        `Microsoft Translator returned HTTP ${response.status}: ${body}`
      );
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    // Shape: [{ detectedLanguage?: {...}, translations: [{ text, to }] }]
    const data = (await response.json()) as Array<{
      translations: Array<{ text: string; to: string }>;
    }>;

    const translated = data?.[0]?.translations?.[0]?.text;
    if (!translated) {
      const err = new Error("Unexpected response shape from translation provider");
      (err as NodeJS.ErrnoException).code = "PROVIDER";
      throw err;
    }

    return {
      sourceText: text,
      irishText: translated,
      provider: "microsoft",
      fromCache: false,
    };
  }
}

export function createProvider(
  apiKey: string,
  region: string
): TranslationProvider {
  return new MicrosoftTranslationProvider(apiKey, region);
}
