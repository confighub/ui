import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('release archive contains the sealed bundle with an independently verifiable checksum', () => {
  const temp = mkdtempSync(join(tmpdir(), 'plugin-bundle-'));
  try {
    const root = join(temp, 'dist');
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<script src="/assets/app.js"></script>');
    writeFileSync(join(root, 'assets/app.js'), 'console.log("local")');
    execFileSync('node', ['scripts/package-plugin-ui.mjs', root]);
    const archive = join(temp, 'confighub-plugin-ui.tar.gz');
    execFileSync('node', ['scripts/archive-plugin-ui.mjs', root, archive]);
    const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
    expect(readFileSync(`${archive}.sha256`, 'utf8')).toBe(
      `${digest}  confighub-plugin-ui.tar.gz\n`,
    );
    expect(
      execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n'),
    ).toEqual(['assets/app.js', 'index.html', 'plugin-ui-manifest.json']);
    writeFileSync(join(root, 'assets/app.js'), 'tampered');
    expect(() =>
      execFileSync('node', ['scripts/archive-plugin-ui.mjs', root, archive], {
        stdio: 'pipe',
      }),
    ).toThrow();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('sealing refuses symlinks and missing entrypoints', () => {
  const temp = mkdtempSync(join(tmpdir(), 'plugin-bundle-'));
  try {
    expect(() =>
      execFileSync('node', ['scripts/package-plugin-ui.mjs', temp], { stdio: 'pipe' }),
    ).toThrow();
    writeFileSync(join(temp, 'index.html'), 'app');
    symlinkSync('index.html', join(temp, 'alias.html'));
    expect(() =>
      execFileSync('node', ['scripts/package-plugin-ui.mjs', temp], { stdio: 'pipe' }),
    ).toThrow();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
