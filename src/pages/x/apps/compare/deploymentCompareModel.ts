// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The N-deployment comparison: what the grid's rows and cells say.
 *
 * ONE ENCODING AT EVERY N. Two deployments read exactly the way five do.
 * Agreement is muted, divergence is `variation` blue, and absence is red.
 * No column is a reference: every column is read against the others. There
 * is no pairwise red/green mode, deliberately: red-then-green encodes
 * DIRECTION, and direction is a claim this feature cannot make once three
 * peers have no order between them. A field that changed colour because the
 * user added a third deployment would be teaching the wrong lesson at the
 * worst moment.
 *
 * ABSENT AND EMPTY ARE DIFFERENT FACTS. `''` is a value the author wrote and is
 * a difference from `info`; "not set" is the absence of a value. The rest of the
 * component view conflates them (`isEmptyValue` answers true for both), which is
 * safe there because it is describing one document. It is not safe here, where
 * the whole point is to say which deployments agree.
 *
 * A COLUMN THAT CANNOT ANSWER SAYS SO. A deployment still loading, or holding no
 * unit of this name, is `unknown` — never "not set". "We have not been told" is
 * a state in its own right and it falls into whichever neighbour is nearest
 * unless it is given a name.
 */

import {
  ambiguousKindsAcross,
  documentKeyIsPositional,
  indexUnitByIdentity,
  documentKey,
  pathIsPositional,
  resolveIdentityPath,
  type IdentityIndexedDocument,
} from './identityPaths';
import type { ResourceInfo } from '../configParser';
import { ancestorPathsOf, buildCompareTreeRows } from './compareTree';
import { UNANSWERABLE, type ColumnUnavailable, type UnanswerableReason } from './unanswerable';

/** Which deployments can be compared, and whether each can currently answer. */
export interface CompareColumnInput {
  /** `Space.SpaceID` — the deployment's identity throughout the component view. */
  deploymentId: string;
  /**
   * What this column is shown as — the deployment's variant label
   * (`Space.Labels.Variant`) when it has one, else its Space slug (e.g.
   * `prod-us1`). The same rule the flow graph node uses for `NodeName`.
   */
  label: string;
  /**
   * The Space slug, carried alongside `label` ONLY when it differs from it —
   * i.e. only when `label` is a variant label — so a caller can still show or
   * title-attribute which Space this is. `undefined` when there is nothing
   * more to say (no variant, so `label` already IS the slug).
   */
  displayName?: string;
  /** The unit's raw configuration, when this deployment holds the unit and it has loaded. */
  data?: string;
  /** This deployment's own UnitID, which an apply writes through. */
  unitId?: string;
  /**
   * Is this CANONICAL path kept on merge in this deployment?
   *
   * PER COLUMN, because protection is a property of a path in a UNIT: two
   * deployments can disagree about whether the same field is kept, and resolving
   * it once for the row would show one deployment's answer against another's
   * value. Takes the canonical dot-index path, which is what `MutationSources`
   * is keyed on — and what `editTargets` already resolves per column.
   */
  isProtected?: (positionalPath: string) => boolean;
  /** Why this column cannot answer, when it cannot. See `unanswerable.ts`. */
  unavailable?: ColumnUnavailable;
}

export type CompareCellKind =
  /** Set here, and every answering column sets the same literal. */
  | 'same'
  /** Set here, and the row does not agree. */
  | 'differs'
  /** Not set here; some other answering column sets it. Always a difference. */
  | 'absent'
  /** This deployment cannot answer yet, or has nothing to answer with. */
  | 'unknown'
  /**
   * This deployment's unit loaded and holds no document this row belongs to —
   * no document this row belongs to. Terminal, and a different fact from a
   * field being unset inside a document that IS here.
   */
  | 'no-document';

