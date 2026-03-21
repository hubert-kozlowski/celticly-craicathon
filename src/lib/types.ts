// ─── Shared data types for the Cúpla Focal extension ───────────────────────

export interface TranslationResult {
  sourceText: string;
  irishText: string;
  transliteratedText?: string;      // pronunciation hint if available
  contextSentenceIrish?: string;    // translated surrounding sentence (not cached)
  exampleSentence?: string;         // AI-generated daily-life example (English)
  exampleSentenceIrish?: string;    // AI-generated daily-life example (Irish)
  isWord?: boolean;                 // true when source is a single token
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
  apiKey: string;        // Google Cloud Translation API key
  popupAutoDismissMs: number;   // 0 = stay until dismissed manually
  showPhonetics: boolean;
  theme: 'light' | 'dark' | 'auto'; // 'auto' follows OS preference
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  apiKey: "",
  popupAutoDismissMs: 8000,
  showPhonetics: false,
  theme: 'light',
};
