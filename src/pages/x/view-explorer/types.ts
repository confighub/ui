// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Small helpers the View Explorer shares with the WHERE editor (which the
 * resource explorer also uses) and with the row drawer.
 */

export { LABEL_PREFIX, getGroupByColumns } from '@/components/group-nav/types';

/** Derive a URL-safe slug from a display name */
export function slugFromDisplayName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
