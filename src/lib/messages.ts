// ─── Runtime message schema shared across extension contexts ────────────────

import type { TranslationResult, SavedWord } from "./types";

// ── Outbound: content script → service worker ──────────────────────────────

export interface TranslateRequest {
  type: "TRANSLATE";
  text: string;
  context?: string; // surrounding sentence for grammar-aware translation
}

export interface SaveWordRequest {
  type: "SAVE_WORD";
  sourceText: string;
  irishText: string;
  pageUrl: string;
  pageTitle: string;
}

export interface GetSavedWordsRequest {
  type: "GET_SAVED_WORDS";
}

export interface DeleteSavedWordRequest {
  type: "DELETE_SAVED_WORD";
  id: string;
}

export interface GetSettingsRequest {
  type: "GET_SETTINGS";
}

export interface SaveSettingsRequest {
  type: "SAVE_SETTINGS";
  settings: Record<string, unknown>;
}

export interface ClearCacheRequest {
  type: "CLEAR_CACHE";
}

export interface GetExampleRequest {
  type: "GET_EXAMPLE";
  sourceText: string;
  irishText: string;
}

export interface SpeakWordRequest {
  type: "SPEAK_WORD";
  text: string;
  langCode: string;
}

export interface GetHintRequest {
  type: "GET_HINT";
  sourceText: string;
  irishText: string;
}

export type ExtensionRequest =
  | TranslateRequest
  | SaveWordRequest
  | GetSavedWordsRequest
  | DeleteSavedWordRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | ClearCacheRequest
  | SpeakWordRequest
  | GetHintRequest;

// ── Inbound: service worker → content script ───────────────────────────────

export interface TranslateResponse {
  ok: true;
  result: TranslationResult;
}

export interface SaveWordResponse {
  ok: true;
  savedWord: SavedWord;
}

export interface GetSavedWordsResponse {
  ok: true;
  words: SavedWord[];
}

export interface DeleteSavedWordResponse {
  ok: true;
}

export interface GetSettingsResponse {
  ok: true;
  settings: import("./types").ExtensionSettings;
}

export interface SaveSettingsResponse {
  ok: true;
}

export interface ClearCacheResponse {
  ok: true;
}

export interface GetExampleResponse {
  ok: true;
  exampleSentence: string;
  exampleSentenceIrish: string;
  pronunciation?: string;
  wordType?: string;
}

export interface SpeakWordResponse {
  ok: true;
  audioContent: string; // base64-encoded WAV
}

export interface GetHintResponse {
  ok: true;
  hints: string[];       // similar English words as clues
  phonetic: string;      // phonetic pronunciation of the Irish word
}

export interface ErrorResponse {
  ok: false;
  error: string;
  code?: "NO_API_KEY" | "NETWORK" | "PROVIDER" | "RATE_LIMIT" | "UNKNOWN";
}

export type ExtensionResponse =
  | TranslateResponse
  | SaveWordResponse
  | GetSavedWordsResponse
  | DeleteSavedWordResponse
  | GetSettingsResponse
  | SaveSettingsResponse
  | ClearCacheResponse
  | SpeakWordResponse
  | GetHintResponse
  | ErrorResponse;
