import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const steps = [
  ['AIUI doctor', ['npm', 'run', 'doctor:aiui']],
  ['Preview validation', ['npm', 'run', 'preview:check']],
  ['Unit and metadata tests', ['npm', 'run', 'test']],
  ['Local AIX build', ['npm', 'run', 'build']],
];

for (const [label, command] of steps) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`\n${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n${label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\nOK release verification - doctor, previews, tests and local AIX build passed.');
