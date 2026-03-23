// Vercel Edge Runtime – Translation proxy for the Celticly Chrome extension.
// Keeps the Google Cloud Translation API key server-side.
//
// Required environment variable (set in Vercel project dashboard):
//   GOOGLE_CLOUD_TRANSLATE_API_KEY  – your Google Cloud Translation API key

export const config = { runtime: "edge" };

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";

const MAX_TEXT_LENGTH = 500;
// Accept 2-letter codes with optional region, e.g. "ga", "en", "zh-TW"
const VALID_LANG = /^[a-z]{2,3}(-[A-Z]{2,4})?$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { text, targetLang } = (body ?? {}) as {
    text?: unknown;
    targetLang?: unknown;
  };

  if (typeof text !== "string" || !text.trim()) {
    return jsonResponse({ error: "text is required" }, 400);
  }
  if (typeof targetLang !== "string" || !VALID_LANG.test(targetLang)) {
    return jsonResponse({ error: "invalid targetLang" }, 400);
  }

  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "Translation service not configured" }, 500);
  }

  const sanitized = text.trim().slice(0, MAX_TEXT_LENGTH);
  const url = `${GOOGLE_TRANSLATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: sanitized, target: targetLang, format: "text" }),
  });

  if (upstream.status === 429) {
    return jsonResponse({ error: "Rate limit exceeded" }, 429);
  }
  if (!upstream.ok) {
    return jsonResponse({ error: "Translation upstream error" }, 502);
  }

  const data = (await upstream.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  const translatedText = data?.data?.translations?.[0]?.translatedText;

  if (!translatedText) {
    return jsonResponse({ error: "Unexpected upstream response" }, 502);
  }

  return jsonResponse({ translatedText });
}
