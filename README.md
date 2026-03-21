# 🍀 Celticly

> A browser extension that weaves Irish into your everyday web experience — like Grammarly, but for Gaeilge.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4CAF50?style=flat-square&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-1565C0?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Google Translate](https://img.shields.io/badge/Google-Translate%20API-4285F4?style=flat-square&logo=googletranslate&logoColor=white)

Celticly lives quietly in your browser, helping you absorb Irish naturally. Highlight any text for an instant translation, save words to your personal word bank, and test yourself in **Gaeilge Mode** — where random words on real pages become Irish puzzles you type to unlock.

---

## Features

| | |
|---|---|
| **✦ Select-to-translate** | Highlight any text on any page for an instant Irish popup, isolated from host-page styles via Shadow DOM. |
| **🎮 Gaeilge Mode** | Random words on the page flip to Irish — type the English answer to reveal them. Learning built into browsing. |
| **🔊 Text-to-speech** | Hear the correct Irish pronunciation for any translated word or phrase. |
| **📚 Word bank** | Save translations with one click. Persisted in IndexedDB — survives restarts and updates. Export to CSV for Anki or Quizlet. |
| **⚡ Translation cache** | 7-day local cache avoids redundant API calls and keeps things snappy. |
| **🛡️ Smart & safe** | Never fires inside inputs, textareas, or rich editors. Right-click menu available as an alternative trigger. |

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
3. Click the Celticly toolbar icon → ⚙ Options, paste your API key and Azure region, and click **Save**.

---

## Project structure

```
src/
├── background/
│   └── service-worker.ts        # API calls, translation cache, context menu
├── content/
│   ├── content-script.ts        # Selection detection, Gaeilge Mode logic
│   └── popup-ui.ts              # Shadow DOM translation popup
├── options/
│   └── options.ts               # Settings + word bank UI
└── lib/
    ├── translation-provider.ts  # Google Translate API client
    ├── storage.ts               # chrome.storage + IndexedDB wrappers
    ├── tts.ts                   # Text-to-speech
    ├── types.ts                 # Shared data types
    └── messages.ts              # Typed runtime message schema
```

Translations are made from the background service worker — never from the content script — to avoid CORS issues. The provider abstraction makes it straightforward to swap in a different translation backend.

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Sync settings across devices via `chrome.storage.sync` |
| `contextMenus` | Add "Translate to Irish" to the right-click menu |
| `tts` | Text-to-speech for Irish pronunciations |
| `<all_urls>` | Inject content script on any page |

No browsing history is stored. Translation requests go only to Google Translate.

---

## Roadmap

- [x] Select-to-translate popup
- [x] Word bank with CSV export
- [x] Right-click context menu
- [x] Translation cache (7-day TTL)
- [ ] 🔊 Text-to-speech pronunciations
- [ ] 🎮 Gaeilge Mode — gamified in-page puzzles
- [ ] Flashcard review mode in the word bank
- [ ] Hover-triggered translation (optional mode)
- [ ] Firefox / cross-browser packaging
- [ ] Local-only mode (no external requests)

---

## Development

```bash
npm run dev          # watch mode
npm run type-check   # TypeScript check without emitting
npm run lint         # ESLint
npm run build        # production bundle
```

> Text is capped at 500 characters per request to avoid unexpected API charges. Google Translate offers $300 in free credits for new accounts.
