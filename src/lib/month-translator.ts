/**
 * Month Translator - Converts English month names to Irish equivalents.
 * Handles dates in various formats.
 */

const MONTH_MAP: Record<string, string> = {
  // Full month names
  january: "Eanáir",
  february: "Feabhra",
  march: "Márta",
  april: "Aibreán",
  may: "Bealtaine",
  june: "Meitheamh",
  july: "Iúil",
  august: "Lúnasa",
  september: "Meán Fómhair",
  october: "Deireadh Fómhair",
  november: "Samhain",
  december: "Nollaig",
  
  // Abbreviated month names
  jan: "Ean",
  feb: "Feabh",
  mar: "Márta",
  apr: "Aib",
  jun: "Meith",
  jul: "Iúil",
  aug: "Lún",
  sep: "MF",
  sept: "Meán Fómhair",
  oct: "DF",
  nov: "Samh",
  dec: "Noll",
};

/**
 * Convert a single month name to Irish. Case-insensitive.
 */
export function translateMonth(monthName: string): string | null {
  const lower = monthName.toLowerCase();
  return MONTH_MAP[lower] || null;
}

/**
 * Translate month names within a phrase (e.g., "March 15" -> "Márta 15").
 * Preserves other text unchanged.
 */
export function translateMonthsInText(text: string): string {
  let result = text;
  
  // Replace full month names first (to avoid partial matches)
  const fullMonths = Object.entries(MONTH_MAP).filter(([key]) => key.length > 3);
  for (const [english, irish] of fullMonths) {
    const regex = new RegExp(`\\b${english}\\b`, "gi");
    result = result.replace(regex, (match) => {
      // Preserve casing: if original was capitalized, capitalize Irish too
      if (match[0] === match[0].toUpperCase()) {
        return irish.charAt(0).toUpperCase() + irish.slice(1);
      }
      return irish;
    });
  }
  
  // Replace abbreviated months
  const abbrevMonths = Object.entries(MONTH_MAP).filter(([key]) => key.length <= 3);
  for (const [english, irish] of abbrevMonths) {
    const regex = new RegExp(`\\b${english}\\b`, "gi");
    result = result.replace(regex, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return irish.charAt(0).toUpperCase() + irish.slice(1);
      }
      return irish;
    });
  }
  
  return result;
}

/**
 * Check if text contains any English month names.
 */
export function containsMonth(text: string): boolean {
  const lower = text.toLowerCase();
  return Object.keys(MONTH_MAP).some((month) => lower.includes(month));
}
