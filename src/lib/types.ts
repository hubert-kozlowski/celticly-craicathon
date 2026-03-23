// ─── Shared data types for the Celticly extension ────────────────────────

export interface TranslationResult {
  sourceText: string;
  irishText: string;
  contextSentenceIrish?: string;    // translated surrounding sentence (not cached)
  wordType?: string;                // grammatical type from Wiktionary, e.g. "Noun", "Verb"
  sameInBothLanguages?: boolean;    // true when Irish translation matches the source (loanwords, proper nouns)
  isWord?: boolean;                 // true when source is a single token
  provider: string;
  fromCache: boolean;
}

export interface GrammarError {
  ruleId: string;
  fromy: string;
  fromx: string;
  toy: string;
  tox: string;
  msg: string;
  context: string;
  contextoffset: string;
  errortext: string;
  errorlength: string;
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
  popupAutoDismissMs: number; // 0 = stay until dismissed manually
  showPhonetics: boolean;
  theme: 'light' | 'dark' | 'auto'; // 'auto' follows OS preference
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  popupAutoDismissMs: 8000,
  showPhonetics: false,
  theme: 'light',
};
