import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGE_FILES = [
  'pages/index/index.ink',
  'pages/run_hud/index.ink',
  'pages/bluetooth/index.ink',
  'pages/settings/index.ink',
  'pages/coach/index.ink',
];

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const NAMED_COLOR_BLACKLIST = /\b(red|blue|orange|yellow|purple|pink|cyan|magenta)\b/i;

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function check(label, ok, detail) {
  const mark = ok ? 'OK' : 'MISS';
  console.log(`${mark} ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
}

function readPackageJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (_e) {
    return null;
  }
}

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (_e) {
    return null;
  }
}

function listPreviewHtml() {
  const dir = path.join(ROOT, 'preview');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => `preview/${name}`);
}

// Design constraint: no emoji anywhere in page markup or HTML previews.
function scanEmoji() {
  const offenders = [];
  for (const rel of [...PAGE_FILES, ...listPreviewHtml()]) {
    const text = readText(rel);
    if (text !== null && EMOJI_PATTERN.test(text)) offenders.push(rel);
  }
  return offenders;
}

// Design constraint: single green accent. Grayscale (r == g == b) and
// green-dominant (g strictly greater than both r and b) colors are allowed.
function isAllowedRgb(r, g, b) {
  if (r === g && g === b) return true;
  return g > r && g > b;
}

function parseHexColor(hex) {
  const digits = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

function scanStyleColors() {
  const offenders = [];
  for (const rel of PAGE_FILES) {
    const text = readText(rel);
    if (text === null) continue;
    for (const styleMatch of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      const css = styleMatch[1];
      for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
        const [r, g, b] = parseHexColor(m[1]);
        if (!isAllowedRgb(r, g, b)) offenders.push(`${rel}: ${m[0]}`);
      }
      for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
        if (!isAllowedRgb(Number(m[1]), Number(m[2]), Number(m[3]))) {
          offenders.push(`${rel}: ${m[0]})`);
        }
      }
      const named = css.match(NAMED_COLOR_BLACKLIST);
      if (named) offenders.push(`${rel}: named color "${named[0]}"`);
    }
  }
  return offenders;
}

const pkg = readPackageJson('package.json') || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const zip = spawnSync('zip', ['-v'], { cwd: ROOT, stdio: 'ignore' });
const missingPages = PAGE_FILES.filter((rel) => !exists(rel));
const emojiOffenders = scanEmoji();
const colorOffenders = scanStyleColors();

const checks = [
  check('AIUI manifest', exists('AGENTS.md') && exists('app.json') && exists('app.js')),
  check('AIUI pages', missingPages.length === 0,
    missingPages.length ? `missing ${missingPages.join(', ')}` : `${PAGE_FILES.length} pages present`),
  check('create-aiui-agent CLI', exists('node_modules/.bin/create-aiui-agent'),
    deps['@yodaos-pkg/create-aiui-agent'] || 'not installed'),
  check('AIX reader package', exists('node_modules/@yodaos-pkg/aix/index.js'),
    deps['@yodaos-pkg/aix'] || 'not installed'),
  check('zip command', !zip.error && zip.status === 0, 'used by local source .aix pack'),
  check('no emoji glyphs', emojiOffenders.length === 0,
    emojiOffenders.length ? emojiOffenders.join(', ') : 'pages and previews scanned'),
  check('single green palette', colorOffenders.length === 0,
    colorOffenders.length ? colorOffenders.join('; ') : 'grayscale and green-dominant colors only'),
];

console.log('');
console.log('AIUI workflow notes:');
console.log('- npm run build:local creates a source .aix and verifies it with @yodaos-pkg/aix.');
console.log('- Official signing, final packaging, and upload remain in AIUI Studio.');
console.log('- EverMind credentials and storage routing are backend configuration, not app secrets.');

if (checks.some((ok) => !ok)) process.exit(1);
