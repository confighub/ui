// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedUnitRead } from '@confighub/rtk-query';

/**
 * What each compared Unit is called above its column. The label names only
 * what tells the Units apart: the same Unit in several Spaces is named by its
 * Space, several Units of one Space by their slugs, and anything else by both,
 * slug first, so a cut label loses the Space and never the slug.
 */

const slugOf = (row: ExtendedUnitRead) => row.Unit?.Slug ?? '';
const spaceOf = (row: ExtendedUnitRead) => row.Space?.Slug ?? '';

export function slugsDiffer(rows: readonly ExtendedUnitRead[]): boolean {
  return new Set(rows.map(slugOf)).size > 1;
}

export function columnLabels(rows: readonly ExtendedUnitRead[]): string[] {
  if (!slugsDiffer(rows)) return rows.map(spaceOf);
  if (new Set(rows.map(spaceOf)).size === 1) return rows.map(slugOf);
  return rows.map((r) => `${slugOf(r)} · ${spaceOf(r)}`);
}

/**
 * The line under a slot's slug, in two parts: where the Unit is ("prod-temporal
 * · k8s-prod", or the Space alone when it has no Target), and its revision
 * ("rev 34"), which a slot never cuts.
 */
export function slotMeta(row: ExtendedUnitRead): { place: string; rev: string } {
  const place = [spaceOf(row), row.Target?.Slug].filter(Boolean).join(' · ');
  return { place, rev: `rev ${row.Unit?.HeadRevisionNum ?? 0}` };
}
