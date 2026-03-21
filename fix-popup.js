const fs = require('fs');
const c = fs.readFileSync('src/content/popup-ui.ts', 'utf8');
const start = c.indexOf('      } else {\r\n        // Placeholder');
const end = c.indexOf('    }\r\n\r\n    const truncatedNote', start);
if (start < 0 || end < 0) { console.log('NOT FOUND start=' + start + ' end=' + end); process.exit(1); }
const before = c.substring(0, start);
const after = c.substring(end);
const replacement = [
  '      } else {',
  '        // Empty slot filled asynchronously \u2014 no spinner',
  "        insightsHtml = `<div class=\"cf-insights-slot\"></div>`;",
  '      }',
  '    }'
].join('\r\n');
const result = before + replacement + after;
fs.writeFileSync('src/content/popup-ui.ts', result, 'utf8');
console.log('Done. Replaced ' + (end - start) + ' chars with ' + replacement.length + ' chars');
