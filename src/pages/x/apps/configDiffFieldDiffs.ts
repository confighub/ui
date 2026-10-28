// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { parse as parseYaml } from 'yaml';
import type { ConfigDiff, MergeKeyValue, MutationConflict, PathChange, PathSegment, ResourceDiff, ResourceInfo } from '@confighub/rtk-query';

// Relative, not `@/`: the pure specs import this module outside the app's bundler.
import {
  leafValueTypeOf,
  parseUnitDataStructured,
  selectByResource,
  type ArrayInsertion,
  type FieldEntry,
  type LeafValueType,
} from './configParser';
import type { KeyedFieldDiff, WholeResourceChange } from './componentTypes';
import { computeDocumentScopes, docStageKey, groupFieldEntriesByDocument, VALUE_PLACEHOLDER, type DocumentScope } from './diffTree';

/**
 * A server-computed `ConfigDiff` as the rows of the Component view's value tree.
 *
 * The tree draws a Unit's configuration as `parseUnitData` flattens it: one leaf per
 * scalar, addressed by a dot-index path (`spec.template.spec.containers.0.image`),
 * grouped by document. A staged change is keyed on `docStageKey(scope, path)`, which
 * qualifies the path with its document's id, because two documents of one Unit can hold
 * the same path. Every row returned here carries that key, computed the way the tree
 * computes it, so a consumer looks a row up by the key the tree already has.
 *
 * The server matched the array elements by merge key and the resources across renames;
 * nothing here matches values against values. What is translated is the address: a
 * resource to a document of the tree, an element to its index on the tree's side, and a
 * block of YAML to the leaves the tree draws for it.
 */

/** Which side of the diff the tree draws: the configuration its paths and indices come from. */
export type TreeSide = 'from' | 'to';

/** The configuration the tree draws: Unit data, or its leaves as `parseUnitDataStructured` returns them. */
export type TreeData = string | FieldEntry[] | undefined;

export type { KeyedFieldDiff, WholeResourceChange };

export type ConfigDiffRow = KeyedFieldDiff | WholeResourceChange;

export function isWholeResourceChange(row: ConfigDiffRow): row is WholeResourceChange {
  return 'wholeResource' in row;
}

/**
 * U+0002 cannot occur in a dot-path, in a document id, or in a stage key (which joins
 * with U+0001), so a whole-resource key can never be mistaken for a row's.
 */
const WHOLE_RESOURCE_KEY_PREFIX = '\u0002';

/** The prefix of the keys the server writes YAML comments under; such a path has no row. */
const COMMENT_KEY_PREFIX = '$comment$';

/** As configParser reads YAML, so a value parsed here is written as the tree writes it. */
const YAML_READ_OPTIONS = { uniqueKeys: false } as const;

// ============================================================================
// THE TREE'S DOCUMENTS
// ============================================================================

/** One document of the tree, with the scope its rows' stage keys are built from. */
interface TreeDocument {
  /** Undefined in a single-document Unit, whose stage keys are bare paths. */
  scope: DocumentScope | undefined;
  resource: ResourceInfo | undefined;
  entries: FieldEntry[];
  values?: Map<string, string>;
  arrayLengths?: Map<string, number>;
}

/**
 * The documents exactly as the tree groups them. `computeDocumentScopes` and
 * `groupFieldEntriesByDocument` are what `ComponentValuesSection` builds the tree and its
 * stage keys from, so the ids here are the ids there. A YAML document with no leaves
 * forms no group, which is why the documents are not taken from the YAML stream itself.
 */
function treeDocumentsOf(treeData: TreeData): TreeDocument[] {
  const entries = Array.isArray(treeData) ? treeData : parseUnitDataStructured(treeData);
  const groups = groupFieldEntriesByDocument(entries);
  const scopes = computeDocumentScopes(entries);
  return groups.map((group, i) => ({ scope: scopes[i], resource: group.resource, entries: group.entries }));
}

/**
 * The document holding `resource`, by the server's rule (`selectByResource`): the same
 * type in any API version and the same name, namespace included, else the same name
 * without its namespace when that names one document. A single document answers for
 * every resource, as it does in the tree.
 */
function documentFor(docs: TreeDocument[], resource: ResourceInfo | undefined): TreeDocument | undefined {
  if (docs.length === 1) return docs[0];
  if (!resource) return undefined;
  const matches = selectByResource(docs, (doc) => doc.resource, resource);
  return matches.length === 1 ? matches[0] : undefined;
}

