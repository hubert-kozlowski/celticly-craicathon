// ─── Shared data types for the Cúpla Focal extension ───────────────────────

export interface TranslationResult {
  sourceText: string;
  irishText: string;
  transliteratedText?: string; // pronunciation hint if available
  provider: string;
  fromCache: boolean;
}

export interface SavedWord {
  id: string;            // uuid-like: timestamp + random suffix
  sourceText: string;
  irishText: string;
  pageUrl: string;
  pageTitle: string;
  savedAt: number;       // Unix ms timestamp
}

export interface ExtensionSettings {
  enabled: boolean;
  apiKey: string;        // Microsoft Translator API key
  apiRegion: string;     // Azure region, e.g. "westeurope"
  popupAutoDismissMs: number;   // 0 = stay until dismissed manually
  showPhonetics: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  apiKey: "",
  apiRegion: "westeurope",
  popupAutoDismissMs: 8000,
  showPhonetics: false,
};
