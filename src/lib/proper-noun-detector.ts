/**
 * Proper Noun Detector - Identifies place names, person names, and other proper nouns
 * using OpenStreetMap Nominatim API for places and basic heuristics for other types.
 */

export type ProperNounType = "place" | "person" | "brand" | "organization" | "unknown";

export interface ProperNounResult {
  isProperNoun: boolean;
  type: ProperNounType;
  displayName?: string; // For places, the official name from Nominatim
  irishName?: string; // Irish translation if available
}

// Cache for API results to avoid spamming Nominatim
const nominatimCache = new Map<string, ProperNounResult>();
const lastRequestTime = { time: 0 };
const NOMINATIM_RATE_LIMIT_MS = 1100; // 1 second minimum between requests

/**
 * Common English words/stopwords that should never be queried as places.
 * Prevents false positives when common words match place names in Nominatim.
 */
const commonEnglishWords = new Set([
  // Articles & prepositions
  "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "from", "with", "as", "is", "or", "and", "but", "if", "so", "than",
  // Common verbs
  "be", "have", "do", "go", "get", "make", "take", "come", "see", "know", "think", "feel", "find", "give", "tell", "work", "call", "try", "use", "ask", "need", "feel", "become", "leave", "put", "mean", "keep", "let", "begin", "seem", "help", "talk", "turn", "start", "show", "hear", "play", "run", "move", "like", "live", "believe", "hold", "bring", "happen", "write", "provide", "sit", "stand", "lose", "pay", "meet", "include", "continue", "set", "learn", "change", "lead", "understand", "watch", "follow", "stop", "create", "speak", "read", "allow", "add", "spend", "grow", "open", "walk", "win", "offer", "remember", "love", "consider", "appear", "buy", "wait", "serve", "die", "send", "expect", "build", "stay", "fall", "cut", "reach", "kill", "remain", "suggest", "raise", "pass", "sell", "require", "report", "decide", "pull", "explain", "develop", "carry", "break", "receive", "agree", "support", "hit", "produce", "eat", "cover", "catch", "draw", "choose", "cause", "follow", "close", "drive", "clear", "realize", "succeed", "push", "establish", "teach", "claim", "release", "challenge", "recognize", "obtain", "reflect", "swim", "sing", "prepare", "match", "imagine", "reflect", "recognize", "paint", "surprise", "deny", "doubt", "encourage", "expect", "forbid", "imagine", "intend", "justify", "mention", "notice", "persuade", "permit", "predict", "pretend", "recall", "recognize", "recommend", "regret", "report", "require", "resist", "resolve", "reveal", "say", "seem", "suppose", "suspect", "acknowledge", "admit", "advise", "allow", "assist", "assure", "assume", "assure", "avoid", "balance", "beat", "become", "begin", "behave", "believe", "belong", "bid", "bind", "bite", "blow", "blow", "boast", "borrow", "bounce", "bow", "box", "brake", "brand", "brave", "break", "breed", "brief", "bring", "broadcast", "bubble", "budget", "build", "bunch", "burn", "burst", "bury", "calculate", "cater", "celebrate", "cease", "cells", "chain", "challenge", "chair", "change", "channel", "charge", "charm", "cheap", "cheat", "check", "cheer", "cherish", "chess", "chew", "choke", "choose", "cite", "claim", "clap", "clarify", "clash", "classify", "clean", "clear", "click", "climb", "clip", "close", "clothe", "coach", "coast", "code", "cohere", "coil", "coincide", "collapse", "collect", "collide", "combine", "comfort", "command", "commence", "comment", "commit", "communicate", "compare", "compete", "compile", "complain", "complete", "comply", "compose", "compound", "comprise", "compromise", "compute", "conceal", "concede", "conceive", "concentrate", "conceptualize", "concern", "conclude", "condemn", "condense", "condition", "conduct", "confess", "confide", "confirm", "conflict", "conform", "confuse", "congratulate", "connect", "conquer", "consent", "conserve", "consider", "consist", "console", "consolidate", "conspire", "constitute", "construct", "consult", "consume", "contact", "contain", "contemplate", "contend", "context",
  // Common nouns (lowercase when used as regular words)
  "time", "day", "year", "people", "hand", "hour", "way", "place", "thing", "side", "case", "group", "point", "fact", "week", "number", "night", "system", "idea", "form", "end", "life", "land", "program", "question", "man", "woman", "child", "world", "country", "state", "city", "part", "member", "effect", "result", "kind", "reason", "water", "word", "action", "street", "door", "moment", "type", "level", "ground", "light", "center", "school", "room", "money", "game", "business", "problem", "interest", "house", "name", "nature", "force", "position", "nation", "nature", "line", "matter", "morning", "care", "health", "feeling", "market", "history", "context", "view", "example", "course", "model", "power", "sign", "value", "area", "rate", "age", "line", "situation", "right", "rate", "eye", "body", "chance", "bed", "brother", "use", "purpose", "source", "object", "field", "skill", "reason", "choice", "growth", "disease", "danger", "sense", "war", "service", "music", "song", "sound", "pattern", "culture", "nature", "season", "thought", "opinion", "behavior", "surface", "process", "project", "error", "reason", "law", "rule", "difference", "distance", "age", "weight", "measure", "distance", "direction", "period", "voice", "tone", "mood", "style", "method", "approach", "technique", "skill", "talent", "gift",
  // Common adjectives
  "good", "bad", "big", "small", "long", "short", "new", "old", "first", "last", "high", "low", "right", "wrong", "true", "false", "same", "different", "other", "best", "worst", "more", "less", "most", "least", "great", "little", "early", "late", "fast", "slow", "hard", "easy", "strong", "weak", "hot", "cold", "warm", "cool", "bright", "dark", "light", "heavy", "cheap", "expensive", "public", "private", "special", "general", "local", "foreign", "common", "rare", "clear", "simple", "complex", "possible", "impossible", "certain", "uncertain", "active", "passive", "alive", "dead", "real", "fake", "single", "double", "bright", "dull", "sweet", "bitter", "soft", "hard", "smooth", "rough", "sharp", "dull", "clean", "dirty", "wet", "dry", "full", "empty", "open", "closed", "wide", "narrow", "thick", "thin", "tall", "short", "deep", "shallow", "strong", "weak", "loud", "quiet", "fast", "slow", "happy", "sad", "angry", "calm", "brave", "afraid", "proud", "ashamed", "smart", "stupid", "wise", "foolish", "kind", "mean", "polite", "rude", "honest", "dishonest", "loyal", "disloyal", "generous", "selfish", "humble", "arrogant", "patient", "impatient", "grateful", "ungrateful", "curious", "indifferent", "energetic", "lazy", "confident", "shy", "creative", "dull", "funny", "serious", "beautiful", "ugly", "handsome", "plain", "pretty", "ugly", "elegant", "clumsy", "graceful", "awkward", "skillful", "clumsy",
  // Common adverbs
  "not", "very", "just", "only", "also", "even", "still", "again", "back", "down", "up", "out", "over", "off", "in", "out", "here", "there", "now", "then", "today", "tomorrow", "yesterday", "away", "always", "never", "often", "sometimes", "usually", "rarely", "well", "badly", "carefully", "quickly", "slowly", "loudly", "quietly", "softly", "hard", "easily", "simply", "completely", "partly", "fully", "almost", "quite", "really", "so", "too", "either", "neither", "also", "besides", "therefore", "however", "instead", "finally", "soon", "late", "early", "already", "yet", "still", "first", "next", "last", "immediately", "suddenly", "gradually", "finally", "suddenly", "together", "apart", "alone", "forward", "backward", "upward", "downward", "inward", "outward", "inside", "outside", "above", "below", "beyond", "through", "across", "along", "around", "within", "without",
  // Common pronouns
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "her", "its", "our", "their", "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves", "this", "that", "these", "those", "who", "whom", "whose", "what", "which", "one", "ones", "each", "every", "neither", "either",
  // Misc common words
  "both", "all", "any", "some", "such", "no", "none", "nothing", "something", "anything", "everything", "someone", "anyone", "everyone", "nobody", "somebody", "during", "while", "since", "until", "before", "after", "between", "among", "through", "along", "across", "without", "within", "about", "around", "over", "under", "above", "below", "beside", "near", "far", "next", "between", "among", "throughout", "behind", "ahead", "despite", "except", "besides", "rather", "instead", "like", "such", "unlike", "between", "among", "versus", "towards",
]);

