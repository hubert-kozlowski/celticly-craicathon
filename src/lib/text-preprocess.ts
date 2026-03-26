/**
 * Text Preprocessor - Converts numbers to words, month names, and prepares text for translation.
 * Adds inline numeric references for clarity ("forty-two (42)").
 */

import { translateMonthsInText, containsMonth } from "./month-translator";

// Simple number-to-words conversion (covers common cases)
const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

const TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

const SCALES = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
];

/**
 * Convert a number (0-999) to words.
 */
function convertHundreds(num: number): string {
  if (num === 0) return "";
  if (num < 10) return ONES[num];
  if (num < 20) return TEENS[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
  }
  
  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;
  const result = `${ONES[hundreds]} hundred`;
  return remainder === 0 ? result : `${result} ${convertHundreds(remainder)}`;
}

/**
 * Convert any integer to words.
 */
function numberToWords(num: number): string {
  if (num === 0) return "zero";
  if (num < 0) return `negative ${numberToWords(Math.abs(num))}`;
  
  let result = "";
  let scaleIndex = 0;
  
  while (num > 0) {
    if (num % 1000 !== 0) {
      const groupWords = convertHundreds(num % 1000);
      if (scaleIndex > 0) {
        result = `${groupWords} ${SCALES[scaleIndex]} ${result}`.trim();
      } else {
        result = groupWords;
      }
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }
  
  return result.trim();
}

/**
 * Convert a 4-digit number as a year (e.g., 1971 -> "nineteen seventy-one").
 * Years are traditionally spoken as two 2-digit numbers.
 * Special cases: 1000-1009 -> "one thousand (zero one, etc.)", 2000 -> "two thousand"
 */
function convertFourDigitYear(year: number): string {
  if (year < 1000 || year > 9999) {
    return numberToWords(year);
  }
  
  const firstTwo = Math.floor(year / 100);
  const lastTwo = year % 100;
  
  // Special case: 2000-2009 (e.g., "two thousand" or "two thousand and one")
  if (year >= 2000 && year < 2010) {
    if (lastTwo === 0) {
      return "two thousand";
    }
    return `two thousand ${convertHundreds(lastTwo)}`.trim();
  }
  
  // Special case: 1000-1009 (e.g., "one thousand" or "one thousand and one")
  if (year >= 1000 && year < 1010) {
    if (lastTwo === 0) {
      return "one thousand";
    }
    return `one thousand ${convertHundreds(lastTwo)}`.trim();
  }
  
  // Standard year format: split into two parts (e.g., 1971 -> "nineteen" + "seventy-one")
  const firstTwoWords = convertHundreds(firstTwo);
  const lastTwoWords = convertHundreds(lastTwo);
  
  if (lastTwo === 0) {
    // Years ending in 00 (e.g., 1900 -> "nineteen hundred")
    return `${firstTwoWords} hundred`;
  }
  
  return `${firstTwoWords} ${lastTwoWords}`;
}

/**
 * Convert a decimal number to words (e.g., 3.14 -> "three point one four").
 * Handles whole numbers (e.g., 1971 -> "nineteen seventy-one" for years, or regular expansion for other numbers)
 * and decimals (e.g., 3.14 -> "three point one four").
 */
function numberWithDecimalToWords(numStr: string): string {
  const [integerPart, decimalPart] = numStr.split(".");
  const numInt = parseInt(integerPart, 10);
  
  // Check if this is a 4-digit year (1000-9999)
  let intWords: string;
  if (!decimalPart && integerPart.length === 4 && numInt >= 1000 && numInt <= 9999) {
    // Treat as a year
    intWords = convertFourDigitYear(numInt);
  } else {
    // Regular number conversion
    intWords = numberToWords(numInt);
  }
  
  if (!decimalPart) {
    // No decimal part — return the number conversion
    return intWords;
  }
  
  // Convert decimal digits individually (3.14 -> "three point one four")
  const decimalDigits = decimalPart.split("").map((digit) => ONES[parseInt(digit, 10)]).join(" ");
  return `${intWords} point ${decimalDigits}`;
}

/**
 * Replace all numbers in text with word equivalents (with numeric reference).
 * Patterns: integers, decimals, currency ($100 -> "one hundred dollars (100)").
 * Edge cases: URLs, IP addresses, phone numbers are preserved.
 *
 * Key constraint: Numbers must be matched as complete units. For example, "1971" 
 * should be matched as "one thousand nine hundred seventy-one", not as "one 
 * thousand" + "nine" + "seventy-one", etc.
 */
export function preprocessNumbers(text: string): string {
  let result = text;
  
  // Pattern 1: Currency ($100, £50, €25)
  result = result.replace(/[$£€](\d+(?:\.\d{2})?)/g, (match, amount) => {
    const num = parseFloat(amount);
    const words = numberWithDecimalToWords(amount);
    const currency =
      match[0] === "$" ? "dollars" : match[0] === "£" ? "pounds" : "euros";
    return `${words} ${currency} (${amount})`;
  });
  
  // Pattern 2: Percentages (50% -> "fifty percent (50%)")
  result = result.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => {
    const words = numberWithDecimalToWords(num);
    return `${words} percent (${match})`;
  });
  
  // Pattern 3: Time format (14:30 -> preserve, not a conversion target)
  // Skip time format (HH:MM) — don't convert
  
  // Pattern 4: Years and regular numbers
  // Match complete number sequences (not split across digit boundaries).
  // Negative lookbehind: not preceded by digit or dot (avoids matching parts of decimals/IPs)
  // Main pattern: one or more digits, optionally followed by decimal point and more digits
  // Negative lookahead: not followed by colon+digit (time format), slash (URL), dot (domain), or letter (not an abbreviation)
  result = result.replace(/(?<!\d\.)(\d+(?:\.\d+)?)(?!:\d|\/|\.|[a-z])/gi, (match, num, offset, str) => {
    // Skip if it's part of a URL or domain
    if (
      (str[offset - 1] === "/" && (str[offset - 2] === "/" || str[offset - 2] === ".")) ||
      (str[offset + match.length] === "/" || str[offset + match.length] === ".") ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str.slice(Math.max(0, offset - 3), offset + match.length + 3))
    ) {
      return match;
    }
    
    const words = numberWithDecimalToWords(num);
    return `${words} (${num})`;
  });
  
  return result;
}

/**
 * Preprocess text for translation:
 * 1. Convert numbers to words with numeric reference
 * 2. Convert month names to Irish equivalents
 * Returns the preprocessed text.
 */
export function preprocessText(text: string): { preprocessed: string; hasChanges: boolean } {
  const original = text;
  
  // Apply preprocessing steps
  let result = text;
  result = preprocessNumbers(result);
  
  if (containsMonth(result)) {
    result = translateMonthsInText(result);
  }
  
  return {
    preprocessed: result,
    hasChanges: result !== original,
  };
}

/**
 * Create a display-friendly version of preprocessed text.
 * If text was preprocessed, show clear indication for UI.
 */
export function createPreprocessedLabel(originalText: string, preprocessedText: string): string | null {
  if (originalText === preprocessedText) {
    return null;
  }
  
  // Simple heuristic: if numbers were converted, show indicator
  if (/\(\d+(?:\.\d+)?\)/.test(preprocessedText) && !/\(\d+(?:\.\d+)?\)/.test(originalText)) {
    return "Preprocessed"; // Hint that text was modified
  }
  
  return null;
}
