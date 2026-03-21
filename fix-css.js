const fs = require('fs');
let c = fs.readFileSync('src/content/popup-ui.ts', 'utf8');

// 1. Rename the .cf-insights block → .cf-example and improve .cf-meta / .cf-pron
// Find the start of ".cf-insights {"
const insightsStart = c.indexOf('  .cf-insights {');
// Find the end of .cf-example-ga block (right before "/* -- Loading -- */")
const loadingCommentIdx = c.indexOf('  .cf-loading {');
if (insightsStart < 0 || loadingCommentIdx < 0) {
  console.error('Could not find CSS boundaries');
  console.log('insightsStart:', insightsStart, 'loadingCommentIdx:', loadingCommentIdx);
  process.exit(1);
}

// Get the old CSS block
const oldCss = c.substring(insightsStart, loadingCommentIdx);
console.log('Old CSS block (first 100 chars):', JSON.stringify(oldCss.substring(0, 100)));

// Build the new CSS block
const newCss = `  .cf-example {
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--example-bg);
    border: 1px solid var(--example-border);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
  }

  .cf-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    margin-bottom: 2px;
    flex-wrap: wrap;
  }

  .cf-pron {
    font-style: italic;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .cf-meta-sep { color: var(--text-light); }

  .cf-word-type-badge {
    background: var(--accent-subtle);
    color: var(--accent-subtle-text);
    border-radius: 20px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 600;
  }

  .cf-same-word {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
  }

  .cf-example-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--example-label);
    margin-bottom: 4px;
  }

  .cf-example-en {
    color: var(--text-muted);
    margin-bottom: 2px;
  }

  .cf-example-ga {
    color: var(--example-text);
    font-weight: 500;
  }

  `;

c = c.substring(0, insightsStart) + newCss + c.substring(loadingCommentIdx);
fs.writeFileSync('src/content/popup-ui.ts', c, 'utf8');
console.log('CSS fixed. Replaced', oldCss.length, 'chars with', newCss.length, 'chars');