/**
 * Check if a word is a common English word/stopword that shouldn't be treated as a place name.
 */
function isCommonEnglishWord(text: string): boolean {
  return commonEnglishWords.has(text.toLowerCase().trim());
}

/**
 * Simple heuristic checks for person names, brands, etc.
 * Returns early if detected; uses Nominatim for comprehensive place lookup.
 */
function checkHeuristics(text: string): ProperNounResult | null {
  // Skip short words (unlikely to be proper nouns)
  if (text.length < 3) {
    return null;
  }

  const lowerText = text.toLowerCase();

  // Common Irish/English first names (curated list)
  const knownFirstNames = new Set([
    "john", "mary", "patrick", "brigid", "sean", "siobhan", "michael", "fintan",
    "aoife", "kevin", "david", "sarah", "james", "catherine", "thomas", "elizabeth",
    "william", "margaret", "george", "anne", "robert", "helen", "richard", "diana",
  ]);

  // Common last names / surname patterns
  const knownLastNames = new Set([
    "murphy", "sullivan", "malley", "ryan", "cafferty", "walsh", "lynch", "kelly",
    "byrne", "malone", "quinn", "doyle", "connelly", "moore", "harris", "taylor",
  ]);

  // Check against known names
  if (knownFirstNames.has(lowerText) || knownLastNames.has(lowerText)) {
    return { isProperNoun: true, type: "person", displayName: text };
  }

  // Known brands/organizations (common examples)
  const knownBrands = new Set([
    "google", "amazon", "microsoft", "apple", "facebook", "twitter", "instagram",
    "tiktok", "uber", "airbnb", "netflix", "spotify", "rte", "bbc", "cnn",
  ]);

  if (knownBrands.has(lowerText)) {
    return { isProperNoun: true, type: "brand", displayName: text };
  }

  return null;
}

