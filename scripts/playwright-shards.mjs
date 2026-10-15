// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Splits the Playwright suite into shards of about equal running time.
//
// `playwright test --shard=i/n` gives each shard the same number of tests, taken
// in file order. The tests are far from equal in cost, so the slow files that
// sort together end up in one shard, and the whole run waits for it. This
// assigns whole spec files to shards by their measured running time instead.
// A file is never split: specs depend on data an earlier test in the same file
// created, so a file has to run whole, in one shard, in declaration order.
//
// Run from ui/:
//
//   node scripts/playwright-shards.mjs plan 4
//       Print each of 4 shards' files and predicted running time.
//   node scripts/playwright-shards.mjs list 2/4 <file>
//       Write shard 2 of 4 to <file>, for `playwright test --test-list <file>`.
//   node scripts/playwright-shards.mjs timings <report.json>...
//       Refresh playwright-shard-timings.json from Playwright JSON reports of
//       full runs (several are averaged).
//
// The timings only steer the split; they never decide what runs. Every file
// `playwright test --list` finds is assigned to exactly one shard, a file with
// no timing yet gets DEFAULT_SECONDS, and a timing for a deleted file is
// ignored. Both commands check that Playwright reads each shard's list back as
// exactly the files assigned to it, and fail otherwise.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMINGS_PATH = join(UI_DIR, 'scripts', 'playwright-shard-timings.json');

// Each shard has to compute the same split on its own, so nothing here may
// depend on the machine: this is the worker count of a CI shard (two CPUs,
// workers: '100%' in playwright.config.ts), fixed rather than read from os.cpus().
const WORKERS_PER_SHARD = 2;

// About the mean of the browser specs that have a timing.
const DEFAULT_SECONDS = 30;

function fail(message) {
  console.error(`playwright-shards: ${message}`);
  process.exit(1);
}

/** Runs `playwright test --list` and returns the spec files, relative to testDir, in run order. */
function listSpecFiles(extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), 'playwright-shards-'));
  const output = join(dir, 'list.json');
  try {
    execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json', ...extraArgs], {
      cwd: UI_DIR,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: output },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const report = JSON.parse(readFileSync(output, 'utf8'));
    if (report.errors?.length) {
      fail(
        `playwright test --list reported errors:\n${report.errors.map((e) => e.message).join('\n')}`,
      );
    }
    return report.suites.map((suite) => suite.file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readTimings() {
  return JSON.parse(readFileSync(TIMINGS_PATH, 'utf8'));
}

/**
 * Predicts how long a shard runs. Playwright hands the shard's files, in run
 * order, to whichever worker is free next, so a slow file that sorts late
 * starts late. Simulating that, rather than summing, keeps a slow file from
 * landing at the end of a busy shard.
 */
function predictSeconds(files, seconds) {
  const busyUntil = new Array(WORKERS_PER_SHARD).fill(0);
  for (const file of files) {
    const next = busyUntil.indexOf(Math.min(...busyUntil));
    busyUntil[next] += seconds(file);
  }
  return Math.max(...busyUntil);
}

/**
 * Assigns each file to one of `total` shards: the costliest first, each to the
 * shard whose predicted time it raises least. Deterministic, so every shard
 * computes the same split.
 */
function pack(files, total, timings) {
  const order = new Map(files.map((file, index) => [file, index]));
  const seconds = (file) => timings[file] ?? DEFAULT_SECONDS;
  const byCost = [...files].sort(
    (a, b) => seconds(b) - seconds(a) || order.get(a) - order.get(b),
  );

  let shards = Array.from({ length: total }, () => []);
  for (const file of byCost) {
    let best;
    for (let i = 0; i < total; i++) {
      const candidate = [...shards[i], file].sort((a, b) => order.get(a) - order.get(b));
      const predicted = predictSeconds(candidate, seconds);
      const sum = candidate.reduce((acc, f) => acc + seconds(f), 0);
      if (
        !best ||
        predicted < best.predicted ||
        (predicted === best.predicted && sum < best.sum)
      ) {
        best = { index: i, candidate, predicted, sum };
      }
    }
    shards = shards.map((shard, i) => (i === best.index ? best.candidate : shard));
  }

  const assigned = shards.flat();
  if (assigned.length !== files.length || new Set(assigned).size !== files.length) {
    fail(`the split assigns ${assigned.length} files for ${files.length} spec files`);
  }
  return shards.map((shardFiles) => ({
    files: shardFiles,
    predicted: predictSeconds(shardFiles, seconds),
  }));
}

/** Fails unless Playwright reads `listPath` as exactly `expected`. */
function verifyTestList(listPath, expected, label) {
  const actual = listSpecFiles(['--test-list', listPath]);
  const missing = expected.filter((file) => !actual.includes(file));
  const extra = actual.filter((file) => !expected.includes(file));
  if (missing.length || extra.length) {
    fail(
      `${label}: Playwright does not read its test list as assigned. Missing: [${missing}]. Extra: [${extra}]`,
    );
  }
}

function parseShard(arg) {
  const match = /^(\d+)\/(\d+)$/.exec(arg ?? '');
  const current = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || current < 1 || current > total)
    fail(`expected a shard like 2/4, got "${arg}"`);
  return { current, total };
}

