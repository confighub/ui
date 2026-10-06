// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `shellQuoteArg` quotes a command argument for a POSIX shell with the rule
// `cub` uses for the commands it prints.

import { expect, test } from '@playwright/test';

import { shellQuoteArg } from '../src/utility/shell-quote';

test.describe('shellQuoteArg', () => {
  test('plain characters stay bare', () => {
    for (const arg of ['team-a', 'Owner=team-a', 'a_b.c/d:e@f+g,h', 'ABC123']) {
      expect(shellQuoteArg(arg), arg).toBe(arg);
    }
  });

  test('any other value is put in single quotes', () => {
    expect(shellQuoteArg('Team A')).toBe("'Team A'");
    expect(shellQuoteArg('Owner=Team A')).toBe("'Owner=Team A'");
    expect(shellQuoteArg('$HOME')).toBe("'$HOME'");
    expect(shellQuoteArg('a;rm -rf x')).toBe("'a;rm -rf x'");
    expect(shellQuoteArg('a*b')).toBe("'a*b'");
  });

  test('the empty string is quoted, so it stays one argument', () => {
    expect(shellQuoteArg('')).toBe("''");
  });

  test("a single quote becomes '\\''", () => {
    expect(shellQuoteArg("o'brien")).toBe(`'o'\\''brien'`);
    expect(shellQuoteArg("'")).toBe(`''\\'''`);
  });
});