/**
 * Query OpenStreetMap Nominatim API for place detection.
 * Respects rate limiting (1 request/second).
 */
async function queryNominatim(text: string): Promise<ProperNounResult | null> {
  try {
    // Enforce rate limiting
    const elapsed = Date.now() - lastRequestTime.time;
    if (elapsed < NOMINATIM_RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, NOMINATIM_RATE_LIMIT_MS - elapsed));
    }
    lastRequestTime.time = Date.now();

    const endpoint = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
      q: text,
      format: "json",
      limit: "1",
      accept_language: "en,ga", // Prefer English or Irish results
    });

    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        "User-Agent": "Craicathon/1.0 (Irish learning extension)",
      },
    });

    if (!response.ok) {
      console.warn(`Nominatim API error: ${response.status}`);
      return null;
    }

    const results = await response.json() as Array<{
      name?: string;
      display_name?: string;
      class?: string;
      type?: string;
      importance?: number;
    }>;

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    const displayName = result.display_name || result.name || text;

    // Check if result is actually a place based on class/type
    const isPlace = ["place", "boundary", "landuse"].includes(result.class || "");
    if (!isPlace) {
      return null;
    }

    // Additional validation: Ensure the place name is significantly longer or more specific
    // than the query text to avoid matching generic/common words.
    // For example, "During" shouldn't match a place just because it contains a location.
    // Require importance score > 0.3 for single-word queries to indicate real places
    const queryLength = text.trim().split(/\s+/).length;
    if (queryLength === 1 && (result.importance ?? 0) < 0.3) {
      // Single-word query with low importance score - likely not a real place
      return null;
    }

    return {
      isProperNoun: true,
      type: "place",
      displayName,
      irishName: undefined, // Could be enriched with separate Irish place name lookup
    };
  } catch (error) {
    console.warn("Nominatim API request failed:", error);
    return null;
  }
}

/**
 * Main function: Detect if a word is a proper noun.
 * Uses heuristics first (instant), then Nominatim API for places (cached).
 */
export async function detectProperNoun(text: string): Promise<ProperNounResult> {
  const normalized = text.trim();

  if (normalized.length === 0) {
    return { isProperNoun: false, type: "unknown" };
  }

  // Check cache first
  if (nominatimCache.has(normalized)) {
    return nominatimCache.get(normalized)!;
  }

  // Prevent common English words from being queried as places
  if (isCommonEnglishWord(normalized)) {
    const result = { isProperNoun: false, type: "unknown" as ProperNounType };
    nominatimCache.set(normalized, result);
    return result;
  }

  // Try heuristics (instant)
  const heuristic = checkHeuristics(normalized);
  if (heuristic) {
    nominatimCache.set(normalized, heuristic);
    return heuristic;
  }

  // Try Nominatim API (place lookup)
  const nominatimResult = await queryNominatim(normalized);
  if (nominatimResult) {
    nominatimCache.set(normalized, nominatimResult);
    return nominatimResult;
  }

  // Default: not a proper noun
  const result = { isProperNoun: false, type: "unknown" as ProperNounType };
  nominatimCache.set(normalized, result);
  return result;
}

/**
 * Batch detect multiple words (optimized for game mode).
 * Respects Nominatim rate limiting by canceling if too many API calls would be needed.
 */
export async function detectProperNounsBatch(words: string[]): Promise<Map<string, ProperNounResult>> {
  const results = new Map<string, ProperNounResult>();
  const cachedWords = new Set<string>();
  const pendingLookups: string[] = [];

  // Separate cached from pending
  for (const word of words) {
    const normalized = word.trim();
    if (nominatimCache.has(normalized)) {
      results.set(normalized, nominatimCache.get(normalized)!);
      cachedWords.add(normalized);
    } else {
      pendingLookups.push(normalized);
    }
  }

  // Process pending lookups (with rate limit fallback)
  for (const word of pendingLookups) {
    const heuristic = checkHeuristics(word);
    if (heuristic) {
      results.set(word, heuristic);
      nominatimCache.set(word, heuristic);
    } else {
      // Skip API calls if too many pending (avoid rate limit spam)
      if (pendingLookups.length > 10) {
        const result = { isProperNoun: false, type: "unknown" as ProperNounType };
        results.set(word, result);
        nominatimCache.set(word, result);
      } else {
        try {
          const nominatimResult = await detectProperNoun(word);
          results.set(word, nominatimResult);
        } catch (error) {
          console.warn("Batch lookup failed, continuing:", error);
          const result = { isProperNoun: false, type: "unknown" as ProperNounType };
          results.set(word, result);
          nominatimCache.set(word, result);
        }
      }
    }
  }

  return results;
}

/**
 * Clear the cache (useful for testing or manual refresh).
 */
export function clearProperNounCache(): void {
  nominatimCache.clear();
}