export interface CompareCell {
  kind: CompareCellKind;
  /**
   * The value as authored, when this deployment sets the field.
   * The empty string is a legitimate value here and is never a stand-in for absence.
   */
  literal?: string;
  /** What to print — `literal`, or its tail once a shared prefix has been elided. */
  display?: string;
  /** True only for the empty string, so the renderer can mark it as a value rather than a gap. */
  isEmptyString: boolean;
  /**
   * Kept on merge in THIS deployment.
   *
   * Not a block: `protectedPaths` means a merge from upstream must not overwrite
   * the value, which is the opposite of locking it — you protect a path so your
   * own edit survives. It rides alongside a staged change rather than replacing
   * it, because the border and the staging rail answer different questions.
   */
  isProtected?: boolean;
  /**
   * Why this cell has no value, when it has none.
   *
   * Carried ON the cell rather than re-derived by each renderer from the column
   * beside it. Two places holding the same fact is what let the grid and the
   * image rows disagree about an empty unit, and a renderer deriving it needs a
   * default for the pair the model never produces — a default that, being
   * `loading`, waits forever. With the reason here there is nothing to derive
   * and nothing to default to.
   */
  reason?: UnanswerableReason;
}

export interface CompareFolderRow {
  type: 'folder';
  /** The folder's own identity path, unique within the document. */
  identityPath: string;
  /** The dotted chain to print, already collapsed through single-child folders. */
  label: string;
  /** Nesting depth, and the unit of subtree membership for collapsing and filtering. */
  depth: number;
}

export interface CompareLeafRow {
  type: 'leaf';
  /** The full identity path, which is also this row's join key across columns. */
  identityPath: string;
  /** The identity path of the folder row this leaf sits under; `''` for document-root leaves. */
  folderPath: string;
  /** The key to print — this node's own key, already collapsed. */
  leafKey: string;
  /** Nesting depth. Indent is `16 + depth * 10`, inside the key cell. */
  depth: number;
  /**
   * The dot-index path from the first column that holds this path, for
   * callers that must address the document itself.
   */
  positionalPath?: string;
  /** True when some list element on this path could only be aligned by position. */
  isPositional: boolean;
  cells: CompareCell[];
  /**
   * Where each column's edit would be written, parallel to `cells`.
   * `undefined` means this column cannot express the path, so it cannot be edited.
   */
  editTargets: (CompareEditTarget | undefined)[];
  /** The shared head removed from every printed value on this row, when one was. */
  elidedPrefix?: string;
}

/**
 * Where an edit to one cell would actually be written.
 *
 * ONE PER COLUMN, resolved against that column's own document. Reusing
 * another column's canonical path for a sibling is the writing-side twin of
 * aligning lists by position: it would set a different list element and
 * report success.
 */
export interface CompareEditTarget {
  deploymentId: string;
  /** The dot-index path `setValueAtPath` and the staging model understand. */
  positionalPath: string;
  /** Which document in a multi-document unit to write to. */
  resource?: ResourceInfo;
}

export type CompareRow = CompareFolderRow | CompareLeafRow;

export interface CompareDocumentGroup {
  /** Stable key for this document across every column. */
  docKey: string;
  /**
   * The Kind alone — `Deployment`, `ConfigMap`. Rendered as a mono chip, never
   * as prose, and never in the same view as the deployment sense of the word:
   * a Component's children are deployments, and a Kubernetes Deployment is a
   * Kind, and one screen must not use both senses.
   */
  kind?: string;
  /** The full `apiVersion/Kind` the parser reports, for a title and for disambiguation. */
  resourceType?: string;
  /**
   * The resource's own name, with the namespace stripped. The parser reports it
   * as `namespace/name`, and a header reading `/features` leaks a format at the
   * reader instead of naming the resource.
   */
  name?: string;
  /** The namespace, when the document declares a non-empty one. */
  namespace?: string;
  /**
   * True when this unit holds more than one document of this Kind, so the name
   * is load-bearing rather than decorative.
   *
   * This is the ONLY case where the namespace can be needed on screen: two
   * documents of one Kind, same name, different namespaces, would otherwise head
   * two groups identically. A tooltip cannot carry that distinction — telling
   * two identical headers apart by hovering both is not reading, it is
   * guesswork — so the namespace is printed where it disambiguates and omitted
   * everywhere else.
   */
  kindIsAmbiguous: boolean;
  rows: CompareRow[];
  /** Leaf rows that differ. */
  differingCount: number;
  /** Leaf rows in total. */
  totalCount: number;
}

