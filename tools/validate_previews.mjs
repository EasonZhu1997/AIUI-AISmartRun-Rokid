import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(errors, message) {
  errors.push(message);
  console.error(`MISS ${message}`);
}

function checkPng(errors, rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(errors, `${rel} missing`);
    return;
  }
  const stat = fs.statSync(abs);
  if (stat.size < 20_000) fail(errors, `${rel} is too small to be a useful preview (${stat.size} bytes)`);
  const head = fs.readFileSync(abs).subarray(0, PNG_SIGNATURE.length);
  if (!head.equals(PNG_SIGNATURE)) fail(errors, `${rel} is not a PNG file`);
}

const errors = [];
const htmlFiles = fs.readdirSync(PREVIEW_DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

if (!htmlFiles.length) fail(errors, 'preview/*.html missing');

for (const name of htmlFiles) {
  const rel = `preview/${name}`;
  const text = fs.readFileSync(path.join(PREVIEW_DIR, name), 'utf8');
  const pngRel = `preview/${name.replace(/\.html$/, '.png')}`;

  if (/\b448px\b|\b352px\b/.test(text)) {
    fail(errors, `${rel} still references the old 448px/352px preview dimensions`);
  }
  if (!/\b480px\b/.test(text)) {
    fail(errors, `${rel} should include the current 480px AIUI card width`);
  }
  if (/\p{Extended_Pictographic}/u.test(text)) {
    fail(errors, `${rel} contains emoji characters (design constraint: no emoji)`);
  }
  checkPng(errors, pngRel);
}

if (errors.length) {
  console.error(`\nPreview validation failed: ${errors.length} issue(s).`);
  process.exit(1);
}

console.log(`OK preview validation - ${htmlFiles.length} HTML previews and PNG captures checked.`);
