# 🍀 Celticly

Website: https://celticly.lovable.app/

Made by: Ivan S. (Website, Project Manager, Art Design), and Hubert Koz. (Programming, Git, Project Manager).

> A browser extension that weaves Irish into your everyday web experience — like Grammarly, but for Gaeilge.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4CAF50?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-1565C0?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Google Translate](https://img.shields.io/badge/Google-Translate%20API-4285F4?style=flat-square&logo=googletranslate&logoColor=white)

Celticly lives quietly in your browser, helping you absorb Irish naturally. Highlight any text for an instant translation, save words to your personal word bank, and test yourself in **Gaeilge Mode** — where random words on real pages become Irish puzzles you type to unlock.

---

## Features

|                               |                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **✦ Select-to-translate**     | Highlight any text on any page for an instant Irish translation popup, isolated from host-page styles via Shadow DOM.                          |
| **🔊 Text-to-speech**         | Hear the correct Irish pronunciation with one click using cloud-based speech synthesis.                                                        |
| **🎮 Gaeilge Mode**           | Play an interactive language game: random words on pages flip to Irish — type the English answer to reveal them and test your knowledge.       |
| **📚 Word bank**              | Save translations with one click. Persisted in IndexedDB — survives restarts and updates. Export as JSON flashcards for review or study tools. |
| **⚡ Translation cache**      | 7-day local cache avoids redundant API calls, keeps the extension snappy, and saves API quota.                                                 |
| **✅ Spell check**            | Validates Irish translations against GaelSpell and suggests alternative spellings when needed.                                                 |
| **📖 Grammar check**          | Detects grammar errors in Irish text and provides corrective feedback.                                                                         |
| **🏷️ Smart entity detection** | Identifies proper nouns (places, people, brands) via OpenStreetMap and applies intelligent translation strategies.                             |
| **📅 Date intelligence**      | Automatically translates month names and date formats from English to Irish.                                                                   |
| **🔗 Semantic lookup**        | Finds semantically similar words from the WordNet-Gaeilge database to enrich translation context.                                              |
| **🚫 Blacklist manager**      | Exclude specific translations from appearing again — fully customizable word blacklist.                                                        |
| **🎨 Theme support**          | Choose between light, dark, or auto (system-preference) theme modes for comfortable reading and translation.                                   |
| **🛡️ Safe by design**         | Never fires inside inputs, textareas, or content-editable regions. Available via text selection or right-click context menu.                   |

---

## Getting started

### 1. Get a Google Translate API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com) and create or select a project.
2. Enable the **Cloud Translation API** under APIs & Services.
3. Go to **Credentials** and create an **API key**. Copy it for the next step.

### 2. Build the extension

```bash
npm install
npm run build     # production bundle → dist/
npm run dev       # watch mode for development
```

### 3. Load in Chrome

1. Go to `chrome://extensions` and enable **Developer mode** (top-right toggle).
2. Click **Load unpacked** and select the project root folder.
3. Click the Celticly toolbar icon → ⚙ Options and configure one of the following:
   - Use the hosted Google Translate API key: paste your `GOOGLE_CLOUD_TRANSLATE_API_KEY` into the Options page and click **Save**.
   - Or, if you self-host the translation proxy (recommended to keep the key server-side), paste the full proxy URL (for example `https://my-celticly-proxy.vercel.app/translate`) into the API endpoint field in Options and click **Save**.

   The Options page accepts either a direct API key (not recommended for public installs) or a proxy URL that forwards translation requests to Google Translate with the API key kept server-side.

   Note: do not commit your API key into source control.

> **✅ Security:** Celticly uses the `activeTab` permission (not broad host permissions) — the extension only accesses webpages in response to explicit user gestures like text selection or right-click menu clicks.

---

### Self-hosting the translation proxy (Vercel)

If you prefer keeping your Google Translate API key server-side, deploy the `api/translate.ts` function to Vercel and point the extension to that URL.

1. Create a Vercel account and install the Vercel CLI (optional) or use the Vercel dashboard.
2. Import this repository as a new Vercel project or deploy from the command line:

```bash
# from repo root (optional)
npx vercel login
npx vercel
```

3. In the Vercel project settings, add an environment variable named `GOOGLE_CLOUD_TRANSLATE_API_KEY` and paste your API key there (mark it as a secret). Do not commit the key to the repo.
4. Ensure `vercel.json` (if present) is included in the repo so the edge function deploys correctly — the `api/translate.ts` endpoint will be available after deployment (e.g. `https://<your-project>.vercel.app/api/translate`).
5. In the extension Options page, set the proxy URL (the `/api/translate` endpoint) as the API endpoint and save.

Security note: keep the API key in Vercel environment variables and restrict access via Vercel project settings. The extension sends only text to the proxy; no browsing history is stored.

---

## Project structure

```
src/
├── background/
│   └── service-worker.ts        # Translate API, cache, grammar check, TTS, context menu
├── content/
│   ├── content-script.ts        # Text selection detection, Gaeilge Mode orchestration
│   ├── popup-ui.ts              # Shadow DOM translation popup, rich UI
│   └── test-mode.ts             # Gaeilge Mode (interactive word puzzles)
├── options/
│   ├── options.ts               # Settings page (API key/proxy, auto-dismiss, theme)
│   └── wordbank.ts              # Word bank UI, export flashcards, manage blacklist
├── popup/
│   └── popup.ts                 # Browser action popup (opens options)
└── lib/
    ├── translation-provider.ts  # Google Translate API client + aggregation
    ├── gaelspell.ts             # Spell-check integration (cadhan.com)
    ├── proper-noun-detector.ts  # Place/person/brand detection via Nominatim
    ├── month-translator.ts      # Date/month translation (English → Irish)
    ├── wordnet-gaeilge.ts       # Semantic word lookup (similar words)
    ├── text-preprocess.ts       # Number/date normalization
    ├── storage.ts               # chrome.storage + IndexedDB wrappers
    ├── config.ts                # Configuration constants
    ├── types.ts                 # Shared data types
    └── messages.ts              # Typed runtime message schema
```

**Key design notes:**

- All translations are processed in the background service worker to avoid CORS issues and maintain separation of concerns.
- The popup is rendered in a Shadow DOM, ensuring complete style isolation from host pages.
- Cache is stored in IndexedDB with a 7-day TTL; settings use `chrome.storage.sync` for cross-device sync.
- The provider abstraction makes it straightforward to swap in a different translation backend.

---

## Permissions

| Permission     | Why                                                                       |
| -------------- | ------------------------------------------------------------------------- |
| `storage`      | Sync settings across devices via `chrome.storage.sync`                    |
| `contextMenus` | Add "Translate to Irish" to the right-click context menu                  |
| `activeTab`    | Access the current tab in response to user gestures (select/context menu) |

**Privacy note:** No browsing history is stored. Translation requests go only to Google Translate (via your API key or proxy). Grammar validation requests go to the GaelSpell API at cadhan.com. Place detection queries use OpenStreetMap's Nominatim API with built-in rate limiting (1 request per second, cached results).

---

## Roadmap

### ✅ Implemented

- [x] Select-to-translate popup (Shadow DOM, style-isolated)
- [x] Word bank with JSON flashcards export
- [x] Right-click context menu translation
- [x] Translation cache (7-day TTL)
- [x] Text-to-speech pronunciations via cloud synthesis
- [x] Gaeilge Mode — interactive in-page Irish puzzles
- [x] Spell-check integration (GaelSpell)
- [x] Grammar-check feedback
- [x] Proper noun detection (places, people, brands)
- [x] Smart content filtering (safe in inputs/textareas/contenteditable)
- [x] Translation blacklist manager
- [x] Theme support (light / dark / auto)
- [x] Month & date translation
- [x] Semantic word lookup (WordNet-Gaeilge)

### 📋 Planned

- [ ] Flashcard review/spaced-repetition mode in word bank
- [ ] Hover-triggered translation (optional, toggleable)
- [ ] Firefox & cross-browser packaging
- [ ] Local-only mode (no external API calls, requires offline resources)
- [ ] Browser syncing of word bank across devices
- [ ] Batch translation of entire pages
- [ ] Custom word bank categories/tags

---

## Development

### Available scripts

```bash
npm run dev          # Watch mode (rebuilds on file changes)
npm run build        # Production bundle → dist/
npm run type-check   # TypeScript check without emitting
npm run lint         # ESLint code quality check
npm run package      # Build + zip dist/ for local testing
npm run package:webstore  # Build + zip dist/ for Chrome Web Store submission
```

### Testing locally

After running `npm run build`, load the extension in Chrome:

1. Go to `chrome://extensions` and enable **Developer mode** (top-right)
2. Click **Load unpacked** and select the `dist/` folder
3. Click the Celticly icon → ⚙️ Options
4. Paste your Google Translate API key or proxy URL and click **Save**
5. Try selecting text on any webpage!

### Tips

- **API quota:** Text is capped at 500 characters per request to avoid unexpected charges. Google Translate offers $300 free credits to new accounts.
- **Rate limiting:** Place detection (Nominatim API) is rate-limited to 1 request per second and caches results.
- **Spell checking:** GaelSpell validation requires IP whitelisting; contact kscanne@gmail.com for access.
- **Development mode:** Use `npm run dev` to rebuild as you edit — watch mode is enabled by default in webpack config.
