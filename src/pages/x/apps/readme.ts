// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The slug of the Unit the Readme tab shows. Upload names it after the file. */
export const README_UNIT_SLUG = 'README.md';

// An AppConfig/Text Unit keeps its ConfigHub metadata in YAML frontmatter, which
// is not part of the document a reader wants.
const FRONT_MATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

/** The README's text without its frontmatter. */
export function readmeBody(data: string): string {
  return data.replace(FRONT_MATTER, '');
}
