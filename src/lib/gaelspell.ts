// ─── GaelSpell Spell Check Service ──────────────────────────────────────────
// GaelSpell is the Irish language spell checker from cadhan.com.
// Web API: https://cadhan.com/api/gaelspell/1.0
// Returns spell check suggestions for Irish words.
// No API key required, but IP must be whitelisted by cadhan.com admin.
//
// API Response Format:
//   [
//     ["misspelled_word", ["suggestion1", "suggestion2", ...]],
//     ["another_word", []]
//   ]
//
// Note: IP address must be whitelisted. Contact kscanne@gmail.com for access.

const GAELSPELL_ENDPOINT = "https://cadhan.com/api/gaelspell/1.0";

export interface GaelSpellError extends Error {
  code?:
    | "NETWORK_ERROR"
    | "API_ERROR"
    | "RATE_LIMIT"
    | "UNAUTHORIZED"
    | "MALFORMED_RESPONSE";
}

/**
 * Query the GaelSpell API for spell check suggestions.
 * @param irishText - The Irish language text to check (can be a single word or phrase)
 * @returns An array of [word, suggestions[]] pairs for misspelled words;
 *          empty array if no misspellings or on error
 * @throws GaelSpellError with specific error code for debugging
 */
export async function getSuggestions(
  irishText: string
): Promise<Array<[string, string[]]>> {
  if (!irishText || !irishText.trim()) {
    return [];
  }

  try {
    const body = new URLSearchParams({
      teacs: irishText.trim(),
    });

    const response = await fetch(GAELSPELL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });

    // Handle rate limiting (IP not whitelisted or quota exceeded)
    if (response.status === 403) {
      const err = new Error(
        "GaelSpell API: Access denied (IP not whitelisted)"
      ) as GaelSpellError;
      err.code = "UNAUTHORIZED";
      throw err;
    }

    // Handle other HTTP errors
    if (!response.ok) {
      const err = new Error(
        `GaelSpell API returned HTTP ${response.status}`
      ) as GaelSpellError;
      err.code = "API_ERROR";
      throw err;
    }

    // Parse response
    const data = (await response.json()) as Array<[string, string[]]>;

    // Validate response format
    if (!Array.isArray(data)) {
      const err = new Error(
        "GaelSpell API returned unexpected response format"
      ) as GaelSpellError;
      err.code = "MALFORMED_RESPONSE";
      throw err;
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      const err = new Error(
        "GaelSpell API: Network error or CORS blocked"
      ) as GaelSpellError;
      err.code = "NETWORK_ERROR";
      throw err;
    }

    if ((error as GaelSpellError).code) {
      throw error;
    }

    // Timeout or other fetch errors
    const err = new Error(
      `GaelSpell API error: ${error instanceof Error ? error.message : "Unknown"}`
    ) as GaelSpellError;
    err.code = "NETWORK_ERROR";
    throw err;
  }
}

/**
 * Get spell check suggestions for a single Irish word.
 * Returns the top suggestions (or empty array if no misspellings detected).
 * @param irishWord - Single Irish word to check
 * @param maxSuggestions - Maximum number of suggestions to return (default: 6)
 * @returns Array of suggestion strings (empty if word is spelled correctly)
 */
export async function getWordSuggestions(
  irishWord: string,
  maxSuggestions: number = 6
): Promise<string[]> {
  try {
    const results = await getSuggestions(irishWord);
    if (results.length === 0) {
      return [];
    }

    // Find suggestions for the first (or only) word in results
    const [, suggestions] = results[0];
    return suggestions.slice(0, maxSuggestions);
  } catch {
    // Silently fail and return empty array
    // (caller should handle gracefully in UI)
    return [];
  }
}

/**
 * Test if the GaelSpell API is accessible (non-blocking health check).
 * @returns true if API is reachable and whitelisted, false otherwise
 */
export async function isGaelSpellAvailable(): Promise<boolean> {
  try {
    const result = await getSuggestions("test");
    // If we got a response (even an empty one), API is working
    return Array.isArray(result);
  } catch (error) {
    const gaelError = error as GaelSpellError;
    // Network errors or unauthorized errors mean API is unavailable
    return gaelError.code !== "NETWORK_ERROR" && gaelError.code !== "UNAUTHORIZED";
  }
}
