// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { SheetAtom } from './specSheetModel';

/** Groups the items of one plain-value list together, so a renderer draws each list once. */
export type AtomRun =
  | { kind: 'atom'; atom: SheetAtom }
  | { kind: 'list'; items: SheetAtom[]; path: string };

export function runsOf(atoms: SheetAtom[]): AtomRun[] {
  const runs: AtomRun[] = [];
  for (const atom of atoms) {
    const last = runs[runs.length - 1];
    if (atom.list) {
      if (last?.kind === 'list' && last.path === atom.list.path) last.items.push(atom);
      else runs.push({ kind: 'list', items: [atom], path: atom.list.path });
      continue;
    }
    runs.push({ kind: 'atom', atom });
  }
  return runs;
}
