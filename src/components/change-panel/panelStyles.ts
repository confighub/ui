// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Small style parts the change panel's components share. */
import { tokens } from '@/components/theme-provider/ThemeProvider';

export const monoSx = { fontFamily: tokens.fontMono } as const;
export const cutSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } as const;

/** "ghcr.io/confighubai/checko…d15d6c15b0f00a08": both ends of a long value stay readable. */
export function middleCut(value: string, head = 26, tail = 16): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
