// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// What the shapes share: the props every renderer takes, the paths of an atom relative to
// its container or list item, and grouping of the atoms of one list item.
import type { SheetAtom, SheetBlock, SheetPart } from '../specSheetModel';

export interface ShapeProps {
  block: SheetBlock;
  part: SheetPart;
  resourceKind?: string;
}

/**
 * The segments of an atom after the last `<listKey>.<index>` in its path, with the index:
 * `spec.template.spec.containers.0.resources.limits.cpu` → `{ index: 0, rest: [resources, limits, cpu] }`.
 */
export function afterListItem(
  atom: SheetAtom,
  listKey: string,
): { index: number; rest: (string | number)[] } | null {
  const s = atom.segments;
  for (let i = s.length - 2; i >= 0; i--) {
    if (s[i] === listKey && typeof s[i + 1] === 'number') {
      return { index: s[i + 1] as number, rest: s.slice(i + 2) };
    }
  }
  return null;
}

const CONTAINER_LISTS = new Set(['containers', 'initContainers', 'ephemeralContainers']);

/** The segments of an atom inside its container: `[resources, limits, cpu]`. */
export function inContainer(atom: SheetAtom): (string | number)[] {
  const s = atom.segments;
  for (let i = s.length - 2; i >= 0; i--) {
    if (CONTAINER_LISTS.has(String(s[i])) && typeof s[i + 1] === 'number')
      return s.slice(i + 2);
  }
  return s;
}

export const joinSegs = (segs: (string | number)[]) => segs.map(String).join('.');

/** Consecutive atoms that share a group key, in model order. */
export function groupRuns<K>(
  atoms: SheetAtom[],
  keyOf: (atom: SheetAtom) => K,
): { key: K; atoms: SheetAtom[] }[] {
  const out: { key: K; atoms: SheetAtom[] }[] = [];
  for (const atom of atoms) {
    const key = keyOf(atom);
    const last = out[out.length - 1];
    if (last && last.key === key) last.atoms.push(atom);
    else out.push({ key, atoms: [atom] });
  }
  return out;
}

/** Lower kebab case for test ids: `OPENROUTER_API_KEY` → `openrouter-api-key`. */
export function idWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The item's name atom and where it sits: a name drawn in a column of its own must come
 * first (or last) among the item's atoms, so the drawn order stays the document order.
 */
export function nameOf(
  atoms: SheetAtom[],
  isName: (atom: SheetAtom) => boolean,
): { name?: SheetAtom; place: 'first' | 'last' | 'inline'; rest: SheetAtom[] } {
  const i = atoms.findIndex(isName);
  if (i < 0) return { place: 'inline', rest: atoms };
  const rest = atoms.filter((_, k) => k !== i);
  if (i === 0) return { name: atoms[0], place: 'first', rest };
  if (i === atoms.length - 1) return { name: atoms[i], place: 'last', rest };
  return { place: 'inline', rest: atoms };
}