export interface CompareResult {
  groups: CompareDocumentGroup[];
  differingCount: number;
  totalCount: number;
  /** True when any row on the grid could only be aligned by position. */
  hasPositionalRows: boolean;
  /**
   * Leaf rows that could not be checked against every deployment.
   *
   * Sits beside `differingCount` and must never be read without it: `0` differing
   * means "nothing differs" only when this is `0` too.
   */
  unverifiableCount: number;
  /**
   * The deployments whose configuration is still in flight, by label.
   *
   * SEPARATE FROM `unansweredColumns`, and the separation is the point. "Could
   * not be read" is a verdict; a request that has not come back yet has earned
   * no verdict. While this is non-empty every count below is provisional, and
   * nothing user-facing may speak in the past tense or in absolutes.
   */
  loadingColumns: string[];
  /**
   * The deployments that hold this unit but have no configuration in it, by
   * label — SETTLED ones only (`empty-unit`).
   *
   * `no-such-unit` is NOT here — see `missingUnitColumns`. Not holding a unit
   * at all is a settled, unremarkable fact about the compared set; this field
   * is for a genuine failure to find configuration, and the two must not
   * share a word one of them would misreport.
   *
   * A column still loading is not here either: it has not failed to answer,
   * it has not answered yet.
   *
   * Original note kept, because it is still the reason this exists at all.
   *
   * WHY THIS IS ON THE RESULT AND NOT LEFT TO THE CELLS. A column that cannot
   * answer produces no difference, so every count derived from the rows reads it
   * as agreement — and the pane went on to state "all N fields agree across
   * these 2 deployments" about a deployment it had never read. Silence is not
   * assent, and a count that cannot tell the two apart must not be presented as
   * though it can. Anything quoting `differingCount` has to say this too.
   */
  unansweredColumns: string[];
  /**
   * The deployments that simply do not hold this unit, by label.
   *
   * A settled, unremarkable fact — not every variant of a component holds
   * every unit — kept OUT of `unansweredColumns`, which is read as "this
   * needs explaining as a failure". A caller that wants to say something
   * about it (the unit header does) states it truthfully on its own: these
   * deployments were read fine, this unit is simply not one of theirs.
   */
  missingUnitColumns: string[];
}

/**
 * Print a parsed value.
 *
 * Quotes are spent only where the bare text would read as a different type than
 * it is — the empty string, and strings that would otherwise be taken for a
 * number, a boolean or null. `1Gi` needs no quotes; `""` and `"true"` do, and
 * the quotes are the whole reason the reader can tell them from a gap and from
 * the boolean.
 */
export function formatLiteral(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value === '') return '""';
    if (/^(true|false|null|~)$/i.test(value)) return `"${value}"`;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) return `"${value}"`;
    return value;
  }
  return String(value);
}

/** True when the parsed value is the empty string, which is a value rather than an absence. */
export function isEmptyStringValue(value: unknown): boolean {
  return value === '';
}

/** A shared head shorter than this is not worth the `…` it would cost. */
const MIN_ELIDED_PREFIX = 6;
/** Below this, elision would leave the reader nothing to recognise the value by. */
const MIN_REMAINING_TAIL = 3;
/**
 * Roughly what a 104px column holds at 12px mono. Values shorter than this are
 * not at risk of truncation, so eliding them would remove information to solve
 * a problem the row does not have.
 */
const VALUE_WIDTH_BUDGET = 14;
/** A prefix is cut back to one of these, so the tail starts at a token boundary. */
const PREFIX_BOUNDARY = /[/:@._-]/;

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length < 2) return '';
  let prefix = values[0] ?? '';
  for (let i = 1; i < values.length && prefix; i += 1) {
    const other = values[i] ?? '';
    let end = 0;
    while (end < prefix.length && end < other.length && prefix[end] === other[end]) end += 1;
    prefix = prefix.slice(0, end);
  }
  return prefix;
}

/**
 * Elide the head a row's values share, so the part that actually differs is what
 * survives the column's width.
 *
 * Returns the prefix that was removed, or `''` when nothing was. The full value
 * is never discarded — callers keep `literal` for the title and for copy.
 */
