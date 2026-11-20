// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The server's own suffix on a description, naming the functions that made the Revision. */
const FUNCTIONS_SUFFIX = /\s*\|\s*Functions:.*$/s;

/** The author's words: the description without the suffix the server adds for the functions it ran. */
export function authoredDescription(description: string | undefined): string {
  return (description ?? '').replace(FUNCTIONS_SUFFIX, '').trim();
}