function valuesOf(doc: TreeDocument): Map<string, string> {
  if (!doc.values) doc.values = new Map(doc.entries.map((e) => [e.path, String(e.value)]));
  return doc.values;
}

/** The number of elements of the array at `arrayPath` that have a leaf, 0 for no array. */
function arrayLength(doc: TreeDocument, arrayPath: string): number {
  if (!doc.arrayLengths) {
    const lengths = new Map<string, number>();
    for (const entry of doc.entries) {
      const parts = entry.path.split('.');
      let prefix = parts[0];
      for (let j = 1; j < parts.length; j++) {
        if (/^\d+$/.test(parts[j])) {
          const length = Number(parts[j]) + 1;
          if ((lengths.get(prefix) ?? 0) < length) lengths.set(prefix, length);
        }
        prefix = `${prefix}.${parts[j]}`;
      }
    }
    doc.arrayLengths = lengths;
  }
  return doc.arrayLengths.get(arrayPath) ?? 0;
}

/**
 * The index of the element of the array at `arrayPath` whose merge keys have these
 * values. The recorded index is tried first, as the server's matchArrayElement does,
 * since an array can hold two elements that match.
 */
function elementByMergeKeys(
  doc: TreeDocument,
  arrayPath: string,
  pairs: MergeKeyValue[],
  recordedIndex?: number,
): number | undefined {
  const length = arrayLength(doc, arrayPath);
  const values = valuesOf(doc);
  const matches = (i: number) => pairs.every((p) => values.get(joinPath(arrayPath, `${i}.${p.Key ?? ''}`)) === p.Value);
  if (recordedIndex !== undefined && recordedIndex >= 0 && recordedIndex < length && matches(recordedIndex)) {
    return recordedIndex;
  }
  for (let i = 0; i < length; i++) if (matches(i)) return i;
  return undefined;
}

function joinPath(prefix: string, rest: string): string {
  if (!prefix) return rest;
  return rest ? `${prefix}.${rest}` : prefix;
}

// ============================================================================
// PATHS
// ============================================================================

/**
 * The made-up indices given, within one document, to elements absent from the tree. An
 * element keeps its index across its several changes, and each array numbers its
 * absent elements on from its last element.
 */
interface SyntheticIndices {
  byElement: Map<string, number>;
  usedByArray: Map<string, number>;
}

function isElement(segment: PathSegment): boolean {
  return segment.FromIndex >= 0 || segment.ToIndex >= 0 || (segment.MergeKeys?.length ?? 0) > 0;
}

/** One array element a path passes through, as the tree addresses it. */
interface ElementStep {
  /** The tree's dot-index path of the array. */
  arrayPath: string;
  /** The element's index in the tree's path; made up when `synthetic`. */
  index: number;
  /** Whether the tree does not hold the element, so `index` is made up. */
  synthetic: boolean;
  /** The element's index on the tree's side of the diff, -1 when absent there. */
  sideIndex: number;
  /** The element's index on the other side of the diff, -1 when absent there. */
  otherIndex: number;
}

/**
 * The dot-index path of `segments` in the tree, and the array elements it passes
 * through. An element takes its index on the tree's side. Absent there, it is looked up
 * by merge key in the tree's document, which finds it when the tree is neither side of
 * the diff. Absent from the tree too, it is placed after the array's last element: an
 * insertion is then one added element, and the elements after it keep their indices and
 * read as unchanged, as they are. Where the element goes when it is written is
 * {@link insertionsOf}'s answer.
 *
 * With `byMergeKey`, the tree draws a configuration that is only close to the side, so
 * the side's index can name a different element of the tree: an element with merge keys
 * is found by them alone, the side's index only breaking a tie between two that match.
 */
