// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The lines of a Unit's YAML that its guards are recorded on, for an editor to mark. Kept free of
 * React and of the editor so it can be checked without a page.
 */
import { guardText } from '@/utility/clearance-functions';
import { sameKubernetesResourceType } from '@/utility/resource-type-functions';
import type { PathAnnotationList, ResourcePathAnnotations } from '@confighub/rtk-query';
import {
  type Document,
  LineCounter,
  type Node as YamlNode,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
} from 'yaml';

/** One guard on a line: `key=value`, and whether clones and downstream Units receive it. */
export interface GuardOnLine {
  key: string;
  value: string;
  inherited: boolean;
}

/** A line (1-based) that a guard is recorded on, with the guards recorded there. */
export interface GuardedLine {
  line: number;
  guards: GuardOnLine[];
}

/**
 * The size past which the lines are not worked out, as the editor stops its per-line work past
 * the same size: parsing a multi-megabyte stream to mark a few lines is not worth the stall.
 */
export const GUARDED_LINES_MAX_LENGTH = 256 * 1024;

/** The prefix of the keys the server writes YAML comments under; such a path names no line. */
const COMMENT_KEY_PREFIX = '$comment$';

/** A guard as the hover says it: `key=value`, and `(inherited)` after one that is. */
export const guardOnLineText = (guard: GuardOnLine): string =>
  `${guardText({ Key: guard.key, Value: guard.value })}${guard.inherited ? ' (inherited)' : ''}`;

/** A path segment's text with the dots it escaped (`~1`) put back. */
const unescapeDots = (text: string): string => text.split('~1').join('.');

/** A scalar's text, as a merge key's value is written in a path. */
const scalarText = (node: unknown): string | undefined =>
  isScalar(node) && node.value !== null && typeof node.value !== 'object'
    ? String(node.value)
    : undefined;

/** One document of the stream, with the resource it holds. */
interface StreamDocument {
  doc: Document.Parsed;
  resourceType?: string;
  /** `namespace/name`, as the server names a Kubernetes resource. */
  resourceName?: string;
  /** The name without its namespace. */
  name?: string;
}

function streamDocument(doc: Document.Parsed): StreamDocument {
  const text = (path: string[]) => {
    const value = doc.getIn(path);
    return typeof value === 'string' ? value : undefined;
  };
  const apiVersion = text(['apiVersion']);
  const kind = text(['kind']);
  const name = text(['metadata', 'name']);
  const namespace = text(['metadata', 'namespace']);
  return {
    doc,
    resourceType: apiVersion && kind ? `${apiVersion}/${kind}` : undefined,
    resourceName: name !== undefined ? `${namespace ?? ''}/${name}` : undefined,
    name,
  };
}

const withoutScope = (name: string): string => name.slice(name.indexOf('/') + 1);

/**
 * The document each annotated resource is, matched as the server matches a stored record: by type
 * in any API version and by name; failing that, by the name without its namespace, or by a name
 * the resource had before. Only a match to exactly one document counts, and a document another
 * entry's name matched exactly is not matched again by a looser rule, so an entry that names no
 * document unambiguously marks nothing. Never by position.
 */
function documentsFor(
  entries: readonly ResourcePathAnnotations[],
  docs: readonly StreamDocument[],
): Map<ResourcePathAnnotations, StreamDocument> {
  const matched = new Map<ResourcePathAnnotations, StreamDocument>();
  const claimed = new Set<StreamDocument>();
  const sameType = (entry: ResourcePathAnnotations, doc: StreamDocument) =>
    !!entry.Resource?.ResourceType &&
    !!doc.resourceType &&
    sameKubernetesResourceType(entry.Resource.ResourceType, doc.resourceType);
  const only = (candidates: StreamDocument[]) =>
    candidates.length === 1 ? candidates[0] : undefined;

  for (const entry of entries) {
    const doc = only(
      docs.filter(
        (d) => sameType(entry, d) && d.resourceName === entry.Resource?.ResourceName,
      ),
    );
    if (doc) {
      matched.set(entry, doc);
      claimed.add(doc);
    }
  }
  for (const entry of entries) {
    if (matched.has(entry)) continue;
    const open = docs.filter((d) => !claimed.has(d) && sameType(entry, d));
    const unscoped =
      entry.Resource?.ResourceNameWithoutScope ||
      (entry.Resource?.ResourceName ? withoutScope(entry.Resource.ResourceName) : '');
    const doc =
      (unscoped ? only(open.filter((d) => d.name === unscoped)) : undefined) ??
      only(open.filter((d) => !!d.resourceName && d.resourceName in (entry.Aliases ?? {})));
    if (doc) matched.set(entry, doc);
  }
  return matched;
}

/**
 * The index of the element of `seq` an associative segment names, from its body (after `?`):
 * `key=value`, or `k1=v1,k2=v2` for several merge keys, optionally followed by `;@index`, the
 * element's position where the path was recorded, which is tried first; or `key=@index`, the
 * element by position alone. A segment whose key starts with `~` is an anchor, naming an element
 * by a digest of its content that cannot be computed here, so it names nothing.
 */
