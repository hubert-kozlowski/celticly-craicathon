// Generates simple placeholder PNG icons for the extension.
// Run with: node generate-icons.js
// Requires the 'canvas' npm package: npm install canvas --save-dev
// Alternatively, you can replace these with proper PNG files.

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background circle
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // "CF" text (Cúpla Focal)
  ctx.fillStyle = "#16c784";
  const fontSize = Math.max(5, Math.floor(size * 0.38));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(size >= 48 ? "CF" : "C", size / 2, size / 2 + 1);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
  console.log(`✓ icon${size}.png`);
}

console.log("Icons generated in icons/");
