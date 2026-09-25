// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Shared helpers for presenting component field values. Kept in a leaf module so
// both ComponentValuesSection and InspectPanel can use them without a cycle.

/** Placeholder string for an absent current value (present upstream, absent downstream). */
export const ABSENT = '—';

/** Label rendered (in italics) for any empty/absent/removed value slot. */
export const NO_VALUE_LABEL = 'no value';

/**
 * Whether an upgrade/variation field value represents an upstream REMOVAL of the
 * field. computeFieldDiffs emits the '-' absence sentinel when a path is absent
 * from the post-upgrade (dry-run) data, but some toolchains (e.g. Kubernetes with
 * a normalize step) instead emit an empty string '' for a removed annotation/key.
 * Treat both as a removal so the current value renders struck-through. `undefined`
 * (no diff for this path) is NOT a removal.
 */
export function isRemovalSentinel(value: string | undefined): boolean {
  return value === '-' || value === '';
}

/**
 * Whether a value slot should render as the italic "no value" label rather than a
 * blank pill or a raw dash. Covers: undefined (no value), empty string, the
 * '-'/'' removal sentinels, and the ABSENT placeholder. Ensures no literal dash
 * or empty pill ever reaches the user.
 */
export function isEmptyValue(value: string | undefined): boolean {
  return value == null || isRemovalSentinel(value) || value === ABSENT;
}

/**
 * Whether a unit's toolchain routes field writes through the SERVER's
 * `set-attributes` function (which honours a per-resource scope) rather than the
 * client-side whole-Data rewrite in `setValueAtPath`.
 *
 * This lives here, in a leaf module, because it gates two very different callers:
 * `useSetAttributesMutation` picks the write mechanism with it, and the values
 * treeview uses it to decide whether an add inside a multi-document unit can be
 * pinned to ONE document. `setValueAtPath` resolves a multi-document unit by
 * last-write-wins, so when this is false there is no way to aim a write at a
 * specific document and the wrapper-scoped add actions must stay disabled.
 */
export function isYamlToolchain(toolchainType: string | undefined): boolean {
  return !!toolchainType && toolchainType.toUpperCase().includes('YAML');
}