export function elideSharedPrefix(literals: readonly string[]): string {
  if (literals.length < 2) return '';
  if (!literals.some((value) => value.length > VALUE_WIDTH_BUDGET)) return '';

  let prefix = longestCommonPrefix(literals);
  if (prefix.length < MIN_ELIDED_PREFIX) return '';

  // Cut back to a token boundary so the tail does not start mid-word.
  let boundary = -1;
  for (let i = prefix.length - 1; i >= 0; i -= 1) {
    if (PREFIX_BOUNDARY.test(prefix[i] ?? '')) {
      boundary = i;
      break;
    }
  }
  if (boundary < 0) return '';
  prefix = prefix.slice(0, boundary + 1);
  if (prefix.length < MIN_ELIDED_PREFIX) return '';

  const shortestTail = Math.min(...literals.map((value) => value.length - prefix.length));
  if (shortestTail < MIN_REMAINING_TAIL) return '';

  return prefix;
}

/**
 * Could this row not be fully checked, because some deployment had nothing to
 * say about it?
 *
 * Deliberately NOT folded into `rowDiffers`. An unanswerable cell is not
 * evidence of a difference, and counting it as one would trade a silent false
 * negative for a loud false positive — every field of a mute deployment would
 * be reported as differing when most of them probably agree. It is instead its
 * own fact, counted separately and stated separately, because "we could not
 * check this" is neither agreement nor disagreement.
 */
export function rowUnverifiable(cells: readonly CompareCell[]): boolean {
  return cells.some((cell) => cell.kind === 'unknown');
}

/**
 * Does this leaf row diverge?
 *
 * Every answering cell (not `unknown`, not `no-document`) contributes a
 * token: its literal, or an ABSENT sentinel when it has none. The row
 * differs the moment two tokens disagree. This is stricter than "any two
 * (present) values disagree" because set-vs-unset counts as a difference; it
 * is looser than "differs from a reference column" because `unknown` and
 * `no-document` cells are not evidence either way.
 */
const ABSENT_TOKEN = Symbol('compare-absent');

export function rowDiffers(cells: readonly CompareCell[]): boolean {
  let first: string | typeof ABSENT_TOKEN | undefined;
  for (const cell of cells) {
    if (cell.kind === 'unknown' || cell.kind === 'no-document') continue;
    const token = cell.literal ?? ABSENT_TOKEN;
    if (first === undefined) first = token;
    else if (token !== first) return true;
  }
  return false;
}

/**
 * The cell's raw, pre-comparison reading: what this column says on its own,
 * with no opinion yet about whether the row as a whole agrees. `buildCompareResult`
 * calls `rowDiffers` across a row's raw cells and promotes every cell that
 * carries a literal to `'differs'` when it does. A cell can only ever be
 * promoted FROM `'same'` — `'absent'`, `'unknown'` and `'no-document'` are
 * already final.
 */
function cellFor(
  value: unknown,
  present: boolean,
  columnCanAnswer: boolean,
  hasDocument: boolean,
  columnUnavailable: ColumnUnavailable,
): CompareCell {
  // These two were one flag once, and conflating them is what made a column
  // that had loaded perfectly well sit on "loading" forever: a document that
  // does not join here is an ANSWER, not a wait.
  if (!columnCanAnswer) {
    return { kind: 'unknown', isEmptyString: false, reason: columnUnavailable ?? 'loading' };
  }
  if (!hasDocument) return { kind: 'no-document', isEmptyString: false, reason: 'no-document' };
  if (!present) return { kind: 'absent', isEmptyString: false };

  const literal = formatLiteral(value);
  const isEmptyString = isEmptyStringValue(value);
  return { kind: 'same', literal, display: literal, isEmptyString };
}

