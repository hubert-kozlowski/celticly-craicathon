// ─── Shared data types for the Celticly extension ────────────────────────

export type ProperNounType = "place" | "person" | "brand" | "organization" | "unknown";

export interface WordDefinition {
  pos: string;         // part of speech, e.g. "noun", "verb"
  definition: string;  // plain-text definition (HTML stripped)
  irishMeaning?: string;  // Irish translation of this specific sense
  example?: string;    // example sentence in English showing usage
}

export interface TranslationResult {
  sourceText: string;
  irishText: string;
  contextSentenceIrish?: string;    // translated surrounding sentence (not cached)
  wordType?: string;                // grammatical type from Wiktionary, e.g. "Noun", "Verb"
  definitions?: WordDefinition[];   // up to 4 English senses from Wiktionary
  spellSuggestions?: string[];      // GaelSpell-validated Irish alternatives (if irishText has issues)
  sameInBothLanguages?: boolean;    // true when Irish translation matches the source (loanwords, proper nouns)
  isWord?: boolean;                 // true when source is a single token
  isPreprocessed?: boolean;         // true when numbers/dates were converted (e.g., "42" → "forty-two (42)")
  properNounType?: ProperNounType;  // classification from proper noun detector ("place", "person", etc.)
  phoneticSpelling?: string;        // phonetic pronunciation guide for Irish text
  pronunciationGuide?: string;      // detailed pronunciation notes
  similarWords?: Array<{ word: string; irish: string }>;  // semantically similar words from WordNet-Gaeilge
  userRating?: -1;                  // -1 indicates user has blacklisted this translation
  isBlacklisted?: boolean;          // true if this translation is in the blacklist
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
