// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The compare grid's rows, nested by the same builder the shipped trees use.
 *
 * THE NESTING IS NOT FORKED, AND WAS NEVER MEANT TO BE. `diffTree.ts` already
 * holds it, and `TreeDiffSection` already consumes it — the compare grid simply
 * did not, and grew its own two-level substitute instead. That substitute lost
 * the nesting, built composite keys like `requests.cpu`, and ordered siblings by
 * whichever folder happened to be reached first, so `resources.limits` could be
 * emitted above the `resources` it belongs under. All three go away by deleting
 * it and calling the shared builder.
 *
 * CHAINS ALWAYS COLLAPSE, which is what the shipped trees do: one leaf differing
 * five levels down must not cost five rows of empty folders. That is not applied
 * here — `buildPathTree` already ends in `collapseFolderChains` (`diffTree.ts`),
 * so collapsing is intrinsic to the builder rather than a decision this module
 * makes. Calling it again would be a no-op that implied otherwise. The behaviour
 * is asserted all the same, because it is the behaviour the user asked for; it
 * simply cannot be broken from this file.
 *
 * WHAT THE COMPARE GRID STILL OWNS is everything the builder has no opinion
 * about: N value columns rather than a before and an after, one colour encoding
 * instead of red/green, frozen and growing tracks, and per-column edit targets.
 * `DiffTreeNode` carries a two-valued `diff` that none of that fits, so the tree
 * is used for STRUCTURE and the cells are attached by full path — the same way
 * `ComponentValuesSection` composes a `fullPath` as it walks.
 */

import { buildPathTree, type DiffTreeNode } from '../diffTree';
import { splitIdentityPath } from './identityPaths';

/**
 * A dot inside a bracketed identity token, while the shared builder is looking.
 *
 * `buildPathTree` splits a path on `.`, which is right for every segment it was
 * written for and wrong for `containers[my.sidecar]` — that is one segment, and
 * splitting it invents a folder. The dot is swapped for a character no
 * configuration key contains, and swapped back on the way out. Encoding at the
 * boundary keeps `diffTree.ts` untouched, which matters because three other
 * surfaces depend on it.
 */
const DOT_IN_TOKEN = '\u0001';

export function encodeIdentityPath(path: string): string {
  let out = '';
  let inBracket = false;
  for (const char of path) {
    if (char === '[') inBracket = true;
    else if (char === ']') inBracket = false;
    out += char === '.' && inBracket ? DOT_IN_TOKEN : char;
  }
  return out;
}

export function decodeIdentityPath(path: string): string {
  return path.split(DOT_IN_TOKEN).join('.');
}

/** One row of the grid, in the order it is drawn. */
export interface CompareTreeRow {
  type: 'folder' | 'leaf';
  /** The full identity path. For a leaf this is its join key across columns. */
  identityPath: string;
  /** What this row prints — the node's own key, already collapsed. */
  key: string;
  /** How deep it sits. The renderer's indent, and the unit of subtree membership. */
  depth: number;
}

/**
 * Flatten the tree into draw order, pre-order.
 *
 * A LIST RATHER THAN A TREE, deliberately. Every consumer downstream — the
 * filter, the staged-row pinning, the collapse state, the cells themselves — is
 * keyed on a row's identity path and reads better over a list. Pre-order keeps a
 * folder immediately followed by its whole subtree, so "everything under this
 * folder" is a contiguous run of rows with a greater depth, which is all the
 * filtering and collapsing need.
 */
function flatten(nodes: readonly DiffTreeNode[], prefix: string, depth: number, out: CompareTreeRow[]): void {
  for (const node of nodes) {
    const identityPath = decodeIdentityPath(prefix ? `${prefix}.${node.key}` : node.key);
    const key = decodeIdentityPath(node.key);
    if (node.type === 'leaf') {
      out.push({ type: 'leaf', identityPath, key, depth });
      continue;
    }
    out.push({ type: 'folder', identityPath, key, depth });
    flatten(node.children ?? [], encodeIdentityPath(identityPath), depth + 1, out);
  }
}

/**
 * Build the grid's rows from the identity paths it is showing.
 *
 * The paths arrive in the order the columns produced them; the builder sorts
 * siblings into one tree, so what comes back is in tree order rather than
 * discovery order.
 */