function associativeIndex(seq: { items: unknown[] }, body: string): number | undefined {
  let selector = body;
  let recorded: number | undefined;
  const at = body.lastIndexOf(';@');
  if (at >= 0) {
    selector = body.slice(0, at);
    const text = body.slice(at + 2);
    if (!/^\d+$/.test(text)) return undefined;
    recorded = Number(text);
  }
  const toPair = (text: string) => {
    const eq = text.indexOf('=');
    return eq < 0
      ? undefined
      : { key: unescapeDots(text.slice(0, eq)), value: unescapeDots(text.slice(eq + 1)) };
  };
  // A sole merge key's value may itself hold a comma; only several keys are comma-joined.
  let pairs = selector.split(',').map(toPair);
  if (pairs.some((p) => p === undefined)) pairs = [toPair(selector)];
  if (pairs.some((p) => p === undefined)) return undefined;
  const parsed = pairs as { key: string; value: string }[];

  const inSeq = (i: number) => (i < seq.items.length ? i : undefined);
  if (parsed.length === 1 && recorded === undefined && /^@\d+$/.test(parsed[0].value)) {
    return inSeq(Number(parsed[0].value.slice(1)));
  }
  if (parsed.some((p) => p.key.startsWith('~'))) return undefined;
  const matches = (i: number) => {
    const item = seq.items[i];
    return isMap(item) && parsed.every((p) => scalarText(item.get(p.key, true)) === p.value);
  };
  if (recorded !== undefined && recorded < seq.items.length && matches(recorded))
    return recorded;
  for (let i = 0; i < seq.items.length; i++) if (matches(i)) return i;
  return undefined;
}

/**
 * The offset of the line a path names in a document: the line of its key, or of the element it
 * ends at. Undefined for a path the document does not hold -- a guard on a field not there yet --
 * and for a form that cannot be placed here: a pattern (`*`, `|`), a parameter (`@`), an anchor
 * (`?~h=...`), or a comment's path.
 */
function pathOffset(doc: Document.Parsed, path: string): number | undefined {
  if (!path) return undefined;
  let node: unknown = doc.contents;
  let offset: number | undefined;
  for (const segment of path.split('.')) {
    if (
      segment === '' ||
      segment.startsWith(COMMENT_KEY_PREFIX) ||
      segment.startsWith('@') ||
      /[*|]/.test(segment)
    ) {
      return undefined;
    }
    if (isMap(node)) {
      if (segment.startsWith('?')) return undefined;
      const key = unescapeDots(segment);
      const pair = node.items.find((p) => scalarText(p.key) === key);
      const keyRange = (pair?.key as YamlNode | undefined)?.range;
      if (!pair || !keyRange) return undefined;
      offset = keyRange[0];
      node = pair.value;
      continue;
    }
    if (isSeq(node)) {
      const index = segment.startsWith('?')
        ? associativeIndex(node, segment.slice(1))
        : /^\d+$/.test(segment)
          ? Number(segment)
          : undefined;
      if (index === undefined || index >= node.items.length) return undefined;
      const item = node.items[index] as YamlNode | null;
      if (!item?.range) return undefined;
      offset = item.range[0];
      node = item;
      continue;
    }
    return undefined;
  }
  return offset;
}

/** The guards recorded at one entry of a resource's annotations. */
function guardsOf(
  annotations: Record<string, Record<string, string>> | undefined,
): GuardOnLine[] {
  const inherited = annotations?.GuardInherited ?? {};
  return Object.entries(annotations?.Guard ?? {}).map(([key, value]) => ({
    key,
    value,
    inherited: key in inherited,
  }));
}

/**
 * The lines of `data` that the guards in `annotations` are recorded on. A guard on a path marks
 * the line of the path's key, or of the list element the path ends at; a guard on a resource as
 * a whole marks the resource's first line. Each annotated resource is found among the documents
 * by type and name. A path that cannot be placed marks nothing, rather than a guessed line.
 *
 * The lines are of `data` as given: an edit made since moves them.
 */
export function guardedLines(
  data: string | undefined,
  annotations: PathAnnotationList | null | undefined,
): GuardedLine[] {
  const entries = (annotations ?? []).filter(
    (entry) =>
      Object.keys(entry.ResourceAnnotations?.Guard ?? {}).length > 0 ||
      Object.values(entry.PathAnnotationMap ?? {}).some(
        (path) => Object.keys(path?.Guard ?? {}).length > 0,
      ),
  );
  if (!data || entries.length === 0 || data.length > GUARDED_LINES_MAX_LENGTH) return [];

  const lineCounter = new LineCounter();
  let docs: StreamDocument[];
  try {
    docs = parseAllDocuments(data, { lineCounter, uniqueKeys: false })
      .filter((doc) => isMap(doc.contents))
      .map(streamDocument);
  } catch {
    return [];
  }

  const byLine = new Map<number, Map<string, GuardOnLine>>();
  const mark = (offset: number | undefined, guards: GuardOnLine[]) => {
    if (offset === undefined || guards.length === 0) return;
    const line = lineCounter.linePos(offset).line;
    const onLine = byLine.get(line) ?? new Map<string, GuardOnLine>();
    for (const guard of guards) onLine.set(guardOnLineText(guard), guard);
    byLine.set(line, onLine);
  };

  for (const [entry, { doc }] of documentsFor(entries, docs)) {
    mark((doc.contents as YamlNode | null)?.range?.[0], guardsOf(entry.ResourceAnnotations));
    for (const [path, pathAnnotations] of Object.entries(entry.PathAnnotationMap ?? {})) {
      const guards = guardsOf(pathAnnotations);
      if (guards.length > 0) mark(pathOffset(doc, path), guards);
    }
  }

  // By code point, as the server orders guard keys, so the hover lists them as the dialog does.
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, guards]) => ({
      line,
      guards: [...guards.values()].sort(
        (a, b) => compare(a.key, b.key) || compare(a.value, b.value),
      ),
    }));
}
