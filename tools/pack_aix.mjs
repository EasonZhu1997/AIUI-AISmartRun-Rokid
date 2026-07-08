import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'release/AISmartRun-current.aix');
const TMP = path.resolve(ROOT, 'release/.AISmartRun-current.aix.tmp');

const PACKAGE_ENTRIES = [
  'assets',
  'lib',
  'pages',
  'AGENTS.md',
  'app.js',
  'app.json',
  'package.json',
  'VERSION',
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const entry of PACKAGE_ENTRIES) {
  if (!fs.existsSync(path.join(ROOT, entry))) {
    fail(`Missing package entry: ${entry}`);
  }
}

const zipCheck = spawnSync('zip', ['-v'], { cwd: ROOT, stdio: 'ignore' });
if (zipCheck.error || zipCheck.status !== 0) {
  fail('Missing zip command. Install Info-ZIP or use the official AIUI packer when available.');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
try {
  fs.rmSync(TMP, { force: true });
} catch {
  // Ignore stale temp cleanup failures; the next zip step will surface real errors.
}

const result = spawnSync('zip', ['-q', '-X', '-r', TMP, ...PACKAGE_ENTRIES], {
  cwd: ROOT,
  stdio: 'inherit',
});

if (result.error) fail(result.error.message);
if (result.status !== 0) fail(`zip failed with exit code ${result.status}`);

fs.renameSync(TMP, OUT);
fs.chmodSync(OUT, 0o664);

const sizeKb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`Packed ${path.relative(ROOT, OUT)} (${sizeKb} KB)`);
