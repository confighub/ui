// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Shared helpers for presenting component field values. Kept in a leaf module so
// both ComponentValuesSection and InspectPanel can use them without a cycle.

import type { LeafValueType } from './configParser';

/** Placeholder string for an absent current value (present upstream, absent downstream). */
export const ABSENT = '—';

/** Label rendered (in italics) for any empty/absent/removed value slot. */
export const NO_VALUE_LABEL = 'no value';

/**
 * Whether an upgrade/variation field value represents an upstream REMOVAL of the
 * field. The field diffs carry the '-' absence sentinel (`VALUE_PLACEHOLDER`) on the
 * side where a path is absent, but some toolchains (e.g. Kubernetes with a normalize
 * step) instead leave an empty string '' for a removed annotation/key.
 * Treat both as a removal so the current value renders struck-through. `undefined`
 * (no diff for this path) is NOT a removal.
 */
export function isRemovalSentinel(value: string | undefined): boolean {
  return value === '-' || value === '';
}

/**
 * Whether committing a value of the server's Diff removes the key. A value the Diff
 * gives carries its type, so `-` and `''` are values there: only a side with no value
 * (no type) is a removal. An empty string replacing a key the Unit holds still reads as a
 * removal, as {@link isRemovalSentinel} says; for a key the Unit does not hold, such as a
 * leaf of an element the upstream adds, `''` is the value to create. A value with no type
 * (from a Unit the tree reads as text) is read by its sentinel alone.
 */
export function isRemovalWrite(value: string, valueType: LeafValueType | undefined, unitHoldsKey: boolean): boolean {
  if (valueType === undefined) return isRemovalSentinel(value);
  return value === '' && unitHoldsKey;
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

/**
 * Whether the value tree reads a unit's configuration as documents of keys, as the
 * server's Diff addresses it. YAML and JSON are; the other AppConfig formats
 * (Properties, Env, INI, TOML, Text) are read by the tree as text, one leaf or a few
 * that name no key of the format, so the server's per-key paths match none of its rows.
 * An unknown toolchain is taken to be read as documents.
 */
export function treeReadsDocuments(toolchainType: string | undefined): boolean {
  if (!toolchainType) return true;
  return isYamlToolchain(toolchainType) || toolchainType.toUpperCase().endsWith('/JSON');
}
