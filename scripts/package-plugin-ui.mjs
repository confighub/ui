// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Seal an already-built UI directory for the optional local plugin launcher.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = {};
async function scan(dir) {
  for (const entry of (await readdir(dir)).sort()) {
    const path = join(dir, entry);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Symlink not allowed: ${path}`);
    if (info.isDirectory()) {
      await scan(path);
      continue;
    }
    const key = relative(root, path).split('\\').join('/');
    if (key === 'plugin-ui-manifest.json') continue;
    if (!info.isFile()) throw new Error(`Not a file: ${key}`);
    files[key] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  }
}
await scan(root);
if (!files['index.html']) throw new Error('Build first: missing index.html');
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
await writeFile(
  join(root, 'plugin-ui-manifest.json'),
  JSON.stringify(
    {
      apiVersion: 'confighub.com/ui-bundle/v1',
      version: `${source.slice(0, 12)}-${digest.slice(0, 12)}`,
      files,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Sealed ${Object.keys(files).length} files: ${source.slice(0, 12)}-${digest.slice(0, 12)}`,
);
