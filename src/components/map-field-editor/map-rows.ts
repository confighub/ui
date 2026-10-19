// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A map field (Labels, Annotations, Facts, gates) is edited as a list of rows, so a key can be
// renamed in place and a half-typed row is not lost. These convert between the entity's map and
// the rows a form holds.

/** One entry of a map field, as a form edits it. */
export interface MapRow {
  key: string;
  value: string;
}

/** The rows for a map, in the map's order. */
export const mapToRows = (map?: Record<string, string | boolean> | null): MapRow[] =>
  Object.entries(map ?? {}).map(([key, value]) => ({ key, value: String(value) }));

/**
 * The map the rows describe. A row without a key is left out: the form refuses a row with a
 * value and no key, so only blank rows reach here.
 */
export const rowsToMap = (rows?: MapRow[] | null): Record<string, string> =>
  Object.fromEntries(
    (rows ?? []).filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
  );

/** The gates the rows name. A gate is a key; its value is always true. */
export const rowsToGates = (rows?: MapRow[] | null): Record<string, boolean> =>
  Object.fromEntries(
    (rows ?? []).filter((row) => row.key.trim()).map((row) => [row.key.trim(), true]),
  );
