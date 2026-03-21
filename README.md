# Cúpla Focal – Irish Translation Chrome Extension

**Select any text on the web for an instant Irish translation.**  
Save words to a personal word bank and naturally weave Gaeilge into your daily browsing.

---

## Features

- **Select-to-translate** — Highlight any text on any webpage for an Irish translation popup
- **Shadow DOM isolated popup** — Appears near your selection; never broken by host-page CSS
- **Word bank** — Save translations with one click; persisted locally in IndexedDB
- **Right-click menu** — Translate via the context menu as an alternative trigger
- **Settings page** — Configure your API key, region, auto-dismiss timing, and enable/disable globally
- **Translation cache** — Avoids re-fetching recently translated text (7-day TTL)
- **CSV export** — Export your entire word bank for Anki, Quizlet, or any flashcard tool
- **Ignores editable fields** — Never fires inside inputs, textareas, password fields, or rich-text editors

---

## Setup

### 1. Get a Microsoft Translator API key

1. Sign in to the [Azure portal](https://portal.azure.com)
2. Create a **Translator** resource under _Azure AI services_
3. Choose the **Free (F0)** tier — 2 million characters/month at no cost
4. Copy the **Key** and note the **Region** (e.g. `westeurope`)

> Irish (`ga`) is a supported language in Microsoft Translator.

### 2. Build the extension

```bash
npm install
npm run build
```

Output lands in `dist/`. The extension root is the project root (`c:\craicathon`).

For development with live rebuild:

```bash
npm run dev
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the project root folder (`c:\craicathon`)

### 4. Configure your API key

1. Click the **Cúpla Focal** toolbar icon
2. Click **⚙ Options** (or right-click the icon → _Options_)
3. Paste your **Microsoft Translator API key**
4. Set the **Azure Region** to match your resource
5. Click **Save Settings**

---

## Project Structure

```
craicathon/
├── manifest.json            # Chrome MV3 manifest
├── popup.html               # Toolbar action popup
├── options.html             # Settings & word bank page
├── icons/                   # Extension icons (16, 32, 48, 128px)
├── dist/                    # Webpack build output (gitignored)
│   ├── service-worker.js
│   ├── content-script.js
│   ├── popup.js
│   └── options.js
└── src/
    ├── background/
    │   └── service-worker.ts   # Translation API calls, persistence, context menu
    ├── content/
    │   ├── content-script.ts   # Selection detection, popup lifecycle
    │   └── popup-ui.ts         # Shadow DOM popup rendering
    ├── popup/
    │   └── popup.ts            # Toolbar popup logic
    ├── options/
    │   └── options.ts          # Settings + word bank UI logic
    └── lib/
        ├── types.ts            # Shared data types
        ├── messages.ts         # Typed runtime message schema
        ├── translation-provider.ts  # Microsoft Translator client
        └── storage.ts          # chrome.storage.sync + IndexedDB wrappers
```

---

## Translation provider

The extension calls the **Microsoft Translator v3 REST API** from the background service worker. Translation requests are never made from the content script to avoid CORS issues. The provider abstraction (`src/lib/translation-provider.ts`) is designed so an alternative provider can be substituted without touching the rest of the extension.

Text is capped at **500 characters** per request to avoid unexpected API charges.

---

## Word Bank

Saved words are stored in **IndexedDB** (local to the browser profile). They survive browser restarts and extension updates. The settings page lets you:

- View all saved words in a table
- Delete individual entries
- Clear the entire word bank
- Export as **CSV** compatible with Anki / Quizlet

---

## Permissions

| Permission                   | Why                                                    |
| ---------------------------- | ------------------------------------------------------ |
| `storage`                    | Sync settings across devices via `chrome.storage.sync` |
| `contextMenus`               | Add "Translate to Irish" to the right-click menu       |
| `<all_urls>` host permission | Inject content script on all pages                     |

No browsing history is stored. Translation requests go only to Microsoft Translator (or your configured provider).

---

## Development

```bash
npm run dev          # Watch mode build
npm run type-check   # TypeScript check without emitting
npm run lint         # ESLint
npm run build        # Production bundle
```

---

## Roadmap

- [ ] Hover-triggered translation (optional mode)
- [ ] Pronunciation audio via text-to-speech
- [ ] Flashcard review mode in the word bank
- [ ] Firefox / cross-browser packaging
- [ ] Local-only mode (no external requests; smaller dictionary)
