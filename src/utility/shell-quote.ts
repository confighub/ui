// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Characters a POSIX shell reads as part of a word, with no quotes. */
const PLAIN_ARG = /^[A-Za-z0-9\-_.=/:@+,]+$/;

/**
 * Quotes `arg` for a POSIX shell, so a command shown to the user can be
 * pasted as it is. A value of plain characters stays bare. Any other value,
 * the empty string too, is put in single quotes, and each `'` in it becomes
 * `'\''`. `cub` quotes the commands it prints with the same rule.
 */
export function shellQuoteArg(arg: string): string {
  if (PLAIN_ARG.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