function treePathOf(
  segments: PathSegment[],
  side: TreeSide,
  doc: TreeDocument | undefined,
  synthetic: SyntheticIndices,
  byMergeKey: boolean,
): { path: string; elements: ElementStep[] } {
  let path = '';
  const elements: ElementStep[] = [];
  for (const segment of segments) {
    if (!isElement(segment)) {
      path = joinPath(path, segment.Field ?? '');
      continue;
    }
    const sideIndex = side === 'from' ? segment.FromIndex : segment.ToIndex;
    const otherIndex = side === 'from' ? segment.ToIndex : segment.FromIndex;
    const mergeKeys = doc && segment.MergeKeys && segment.MergeKeys.length > 0 ? segment.MergeKeys : undefined;
    let index: number | undefined;
    if (byMergeKey && mergeKeys && doc) {
      index = elementByMergeKeys(doc, path, mergeKeys, sideIndex >= 0 ? sideIndex : undefined);
    } else {
      index = sideIndex >= 0 ? sideIndex : undefined;
      if (index === undefined && mergeKeys && doc) index = elementByMergeKeys(doc, path, mergeKeys);
    }
    const isSynthetic = index === undefined;
    if (index === undefined) {
      const element = [
        path,
        segment.FromIndex,
        segment.ToIndex,
        ...(segment.MergeKeys ?? []).map((kv) => `${kv.Key}=${kv.Value}`),
      ].join('\u0000');
      index = synthetic.byElement.get(element);
      if (index === undefined) {
        const used = synthetic.usedByArray.get(path) ?? 0;
        index = (doc ? arrayLength(doc, path) : 0) + used;
        synthetic.usedByArray.set(path, used + 1);
        synthetic.byElement.set(element, index);
      }
    }
    elements.push({ arrayPath: path, index, synthetic: isSynthetic, sideIndex, otherIndex });
    path = joinPath(path, String(index));
  }
  return { path, elements };
}

/** The `k`th (from 0) non-negative integer not in `skip`. */
function nthNotIn(k: number, skip: ReadonlySet<number>): number {
  let seen = -1;
  for (let i = 0; ; i++) {
    if (skip.has(i)) continue;
    seen++;
    if (seen === k) return i;
  }
}

/**
 * Where each element the tree does not hold goes when it is written, keyed by its
 * array and made-up index (`arrayPath` U+0000 `index`).
 *
 * A new element goes after the element it follows on the other side of the diff,
 * named by that element's index in the tree. That predecessor is found by counting,
 * with the changes to the array's elements: the elements on the other side are the
 * tree's, less those only the tree holds, plus those only the other side holds, in the
 * same order. So the element at other-side index t that the tree lacks follows the
 * (t - a)th element of the tree that the other side keeps, where a is the number of
 * other-only elements before t. It is the nearest element before it that the other side
 * keeps rather than one it deleted or added, because the deletes and the other
 * insertions are each staged on their own: whichever of them are written, the new
 * element stays next to the element it follows upstream.
 *
 * No position is given, and the element is appended, where the counting does not hold:
 * an array the diff reorders, an element the tree holds by merge key rather than by the
 * side's index (`byMergeKey`), or a predecessor past the tree's last element.
 */
function insertionsOf(
  located: { elements: ElementStep[] }[],
  reordered: ReadonlySet<string>,
  doc: TreeDocument | undefined,
  byMergeKey: boolean,
): Map<string, ArrayInsertion> {
  const treeOnly = new Map<string, Set<number>>();
  const otherOnly = new Map<string, Set<number>>();
  for (const { elements } of located) {
    for (const step of elements) {
      if (step.sideIndex >= 0 && step.otherIndex < 0) {
        if (!treeOnly.has(step.arrayPath)) treeOnly.set(step.arrayPath, new Set());
        treeOnly.get(step.arrayPath)!.add(step.sideIndex);
      } else if (step.sideIndex < 0 && step.otherIndex >= 0) {
        if (!otherOnly.has(step.arrayPath)) otherOnly.set(step.arrayPath, new Set());
        otherOnly.get(step.arrayPath)!.add(step.otherIndex);
      }
    }
  }
  const out = new Map<string, ArrayInsertion>();
  for (const { elements } of located) {
    for (const step of elements) {
      if (!step.synthetic) continue;
      const id = `${step.arrayPath}\u0000${step.index}`;
      if (out.has(id)) continue;
      const t = step.otherIndex;
      let after: number | undefined;
      if (t >= 0 && !byMergeKey && !reordered.has(step.arrayPath)) {
        const before = [...(otherOnly.get(step.arrayPath) ?? [])].filter((i) => i < t).length;
        const k = t - before - 1;
        after = k < 0 ? -1 : nthNotIn(k, treeOnly.get(step.arrayPath) ?? new Set());
        if (after >= (doc ? arrayLength(doc, step.arrayPath) : 0)) after = undefined;
      }
      out.set(id, {
        arrayPath: step.arrayPath,
        index: step.index,
        ...(after !== undefined ? { after } : {}),
        order: t >= 0 ? t : step.index,
      });
    }
  }
  return out;
}

/** The insertion of the outermost element of `elements` the tree does not hold. */
function insertionFor(elements: ElementStep[], insertions: Map<string, ArrayInsertion>): ArrayInsertion | undefined {
  const step = elements.find((e) => e.synthetic);
  return step ? insertions.get(`${step.arrayPath}\u0000${step.index}`) : undefined;
}

