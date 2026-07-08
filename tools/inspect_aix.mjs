import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(ROOT, process.argv[2] || 'release/AISmartRun-current.aix');
const AIX_WEB = pathToFileURL(path.join(ROOT, 'node_modules/@yodaos-pkg/aix/pkg/aix_web.js')).href;
const WASM_PATH = path.join(ROOT, 'node_modules/@yodaos-pkg/aix/pkg/aix_web_bg.wasm');

const REQUIRED_FILES = [
  'AGENTS.md',
  'app.json',
  'package.json',
  'pages/index/index.ink',
  'pages/run_hud/index.ink',
  'pages/bluetooth/index.ink',
  'pages/settings/index.ink',
  'pages/coach/index.ink',
];

const FORBIDDEN_FILES = [
  'PROGRESS.md',
  'DEVICES.md',
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let aixModule;
try {
  aixModule = await import(AIX_WEB);
} catch (error) {
  fail(`Unable to load @yodaos-pkg/aix reader: ${error.message}`);
}

const { default: init, AixReaderWasm } = aixModule;
await init({ module_or_path: await fs.readFile(WASM_PATH) });

const reader = new AixReaderWasm(new Uint8Array(await fs.readFile(TARGET)));
const entries = reader.list();
const names = new Set(entries.map((entry) => entry.name));
const missing = REQUIRED_FILES.filter((name) => !names.has(name));
if (missing.length) fail(`AIX package is missing: ${missing.join(', ')}`);

const forbidden = FORBIDDEN_FILES.filter((name) => names.has(name));
if (forbidden.length) {
  fail(`AIX package leaks internal files: ${forbidden.join(', ')}`);
}

let packagedAppJson;
try {
  packagedAppJson = JSON.parse(new TextDecoder().decode(reader.read_file('app.json')));
} catch (error) {
  fail(`Unable to parse app.json inside the AIX package: ${error.message}`);
}
let repoAppJson;
try {
  repoAppJson = JSON.parse(await fs.readFile(path.join(ROOT, 'app.json'), 'utf8'));
} catch (error) {
  fail(`Unable to parse repository app.json: ${error.message}`);
}
const packagedPages = JSON.stringify(packagedAppJson.pages || []);
const repoPages = JSON.stringify(repoAppJson.pages || []);
if (packagedPages !== repoPages) {
  fail(`AIX app.json pages mismatch: package has ${packagedPages}, repository has ${repoPages}`);
}

const expectedVersion = (await fs.readFile(path.join(ROOT, 'VERSION'), 'utf8')).trim();
const packagedVersion = (reader.get_version() || '').trim();
if (packagedVersion !== expectedVersion) {
  fail(`AIX version mismatch: package reports "${packagedVersion}", VERSION file says "${expectedVersion}"`);
}

const pages = reader.get_pages();
const tools = reader.get_tools();

console.log(`AIX OK: ${path.relative(ROOT, TARGET)}`);
console.log(`title: ${reader.get_title() || '(none)'}`);
console.log(`version: ${packagedVersion || '(none)'}`);
console.log(`entries: ${entries.length}`);
console.log(`pages: ${pages.map((page) => page.name).join(', ')}`);
console.log(`tools: ${tools.length}`);
