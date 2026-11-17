// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The name the Columns panel shows for a column, made from its field. A dynamic column (a label
 * key, a value) shows its key as written, without the group's prefix. Any other field is split into
 * Title Case words: `changeSet` -> "Change Set", `WorkerID` -> "Worker ID".
 */
export function formatColumnFieldName(
  field: string,
  dynamicPrefixes: readonly string[] = [],
): string {
  for (const prefix of dynamicPrefixes) {
    if (field.startsWith(prefix)) {
      return field.replace(prefix, '');
    }
  }

  return field
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // An acronym before a word: "WorkerID" stays "Worker ID", "IDFoo" -> "ID Foo"
    .replace(/([a-z\d])([A-Z])/g, '$1 $2') // camelCase: "upstreamUnit" -> "upstream Unit"
    .replace(/(^|\s)([a-z])/g, (_, space: string, c: string) => space + c.toUpperCase()) // "upstream Unit" -> "Upstream Unit"
    .trim();
}
