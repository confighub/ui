// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Spaces the amber line says "already have the change". Pure: no React and
 * no MUI (see `stageTypes.ts`).
 */
import type { PropagationProblem } from './stageTypes';

/**
 * Compared and found to hold it already, or taken already while the stage is not
 * promoted as a whole, less every Space the same line names a problem for. A Space
 * resolves during a promote even when it keeps its own value, so the server's
 * resolved Spaces alone would list a pinned Space as having the change.
 */
export function hasTheChangeIds(
  marks: ReadonlyMap<string, { kind: string }>,
  takenSpaceIds: readonly string[],
  problems: readonly PropagationProblem[],
): string[] {
  const withProblem = new Set(problems.flatMap((p) => (p.kind === 'unknown' ? p.spaceIds : [p.spaceId])));
  const hasIt = [
    ...[...marks.entries()].filter(([, mark]) => mark.kind === 'hasIt').map(([id]) => id),
    ...takenSpaceIds,
  ];
  return [...new Set(hasIt)].filter((id) => !withProblem.has(id));
}