/** Build the whole grid: one group per document, ordered by first appearance, left to right. */
export function buildCompareResult(columns: readonly CompareColumnInput[]): CompareResult {
  // `transient` is the single source for "is this a wait or a verdict", so the
  // split here cannot drift from the word a cell prints.
  const loadingColumns = columns
    .filter((column) => column.unavailable !== undefined && UNANSWERABLE[column.unavailable].transient)
    .map((column) => column.label);
  // A settled fact, not a read failure — its own list, never `unansweredColumns`.
  const missingUnitColumns = columns
    .filter((column) => column.unavailable === 'no-such-unit')
    .map((column) => column.label);
  const unansweredColumns = columns
    .filter(
      (column) =>
        column.unavailable !== undefined &&
        !UNANSWERABLE[column.unavailable].transient &&
        column.unavailable !== 'no-such-unit',
    )
    .map((column) => column.label);

  if (columns.length === 0) {
    return {
      groups: [],
      differingCount: 0,
      totalCount: 0,
      hasPositionalRows: false,
      unverifiableCount: 0,
      loadingColumns,
      unansweredColumns,
      missingUnitColumns,
    };
  }

  const indexed = columns.map((column) =>
    column.unavailable ? { documents: [] } : indexUnitByIdentity(column.data),
  );
  const ambiguousKinds = ambiguousKindsAcross(indexed);

  // Join documents across columns by resource identity, ordering by the first
  // column that carries each one — first appearance, left to right.
  const documentsByKey = new Map<string, (IdentityIndexedDocument | undefined)[]>();
  const order: string[] = [];
  indexed.forEach((unit, columnIndex) => {
    unit.documents.forEach((document, ordinal) => {
      const key = documentKey(document.resource, ordinal, ambiguousKinds);
      let slots = documentsByKey.get(key);
      if (!slots) {
        slots = new Array<IdentityIndexedDocument | undefined>(columns.length).fill(undefined);
        documentsByKey.set(key, slots);
        order.push(key);
      }
      slots[columnIndex] = document;
    });
  });

  const groups: CompareDocumentGroup[] = [];
  let differingCount = 0;
  let totalCount = 0;
  let unverifiableCount = 0;
  let hasPositionalRows = false;

  for (const key of order) {
    const slots = documentsByKey.get(key);
    if (!slots) continue;

    // Union the identity paths, in first-appearance order (left to right), so
    // the grid reads down the first column that carries each path and anything
    // only later columns carry lands after it.
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const document of slots) {
      if (!document) continue;
      for (const path of document.valueByIdentityPath.keys()) {
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }
    }

    const treeRows = buildCompareTreeRows(paths);
    const depthByPath = new Map(treeRows.map((row) => [row.identityPath, row]));
    const identityHolder = slots.find((document) => document !== undefined);

    const leaves: CompareLeafRow[] = [];
    for (const path of paths) {
      const cells = columns.map((column, index) => {
        const document = slots[index];
        const present = document?.valueByIdentityPath.has(path) ?? false;
        return cellFor(
          document?.valueByIdentityPath.get(path),
          present,
          !column.unavailable,
          document !== undefined,
          column.unavailable,
        );
      });

      const differs = rowDiffers(cells);
      if (differs) {
        for (const cell of cells) {
          if (cell.literal !== undefined) cell.kind = 'differs';
        }
      }

      const presentLiterals = cells
        .map((cell) => cell.literal)
        .filter((literal): literal is string => literal !== undefined);
      const elidedPrefix = elideSharedPrefix(presentLiterals);
      if (elidedPrefix) {
        for (const cell of cells) {
          if (cell.literal === undefined) continue;
          cell.display = `…${cell.literal.slice(elidedPrefix.length)}`;
        }
      }

      const placed = depthByPath.get(path);
      // A document with no identity was joined by position, which makes every
      // row inside it positionally aligned however well its own paths are keyed.
      const isPositional = pathIsPositional(path) || documentKeyIsPositional(key);
      if (isPositional) hasPositionalRows = true;

      const editTargets: (CompareEditTarget | undefined)[] = columns.map((column, index) => {
        const document = slots[index];
        if (column.unavailable || !document) return undefined;
        const positionalPath = resolveIdentityPath(document, path);
        if (positionalPath === undefined) return undefined;
        return { deploymentId: column.deploymentId, positionalPath, resource: document.resource };
      });

      // Protection is looked up on the canonical path this column resolved, so a
      // column that cannot express the path simply has no answer rather than
      // borrowing another column's.
      cells.forEach((cell, index) => {
        const target = editTargets[index];
        if (!target) return;
        const protectedHere = columns[index]?.isProtected?.(target.positionalPath);
        if (protectedHere) cell.isProtected = true;
      });

      // The path's canonical (dot-index) form, taken from the first column
      // that holds it — there is no reference column any more.
      const positionalHolder = slots.find((document) => document?.valueByIdentityPath.has(path));

      leaves.push({
        type: 'leaf',
        identityPath: path,
        folderPath: ancestorPathsOf(treeRows, path).at(-1) ?? '',
        leafKey: placed?.key ?? path,
        depth: placed?.depth ?? 0,
        positionalPath: positionalHolder?.positionalByIdentityPath.get(path),
        isPositional,
        cells,
        editTargets,
        elidedPrefix: elidedPrefix || undefined,
      });
    }

    const visible = leaves.filter((leaf) => rowDiffers(leaf.cells));
    unverifiableCount += leaves.filter((leaf) => rowUnverifiable(leaf.cells)).length;

    // TREE ORDER, from the shared builder. The previous version grouped by
    // whichever folder was reached first, which put `resources.limits` above the
    // `resources` it belongs under and split siblings across two folders.
    const leafByPath = new Map(leaves.map((leaf) => [leaf.identityPath, leaf]));
    const rows: CompareRow[] = [];
    for (const row of treeRows) {
      if (row.type === 'folder') {
        rows.push({ type: 'folder', identityPath: row.identityPath, label: row.key, depth: row.depth });
        continue;
      }
      const leaf = leafByPath.get(row.identityPath);
      if (leaf) rows.push(leaf);
    }

    const resourceType = identityHolder?.resource?.ResourceType ?? undefined;
    const qualifiedName = identityHolder?.resource?.ResourceName ?? undefined;
    const slash = qualifiedName?.indexOf('/') ?? -1;
    const namespace = slash > 0 ? qualifiedName?.slice(0, slash) : undefined;
    groups.push({
      docKey: key,
      kind: resourceType ? (resourceType.split('/').pop() ?? resourceType) : undefined,
      resourceType,
      name: qualifiedName ? (qualifiedName.slice(slash + 1) || qualifiedName) : undefined,
      namespace,
      kindIsAmbiguous: resourceType !== undefined && ambiguousKinds.has(resourceType),
      rows,
      differingCount: visible.length,
      totalCount: leaves.length,
    });
    differingCount += visible.length;
    totalCount += leaves.length;
  }

  return {
    groups,
    differingCount,
    totalCount,
    hasPositionalRows,
    unverifiableCount,
    loadingColumns,
    unansweredColumns,
    missingUnitColumns,
  };
}

