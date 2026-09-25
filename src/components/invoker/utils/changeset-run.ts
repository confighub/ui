// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Encoding helpers for initiative-owned ChangeSets.
 *
 *  Each initiative invocation creates its own ChangeSet, labeled with
 *  `initiative: init<32hex>` so all CSes belonging to the same initiative
 *  can be fetched in one `listAllChangeSets` query. Slugs are prefixed
 *  the same way so they're human-inspectable and unique per space. */

const INITIATIVE_PREFIX = 'init';
const INITIATIVE_HEX_RE = /^init([0-9a-f]{32})$/;

export const INITIATIVE_LABEL_KEY = 'initiative';
export const INVOCATION_ANNOTATION_KEY = 'invocation';
export const UNDOES_CHANGESET_LABEL_KEY = 'undoesChangeSet';
export const IS_UNDO_LABEL_KEY = 'isUndo';

export const initiativeToLabel = (initiativeId: string): string =>
  `${INITIATIVE_PREFIX}${initiativeId.replace(/-/g, '').toLowerCase()}`;

export const labelToInitiativeId = (label: string | undefined): string | null => {
  const match = label?.toLowerCase().match(INITIATIVE_HEX_RE);
  if (!match) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Mints a URL-safe, cryptographically unique per-space ChangeSet slug. */
export const mintChangeSetSlug = (initiativeId: string): string => {
  const label = initiativeToLabel(initiativeId);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${label}-${rand}`;
};
