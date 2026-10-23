// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether two UpdatedAt values are the same moment. A write answers with the
 * server's clock to the nanosecond; a read gives what the database stored, to
 * the microsecond. Compared as text, a view would look changed by someone
 * else right after this page saved it.
 */
export function sameInstant(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return a === b;
  const x = instantParts(a);
  const y = instantParts(b);
  if (!x || !y) return a === b;
  // Under a microsecond apart: the database rounds or cuts the server's nanoseconds; a real change is far later.
  return Math.abs((x.seconds - y.seconds) * 1e9 + (x.nanos - y.nanos)) < 1000;
}

/** Whole seconds since the epoch and the nanoseconds within the second; null when it is not a time. */
function instantParts(ts: string): { seconds: number; nanos: number } | null {
  const m = /^(.*?T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(ts);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}${m[3] ?? 'Z'}`);
  if (Number.isNaN(ms)) return null;
  return { seconds: ms / 1000, nanos: Number((m[2] ?? '').padEnd(9, '0').slice(0, 9)) };
}