/**
 * Drop the rows the Differing filter hides, and any folder row left with
 * nothing under it.
 *
 * Kept separate from `buildCompareResult` so flipping the filter re-renders
 * without re-parsing every deployment's configuration.
 *
 * A row survives the Differing filter if it differs OR if it could not be
 * checked. The filter's promise is "these are the fields you need to look
 * at", and a field whose value in one deployment is unknown is squarely one
 * of them. Hiding it would produce the worst version of this screen: a
 * filtered view that omits exactly the rows the reader cannot trust, under a
 * heading that says nothing needs attention.
 */
function keepRow(row: CompareLeafRow): boolean {
  return rowDiffers(row.cells) || rowUnverifiable(row.cells);
}

export function filterRows(rows: readonly CompareRow[]): CompareRow[] {
  const kept: CompareRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (row.type === 'leaf') {
      if (keepRow(row)) kept.push(row);
      continue;
    }
    // A folder survives only if a leaf somewhere BELOW it does. Its subtree is
    // the contiguous run of deeper rows that follows — which is what pre-order
    // gives, and why the rows are a list rather than a tree.
    let hasVisibleLeaf = false;
    for (let j = i + 1; j < rows.length; j += 1) {
      const next = rows[j];
      if (!next || next.depth <= row.depth) break;
      if (next.type === 'leaf' && keepRow(next)) {
        hasVisibleLeaf = true;
        break;
      }
    }
    if (hasVisibleLeaf) kept.push(row);
  }
  return kept;
}