export function buildCompareTreeRows(identityPaths: readonly string[]): CompareTreeRow[] {
  if (identityPaths.length === 0) return [];
  const tree = buildPathTree(identityPaths.map((path) => ({ path: encodeIdentityPath(path), value: '' })));
  const rows: CompareTreeRow[] = [];
  flatten(tree, '', 0, rows);
  return rows;
}

/**
 * Every ancestor folder path of a row, innermost last.
 *
 * Used to force a pinned row's ancestors open. A row pinned into the list by a
 * staged edit but sitting inside a collapsed folder is unreachable, so the pin
 * would silently do nothing — which is the exact failure pinning exists to
 * prevent.
 */
export function ancestorPathsOf(rows: readonly CompareTreeRow[], identityPath: string): string[] {
  const index = rows.findIndex((row) => row.identityPath === identityPath);
  if (index < 0) return [];
  const ancestors: string[] = [];
  let depth = rows[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0 && depth > 0; i -= 1) {
    const candidate = rows[i];
    if (!candidate || candidate.type !== 'folder' || candidate.depth >= depth) continue;
    ancestors.unshift(candidate.identityPath);
    depth = candidate.depth;
  }
  return ancestors;
}

/**
 * The display units of a path: a name and the identity token attached to it.
 *
 * `containers[api]` is ONE unit, not two. Splitting it is what produced
 * `spec.…` for `annotations[kubectl.kubernetes.io/restartedAt]` — the identity
 * destroyed and the label naming nothing at all. The bracket-aware splitter
 * already existed for the tree builder; this is the second caller, and the
 * reason it is shared rather than written again.
 */
function displayUnits(label: string): string[] {
  const units: string[] = [];
  for (const segment of splitIdentityPath(label)) {
    if (segment.startsWith('[') && units.length > 0) units[units.length - 1] += segment;
    else units.push(segment);
  }
  return units;
}

/** Keep both ends of a token too wide to show whole — the ends are what identify it. */
function truncateMiddle(unit: string, budget: number): string {
  if (unit.length <= budget || budget < 6) return unit;
  const keep = budget - 1;
  const head = Math.ceil(keep / 2);
  return `${unit.slice(0, head)}…${unit.slice(unit.length - (keep - head))}`;
}

/**
 * Shorten a collapsed folder label to fit the key column.
 *
 * ELIDE, NEVER WRAP. 22px is the density contract, and a label that wraps breaks
 * it for every row beside it. The full path stays recoverable because the
 * ancestors are printed above — only true now the grid nests, which is why
 * flattening made this worse rather than better.
 *
 * WHOLE UNITS, MIDDLE FIRST. The head says where you are and the tail says what
 * you are looking at, so what goes is the middle.
 *
 * AND IT BINDS. Preferring to keep identity units is not the same as keeping
 * them at any cost: a label that still overflows hands the job to the CSS
 * ellipsis, which cuts the tail this function just worked to preserve and shows
 * TWO ellipses doing it. So when the units that must stay still do not fit, the
 * widest is truncated through its middle rather than dropped — an identity is
 * never removed, but it can be shown from both ends.
 */
export function elideFolderLabel(label: string, budget: number): string {
  if (label.length <= budget) return label;
  const units = displayUnits(label);
  if (units.length <= 1) return truncateMiddle(label, budget);

  const head = units[0] as string;
  const kept: string[] = [];
  // `head` + `.` + `…`, and every kept unit brings its own leading dot.
  const fixed = head.length + 2;
  let used = fixed;
  for (let i = units.length - 1; i > 0; i -= 1) {
    const unit = units[i] as string;
    if (used + unit.length + 1 > budget && kept.length > 0) break;
    kept.unshift(unit);
    used += unit.length + 1;
  }
  if (kept.length === units.length - 1) return label;

  const out = [head, '…', ...kept].join('.');
  // The tail alone can still overflow — an identity token can be wider than the
  // column. Truncate through its middle rather than let CSS cut its end off.
  if (out.length <= budget) return out;
  const last = kept[kept.length - 1] as string;
  // Everything the last unit has to share the budget with: the fixed head, the
  // dot before each kept unit, and the other kept units themselves.
  const others = kept.slice(0, -1).reduce((sum, unit) => sum + unit.length + 1, 0);
  const room = budget - fixed - others - 1;
  return [head, '…', ...kept.slice(0, -1), truncateMiddle(last, Math.max(6, room))].join('.');
}