function summary(shards) {
  return shards
    .map(
      ({ files, predicted }, i) =>
        `shard ${i + 1}: ${files.length} files, predicted ${Math.round(predicted)}s`,
    )
    .join('\n');
}

function plan(totalArg) {
  const total = Number(totalArg);
  if (!Number.isInteger(total) || total < 1) fail(`expected a shard count, got "${totalArg}"`);
  const files = listSpecFiles();
  const shards = pack(files, total, readTimings());
  const dir = mkdtempSync(join(tmpdir(), 'playwright-shards-'));
  try {
    shards.forEach(({ files: shardFiles, predicted }, i) => {
      const listPath = join(dir, `shard-${i + 1}.txt`);
      writeFileSync(listPath, shardFiles.join('\n') + '\n');
      verifyTestList(listPath, shardFiles, `shard ${i + 1}`);
      console.log(`shard ${i + 1}/${total}: predicted ${Math.round(predicted)}s`);
      for (const file of shardFiles) console.log(`  ${file}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    `\n${summary(shards)}\nall ${files.length} spec files assigned, each to one shard`,
  );
}

function list(shardArg, listPath) {
  const { current, total } = parseShard(shardArg);
  if (!listPath) fail('expected a file to write the test list to');
  const files = listSpecFiles();
  const shards = pack(files, total, readTimings());
  const mine = shards[current - 1].files;
  writeFileSync(listPath, mine.join('\n') + '\n');
  verifyTestList(listPath, mine, `shard ${current}`);
  console.log(summary(shards));
  console.log(`shard ${current}/${total} runs ${mine.length} of ${files.length} spec files:`);
  for (const file of mine) console.log(`  ${file}`);
}

/** Sums every result's duration, retries included, under the spec file it belongs to. */
function secondsByFile(report) {
  const totals = {};
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          totals[file] = (totals[file] ?? 0) + result.duration / 1000;
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return totals;
}

function timings(reportPaths) {
  if (!reportPaths.length) fail('expected one or more Playwright JSON reports');
  const measured = reportPaths.map((path) =>
    secondsByFile(JSON.parse(readFileSync(path, 'utf8'))),
  );
  const files = listSpecFiles();
  const previous = readTimings();
  const next = {};
  for (const file of [...files].sort()) {
    const samples = measured.map((m) => m[file]).filter((s) => s !== undefined);
    if (samples.length) {
      next[file] = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
    } else if (previous[file] !== undefined) {
      next[file] = previous[file];
    }
  }
  writeFileSync(TIMINGS_PATH, JSON.stringify(next, null, 2) + '\n');
  const fresh = files.filter((file) => measured.some((m) => m[file] !== undefined)).length;
  console.log(
    `wrote ${Object.keys(next).length} timings (${fresh} measured) to ${TIMINGS_PATH}`,
  );
}

const [command, ...args] = process.argv.slice(2);
if (command === 'plan') plan(args[0]);
else if (command === 'list') list(args[0], args[1]);
else if (command === 'timings') timings(args);
else
  fail('usage: playwright-shards.mjs plan <n> | list <i/n> <file> | timings <report.json>...');
