// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a Space is called to a reader.
 */

/**
 * A component is the set of Spaces sharing a Component label value, so a Space
 * belongs to exactly one here.
 */
/**
 * What a Space is called to a reader. The CLI resolves a Stage's Spaces and then
 * presents them by their `Variant` label, falling back to the Space slug when
 * there is none (`public/cmd/cub/changeorder_get.go:115-128`). Same rule here,
 * fallback and all.
 */
interface Nameable {
  slug: string;
  labels: Record<string, string>;
}

/**
 * ⚠️ EXPECTS A NORMALISED ROW. 21 of 410 real Spaces store `labels` as JSON
 * `null` rather than an empty object, so indexing a RAW Space throws on about
 * five percent of them. Every row the data layer hands over has `?? {}` applied
 * at the boundary, which is the only reason this is safe -- the safety is the
 * boundary's, not this function's. Anything reusing it from elsewhere in the app
 * has to normalise first.
 */
export function variantName(sp: Nameable): string {
  return sp.labels.Variant || sp.slug;
}

export function hasVariantLabel(sp: Nameable): boolean {
  return Boolean(sp.labels.Variant);
}
