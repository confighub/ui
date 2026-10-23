// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Word-prefix matching for finding a view by name: every typed word must be
 * the start of a word of the name ("pay pro" finds "Payments in prod",
 * "ments" does not). Words are split on anything that is not a letter or a
 * digit; case is ignored.
 */
export function matchesWordPrefixes(name: string, query: string): boolean {
  const typed = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!typed.length) return true;
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return typed.every((t) => words.some((w) => w.startsWith(t)));
}
