// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Archive only the verified files from a sealed bundle, plus its manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const output = resolve(process.argv[3] || 'release/confighub-plugin-ui.tar.gz');
if (!relative(root, output).startsWith(`..${sep}`))
  throw new Error('Archive must be outside the bundle');
if ((await lstat(root)).isSymbolicLink()) throw new Error('Bundle root cannot be a symlink');
const manifestName = 'plugin-ui-manifest.json';
const manifest = JSON.parse(await readFile(join(root, manifestName), 'utf8'));
if (manifest.apiVersion !== 'confighub.com/ui-bundle/v1' || !manifest.files?.['index.html'])
  throw new Error('Invalid bundle manifest');
const names = [...Object.keys(manifest.files), manifestName].sort();
for (const name of names) {
  if (
    !name ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw new Error(`Unsafe bundle path: ${name}`);
  let current = root;
  for (const part of name.split('/')) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink: ${name}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Not a file: ${name}`);
  if (name !== manifestName) {
    const digest = createHash('sha256')
      .update(await readFile(current))
      .digest('hex');
    if (digest !== manifest.files[name]) throw new Error(`Checksum mismatch: ${name}`);
  }
}
await mkdir(dirname(output), { recursive: true });
execFileSync('tar', ['-czf', output, '-C', root, '--', ...names], {
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
const digest = createHash('sha256')
  .update(await readFile(output))
  .digest('hex');
await writeFile(`${output}.sha256`, `${digest}  ${basename(output)}\n`);
console.log(`${output}\nSHA-256 ${digest}`);
