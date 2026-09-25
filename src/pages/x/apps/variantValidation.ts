// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedSpaceRead } from '@confighub/rtk-query';

import { LABEL_VARIANT } from './componentData';

// ============================================================================
// SLUG SANITIZATION
// ============================================================================

/**
 * Convert a variant name into its best-effort slug segment for the preview.
 *
 * The server derives the authoritative slug; this is a cosmetic preview only.
 * Rules:
 *   1. Trim leading/trailing whitespace
 *   2. Lowercase
 *   3. Replace any run of characters that are not alphanumeric or hyphens with a
 *      single hyphen
 *   4. Strip leading/trailing hyphens
 */
export function sanitizeVariantSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// SIBLING VARIANT NAMES
// ============================================================================

/**
 * Derive the variant names already present in the component from the raw
 * `ExtendedSpaceRead[]` list.
 *
 * `ComponentDeployment.displayName` conflates the `Variant` label with the
 * Space slug fallback, so it cannot be used reliably here.  The raw
 * `Space.Labels['Variant']` is the canonical source and is present on all
 * spaces built by `buildComponentData`.
 *
 * Returns only truthy, non-blank label values (spaces without the `Variant`
 * label are skipped).
 */
export function getSiblingVariantNames(spaces: ExtendedSpaceRead[]): string[] {
  const names: string[] = [];
  for (const s of spaces) {
    const variant = s.Space?.Labels?.[LABEL_VARIANT];
    if (variant?.trim()) {
      names.push(variant.trim());
    }
  }
  return names;
}

// ============================================================================
// VALIDATION
// ============================================================================

export type VariantNameError = 'required' | 'duplicate' | 'invalid';

export interface VariantNameValidationResult {
  ok: boolean;
  error?: VariantNameError;
}

/**
 * Validate a proposed variant name against a list of existing sibling names.
 *
 * Checks (in order):
 *   1. `required`  — the trimmed name is empty / whitespace-only.
 *   2. `invalid`   — the name sanitizes to an empty slug (e.g. all special chars).
 *   3. `duplicate` — case-insensitive slug collision with an existing sibling.
 *
 * Collision detection is slug-based so that names differing only in case or
 * special-character style (e.g. "Prod" vs "prod" vs "prod!") are treated as
 * duplicates.
 */
export function validateVariantName(
  name: string,
  siblings: string[],
): VariantNameValidationResult {
  if (!name.trim()) {
    return { ok: false, error: 'required' };
  }

  const slug = sanitizeVariantSlug(name);
  if (!slug) {
    return { ok: false, error: 'invalid' };
  }

  const siblingSlugSet = new Set(siblings.map((s) => sanitizeVariantSlug(s)));
  if (siblingSlugSet.has(slug)) {
    return { ok: false, error: 'duplicate' };
  }

  return { ok: true };
}