// ============================================================================
// VALUES
// ============================================================================

/** A leaf's value as the tree writes it, and the type to write it back as. */
interface Leaf {
  text: string;
  type: LeafValueType | undefined;
}

/**
 * A scalar's text as the tree writes the value, and its type. The server sends a
 * scalar's text as YAML wrote it (`1.0`, `~`, `0x1F`); the tree writes `String()` of what
 * the `yaml` package parsed (`1`, `null`, `31`). A string is text already, and re-reading
 * it would turn a quoted `"1.0"` into `1`. A float or null has no data type, and is typed
 * by what its text parses to.
 */
function scalarLeaf(text: string | undefined, dataType: string | undefined): Leaf {
  const raw = text ?? '';
  if (dataType === 'string') return { text: raw, type: 'string' };
  try {
    const value: unknown = parseYaml(raw, YAML_READ_OPTIONS);
    const type = dataType === 'int' ? 'int' : dataType === 'bool' ? 'bool' : leafValueTypeOf(value);
    return { text: String(value), type };
  } catch {
    return { text: raw, type: undefined };
  }
}

/** As configParser's flattenObject, but rooted at '' for the change's own path. */
function flattenInto(value: unknown, prefix: string, out: Map<string, Leaf>): void {
  if (value === null || value === undefined || typeof value !== 'object') {
    out.set(prefix, { text: String(value), type: leafValueTypeOf(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flattenInto(item, joinPath(prefix, String(i)), out));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    flattenInto(item, joinPath(prefix, key), out);
  }
}

/** One side of a change as leaves relative to its path; '' is the path itself. */
function sideLeaves(present: boolean, text: string | undefined, dataType: string | undefined): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  if (!present) return out;
  if (dataType === 'YAML') {
    try {
      flattenInto(parseYaml(text ?? '', YAML_READ_OPTIONS), '', out);
    } catch {
      out.set('', { text: text ?? '', type: undefined });
    }
    return out;
  }
  out.set('', scalarLeaf(text, dataType));
  return out;
}

// ============================================================================
// ROWS
// ============================================================================

/**
 * The leaves one change gives the tree. A block (a map or array, on either side) is
 * flattened into leaves under the change's path, since the tree stages and commits leaf
 * by leaf; a Replace from a scalar to a map is the scalar's removal and the map's leaves.
 */
function changeRows(
  change: PathChange,
  base: string,
  scope: DocumentScope | undefined,
  insertion: ArrayInsertion | undefined,
): KeyedFieldDiff[] {
  const from = sideLeaves(change.ChangeType !== 'Add', change.FromValue, change.FromDataType);
  const to = sideLeaves(change.ChangeType !== 'Delete', change.ToValue, change.ToDataType);
  const rows: KeyedFieldDiff[] = [];
  for (const rel of new Set([...from.keys(), ...to.keys()])) {
    const oldLeaf = from.get(rel);
    const newLeaf = to.get(rel);
    if (oldLeaf?.text === newLeaf?.text) continue;
    const path = joinPath(base, rel);
    rows.push({
      key: docStageKey(scope, path),
      path,
      ...(rel === '' && change.Path ? { resolvedPath: change.Path } : {}),
      oldValue: oldLeaf?.text ?? VALUE_PLACEHOLDER,
      newValue: newLeaf?.text ?? VALUE_PLACEHOLDER,
      ...(oldLeaf?.type ? { oldValueType: oldLeaf.type } : {}),
      ...(newLeaf?.type ? { newValueType: newLeaf.type } : {}),
      kind: oldLeaf === undefined ? 'Add' : newLeaf === undefined ? 'Delete' : 'Update',
      ...(insertion ? { insertion } : {}),
    });
  }
  return rows;
}

/** Split a merge-key identity the way the server's splitMergeKeyIdentity does. */
function splitIdentity(identity: string | undefined, count: number): string[] {
  const text = identity ?? '';
  if (count <= 1) return [text];
  const parts = text.split(',');
  return [...parts.slice(0, count - 1), parts.slice(count - 1).join(',')];
}

/**
 * A Rename is the element's merge-key field changing value while it stays the same
 * element, which in the tree is an Update of that field's leaf.
 */
function renameRows(change: PathChange, elementPath: string, scope: DocumentScope | undefined): KeyedFieldDiff[] {
  const segments = change.Segments ?? [];
  const keys = segments[segments.length - 1]?.MergeKeys ?? [];
  const before = splitIdentity(change.FromValue, keys.length);
  const after = splitIdentity(change.ToValue, keys.length);
  return keys.flatMap((kv, i) => {
    if (before[i] === after[i]) return [];
    const path = joinPath(elementPath, kv.Key ?? '');
    return [{ key: docStageKey(scope, path), path, oldValue: before[i], newValue: after[i], kind: 'Update' as const }];
  });
}

function wholeResourceKey(resource: ResourceInfo | undefined): string {
  return `${WHOLE_RESOURCE_KEY_PREFIX}${resource?.ResourceType ?? ''}\u0000${resource?.ResourceName ?? ''}`;
}

function wholeResourceRow(
  resourceDiff: ResourceDiff,
  docs: TreeDocument[],
  side: TreeSide,
): WholeResourceChange {
  const wholeResource = resourceDiff.ChangeType === 'Add' ? 'added' : 'deleted';
  const resource = resourceDiff.Resource;
  // Only the side holding the resource has a document for it: matching an added resource
  // against the From side would find a different one of the same name.
  const inTree = (wholeResource === 'deleted') === (side === 'from');
  const doc = inTree && docs.length > 1 ? documentFor(docs, resource) : undefined;
  return { key: doc?.scope?.id ?? wholeResourceKey(resource), wholeResource, resource };
}

/** How the tree relates to the diff. */
export interface TreeSideOptions {
  /** The side of the diff the tree draws. */
  treeSide: TreeSide;
  /**
   * The tree draws a configuration close to `treeSide` but not the same one, so the
   * side's array indices are not the tree's; elements with merge keys are found by them
   * in the tree. The post-upgrade variation takes this: its diff runs to what the
   * upgrade would make the Unit, while the tree draws the Unit as it is.
   */
  findElementsByMergeKey?: boolean;
}

/**
 * The rows of `diff` for the tree that draws `treeData`, the configuration on the
 * diff's `treeSide`.
 *
 * Old and new values are the From and To sides', in that order, whichever side the
 * tree is. A Reorder and a change to a comment have no row: the tree draws neither order
 * nor comments. A resource changed in a multi-document Unit but not found among the
 * tree's documents has no rows either, since a row the tree cannot draw would still be
 * counted, and the count and the rows must agree.
 */
export function fieldDiffsFromConfigDiff(
  diff: ConfigDiff | undefined,
  treeData: TreeData,
  { treeSide, findElementsByMergeKey = false }: TreeSideOptions,
): ConfigDiffRow[] {
  const resources = diff?.Resources ?? [];
  if (resources.length === 0) return [];
  const docs = treeDocumentsOf(treeData);
  const rows: ConfigDiffRow[] = [];
  for (const resourceDiff of resources) {
    if (resourceDiff.ChangeType === 'Add' || resourceDiff.ChangeType === 'Delete') {
      rows.push(wholeResourceRow(resourceDiff, docs, treeSide));
      continue;
    }
    const changes = resourceDiff.Changes ?? [];
    if (changes.length === 0) continue;
    const treeResource = treeSide === 'from'
      ? resourceDiff.PreviousResource ?? resourceDiff.Resource
      : resourceDiff.Resource;
    const doc = documentFor(docs, treeResource);
    if (!doc && docs.length > 1) continue;
    const scope = doc?.scope;
    const synthetic: SyntheticIndices = { byElement: new Map(), usedByArray: new Map() };
    const located: { change: PathChange; path: string; elements: ElementStep[] }[] = [];
    const reordered = new Set<string>();
    for (const change of changes) {
      if (change.Comment || change.ChangeType === 'None') continue;
      const { path, elements } = treePathOf(change.Segments ?? [], treeSide, doc, synthetic, findElementsByMergeKey);
      if (change.ChangeType === 'Reorder') reordered.add(path);
      else located.push({ change, path, elements });
    }
    const insertions = insertionsOf(located, reordered, doc, findElementsByMergeKey);
    for (const { change, path, elements } of located) {
      rows.push(...(change.ChangeType === 'Rename'
        ? renameRows(change, path, scope)
        : changeRows(change, path, scope, insertionFor(elements, insertions))));
    }
  }
  return rows;
}

/**
 * The leaves of a resource the diff adds whole, as one added row each, for a tree that
 * draws the To side and so holds the resource. A diff from the upstream to a Unit adds
 * whole each resource only the Unit has, and every leaf of it differs from the upstream.
 * Empty when the tree holds no document for the resource.
 */
export function addedResourceLeafRows(change: WholeResourceChange, treeData: TreeData): KeyedFieldDiff[] {
  if (change.wholeResource !== 'added') return [];
  const docs = treeDocumentsOf(treeData);
  const doc = docs.length === 1 ? docs[0] : docs.find((d) => d.scope?.id === change.key);
  if (!doc) return [];
  return doc.entries.map((entry) => {
    const newValueType = leafValueTypeOf(entry.value);
    return {
      key: docStageKey(doc.scope, entry.path),
      path: entry.path,
      oldValue: VALUE_PLACEHOLDER,
      newValue: String(entry.value),
      ...(newValueType ? { newValueType } : {}),
      kind: 'Add' as const,
    };
  });
}

// ============================================================================
// MERGE CONFLICTS
// ============================================================================

/** A path segment's text with the dots it escaped (`~1`) put back. */
function unescapeDots(text: string): string {
  return text.split('~1').join('.');
}

/**
 * The index of the element an associative segment names, from its body (after `?`).
 *
 * The grammar is yamlkit's AssociativePathSegment: `key=value`, or `k1=v1,k2=v2` for an
 * array with several merge keys, optionally followed by `;@index`, the element's
 * position where the path was recorded. A key starting with `~` makes the segment an
 * anchor, which names an element of an array with no merge key by a digest of its
 * content; the digest cannot be computed here, so the recorded position is taken.
 * `key=@index` names the element by position alone.
 */
function associativeIndex(doc: TreeDocument, arrayPath: string, body: string): number | undefined {
  let selector = body;
  let recorded: number | undefined;
  const at = body.lastIndexOf(';@');
  if (at >= 0) {
    selector = body.slice(0, at);
    const text = body.slice(at + 2);
    if (!/^\d+$/.test(text)) return undefined;
    recorded = Number(text);
  }
  const inArray = (i: number | undefined) => (i !== undefined && i < arrayLength(doc, arrayPath) ? i : undefined);

  const toPair = (text: string): MergeKeyValue | undefined => {
    const eq = text.indexOf('=');
    return eq < 0 ? undefined : { Key: unescapeDots(text.slice(0, eq)), Value: unescapeDots(text.slice(eq + 1)) };
  };
  // A sole merge key's value may itself hold a comma; only several keys are comma-joined.
  let pairs = selector.split(',').map(toPair);
  if (pairs.some((p) => p === undefined)) pairs = [toPair(selector)];
  if (pairs.some((p) => p === undefined)) return undefined;
  const parsed = pairs as MergeKeyValue[];

  if (parsed.length === 1 && recorded === undefined && /^@\d+$/.test(parsed[0].Value ?? '')) {
    return inArray(Number((parsed[0].Value ?? '').slice(1)));
  }
  if (parsed.some((p) => (p.Key ?? '').startsWith('~'))) return inArray(recorded);
  return elementByMergeKeys(doc, arrayPath, parsed, recorded);
}

/**
 * The stage key of the tree row a merge conflict names, or undefined when its path names
 * nothing the tree draws.
 *
 * A conflict carries only its resource and its path as MutationSources records it
 * (`spec.template.spec.containers.?name=web;@0.env.?name=LOG_LEVEL;@2.value`), with
 * array elements named by merge key. The tree names them by position, so each
 * associative segment is looked up in the tree's document. A path pattern (with `*`,
 * `|` or a parameter) and a comment's path name no row.
 */
export function resolveConflictPath(
  conflict: Pick<MutationConflict, 'Resource' | 'Path'>,
  treeData: TreeData,
): string | undefined {
  if (!conflict.Path) return undefined;
  const doc = documentFor(treeDocumentsOf(treeData), conflict.Resource);
  if (!doc) return undefined;

  let path = '';
  for (const segment of conflict.Path.split('.')) {
    if (segment.startsWith(COMMENT_KEY_PREFIX)) return undefined;
    if (segment.startsWith('?')) {
      const index = associativeIndex(doc, path, segment.slice(1));
      if (index === undefined) return undefined;
      path = joinPath(path, String(index));
      continue;
    }
    if (segment === '' || segment.startsWith('@') || /[*|]/.test(segment)) return undefined;
    path = joinPath(path, unescapeDots(segment));
  }

  const values = valuesOf(doc);
  const drawn = values.has(path) || doc.entries.some((e) => e.path.startsWith(`${path}.`));
  return drawn ? docStageKey(doc.scope, path) : undefined;
}
