import { access } from 'node:fs/promises';
import path from 'node:path';

const required = [
  'apps',
  'engines',
  'services',
  'packages',
  'sdk',
  'openapi',
  'tests',
  'docs',
  'scripts',
  '.github',
];

const missing = [];

for (const dir of required) {
  try {
    await access(path.resolve(dir));
  } catch {
    missing.push(dir);
  }
}

if (missing.length > 0) {
  console.error(`Missing required directories: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Platform structure: ok');
}
