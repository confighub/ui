// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Identity-keyed paths, for comparing one field across several deployments.
 *
 * THE RULE THIS MODULE EXISTS FOR: a list element is named by its own identity,
 * never by where it happens to sit in the list. `containers[api].image`, never
 * `containers.0.image`.
 *
 * A compare grid joins its columns on the path string. Join two deployments on
 * `containers.0.image` and the moment one of them carries an extra container the
 * grid places the api container beside the otel container, calls the difference
 * real, and states it with total confidence. Positional alignment does not make
 * the feature vaguer, it makes it report changes that never happened. The same
 * conclusion was reached for multi-document units, which are identified by
 * resource identity rather than by document order.
 *
 * THIS IS A SEPARATE NAMESPACE, not a replacement. The component view's
 * canonical path format is dot-index (`env.0.name`, see `componentKeyUtils.ts`)
 * and staging, `setValueAtPath`, `protectedPaths` and the prefix index all
 * assume it. Identity paths are read-only labels used for joining and display;
 * the positional path always travels beside them so a caller can still address
 * the underlying document.
 */

import { parseUnitDataStructured, type FieldEntry, type ResourceInfo } from '../configParser';

/**
 * Fields a list element may be identified by, in order of preference.
 *
 * These are Kubernetes' own strategic-merge-patch merge keys, which is what
 * makes them trustworthy: the API server already treats these as the identity
 * of an element in these lists, so keying on them here agrees with how the
 * cluster itself decides that two elements are the same element.
 */
const IDENTITY_FIELD_CANDIDATES: readonly string[] = [
  'name', // containers, env, volumes, ports (named), imagePullSecrets
  'key', // configMap/secret items, node selector terms
  'containerPort', // container ports, which are frequently unnamed
  'port', // service ports
  'mountPath', // volumeMounts
  'devicePath', // volumeDevices
  'topologyKey', // pod (anti-)affinity terms
  'ip', // hostAliases
  'secretName',
  'path', // HTTP probe paths, projected volume sources
];

/**
 * Maps whose keys are free-form text, so a dot in one is part of the KEY.
 *
 * The component view's parser splits every path on `.` before this module sees
 * it, so `annotations["kubectl.kubernetes.io/restartedAt"]` arrives as four
 * segments. Flat, that only made the printed label imprecise. Nested, it
 * manufactures folders — `annotations` › `kubectl` › `kubernetes` › `io/restartedAt`
 * — which are levels the document does not have, and it splits an identity
 * across a folder boundary, which is the thing this module exists to prevent.
 *
 * These are the Kubernetes maps that hold dotted keys. Under one of them the
 * remaining segments are one key and are rejoined into one token. It is a
 * bounded rule rather than a general fix: the general fix is changing the view's
 * canonical path format, which staging, `setValueAtPath` and `protectedPaths`
 * all read.
 *
 * TWO BOUNDARIES, both found by specs that failed when the rule was wider.
 *
 * ONLY WHEN THE KEY ACTUALLY HAS A DOT. A single trailing segment needs no
 * rejoining, and bracketing it anyway would reprint every ordinary
 * `labels.app` as `labels[app]` — noise on the common case to fix the rare one.
 *
 * AND `selector` IS NOT ON THE LIST, though a Service's selector is genuinely a
 * free-form map. In a Deployment it is a LabelSelector, whose `matchLabels` is
 * a STRUCTURAL field; treating it as free-form swallowed `matchLabels.app` into
 * `selector[matchLabels.app]` and collapsed a real level of the document. A
 * name that means a map in one Kind and a struct in another cannot be decided
 * from the path alone, so it stays off. `matchLabels` itself is on the list,
 * which is where the dotted keys actually live.
 */
const FREE_FORM_MAPS: ReadonlySet<string> = new Set([
  'annotations',
  'labels',
  'matchLabels',
  'nodeSelector',
  'data',
  'stringData',
  'binaryData',
]);

/**
 * Marks a list element that could not be identified and is aligned by position.
 *
 * Printed rather than hidden. A positional join is the one thing this module
 * exists to avoid, so where it is unavoidable — an unnamed list of scalars, an
 * element carrying none of the merge keys — the path says so rather than
 * passing itself off as an identity.
 */
export const POSITIONAL_MARKER = '#';

/** A scalar list element is keyed by its own value only when that value is unique among its siblings. */
function scalarIsUniqueAmongSiblings(
  siblingValues: readonly string[],
  value: string,
): boolean {
  let seen = 0;
  for (const sibling of siblingValues) {
    if (sibling === value) seen += 1;
    if (seen > 1) return false;
  }
  return seen === 1;
}

/** Bracket-quote a segment that would otherwise be ambiguous inside a dotted path. */
function quoteSegment(segment: string): string {
  return segment.replace(/([\\\]])/g, '\\$1');
}

/**
 * Append one map/object segment to an identity path.
 *
 * A map key is appended as written, dots and all.
 *
 * KNOWN, AND INHERITED: the component view's parser splits every path on `.`
 * before this module sees it, so a key that itself contains a dot —
 * `annotations["confighub.com/gate"]` — has already become the two segments
 * `confighub` and `com/gate` by the time it arrives, and cannot be put back
 * together here. The ambiguity is the whole view's, not this module's, and it
 * is applied identically to every deployment, so the JOIN this module exists to
 * make is still correct: the same key produces the same path in every column.
 * Only the printed label is less precise than it could be. Fixing it means
 * changing `flattenStructured`'s canonical path format, which staging,
 * `setValueAtPath`, `protectedPaths` and the prefix index all read.
 */
function appendKeySegment(prefix: string, segment: string): string {
  return prefix ? `${prefix}.${segment}` : segment;
}

/** Append one list-element segment to an identity path. */
function appendIndexSegment(prefix: string, token: string): string {
  return `${prefix}[${quoteSegment(token)}]`;
}

/** One document's leaves, addressable both ways. */
export interface IdentityIndexedDocument {
  /** Which resource this document is, when the unit holds more than one. */
  resource?: ResourceInfo;
  /** Identity path → the leaf's raw parsed value. */
  valueByIdentityPath: Map<string, unknown>;
  /** Identity path → the positional dot-index path the rest of the view uses. */
  positionalByIdentityPath: Map<string, string>;
  /**
   * The same mapping for every INTERMEDIATE prefix, not only the leaves.
   *
   * An edit that sets a field nothing has set yet has no leaf to look up, and
   * its canonical path cannot be guessed from the identity path: `containers[api]`
   * is `containers.0` in one deployment and `containers.1` in another, which is
   * the whole reason the paths are keyed by identity in the first place. The
   * prefixes are what let such a path be resolved against THIS document rather
   * than assumed from another one.
   */
  positionalByIdentityPrefix: Map<string, string>;
}

/** A unit's leaves, one entry per document it holds. */
export interface IdentityIndexedUnit {
  documents: IdentityIndexedDocument[];
}

/**
 * Key a document so the same resource joins across deployments.
 *
 * THE NAME IS DELIBERATELY NOT IN THE KEY BY DEFAULT, and that is the whole
 * subtlety. Within ONE unit, a resource is identified by type AND name — that is
 * this repo's settled rule, and it is what tells a Deployment from a ConfigMap
 * and one ConfigMap from another. Across DEPLOYMENTS of the same unit, the name
 * is one of the values being compared: a resource routinely carries its own
 * space's name. Keying the join on it means the documents stop joining at
 * exactly the moment there is a difference worth showing, and each column then
 * reads as though the other deployment had no such resource at all.
 *
 * So the name enters the key only where it is doing the job it was meant for:
 * telling two documents of the SAME Kind apart inside one unit. `ambiguousKinds`
 * names those Kinds, and it is computed across every column at once so all of
 * them key the same way.
 */
export function documentKey(
  resource: ResourceInfo | undefined,
  ordinal: number,
  ambiguousKinds?: ReadonlySet<string>,
): string {
  const kind = resource?.ResourceType ?? '';
  // A document with no identity at all can only be joined by its position in the
  // unit, which is the very thing this module exists to avoid one level down. It
  // is marked so it can be SEEN rather than joined quietly: a format with no
  // resource concept (ini, properties, plain JSON) reaches this, and so would a
  // Kubernetes document that failed to parse.
  if (!kind) return `${POSITIONAL_MARKER}doc:${ordinal}`;
  if (ambiguousKinds?.has(kind)) {
    return `${kind}/${resource?.ResourceName ?? `${POSITIONAL_MARKER}${ordinal}`}`;
  }
  return kind;
}

/**
 * The Kinds that appear more than once in any one unit, and therefore need
 * their name to be told apart.
 *
 * Computed over every column together: a Kind that is unique in one deployment
 * and duplicated in another must key the same way in both, or the two would not
 * join for the opposite reason.
 */
export function ambiguousKindsAcross(units: readonly IdentityIndexedUnit[]): Set<string> {
  const ambiguous = new Set<string>();
  for (const unit of units) {
    const seen = new Set<string>();
    for (const document of unit.documents) {
      const kind = document.resource?.ResourceType;
      if (!kind) continue;
      if (seen.has(kind)) ambiguous.add(kind);
      seen.add(kind);
    }
  }
  return ambiguous;
}

/**
 * The identity token for one element of the array at `arrayPath`.
 *
 * Returns `undefined` when the element cannot be identified, which is the
 * caller's cue to fall back to a marked positional token rather than to invent
 * one.
 */
function identityTokenFor(
  arrayPath: string,
  index: number,
  valueByPositionalPath: Map<string, unknown>,
  scalarSiblings: Map<string, string[]>,
): string | undefined {
  for (const field of IDENTITY_FIELD_CANDIDATES) {
    const candidate = valueByPositionalPath.get(`${arrayPath}.${index}.${field}`);
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === 'object') continue;
    const token = String(candidate);
    if (token.length > 0) return token;
  }

  // A list of scalars (`args`, `command`) has no merge key. Its own value is the
  // only identity available, and only when no sibling repeats it.
  const own = valueByPositionalPath.get(`${arrayPath}.${index}`);
  if (own !== undefined && own !== null && typeof own !== 'object') {
    const token = String(own);
    const siblings = scalarSiblings.get(arrayPath);
    if (siblings && scalarIsUniqueAmongSiblings(siblings, token)) return token;
  }

  return undefined;
}

/**
 * Build the identity path for one leaf.
 *
 * `segments` alternates map keys (strings) and list indices (numbers), exactly
 * as `parseUnitDataStructured` emits them.
 */
function identityPathFor(
  segments: readonly (string | number)[],
  valueByPositionalPath: Map<string, unknown>,
  scalarSiblings: Map<string, string[]>,
  tokenCache: Map<string, string>,
  prefixes?: Map<string, string>,
): string {
  let positional = '';
  let identity = '';

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] as string | number;
    // A free-form map's key is everything after it, however many dots the
    // parser split it into.
    if (
      typeof segment === 'string' &&
      FREE_FORM_MAPS.has(segment) &&
      i + 2 < segments.length &&
      segments.slice(i + 1).every((rest) => typeof rest === 'string')
    ) {
      identity = appendKeySegment(identity, segment);
      positional = positional ? `${positional}.${segment}` : segment;
      prefixes?.set(identity, positional);
      const key = segments.slice(i + 1).join('.');
      identity = appendIndexSegment(identity, key);
      positional = `${positional}.${key}`;
      prefixes?.set(identity, positional);
      return identity;
    }
    if (typeof segment === 'number') {
      const cacheKey = `${positional}.${segment}`;
      let token = tokenCache.get(cacheKey);
      if (token === undefined) {
        const resolved = identityTokenFor(positional, segment, valueByPositionalPath, scalarSiblings);
        token = resolved ?? `${POSITIONAL_MARKER}${segment}`;
        tokenCache.set(cacheKey, token);
      }
      identity = appendIndexSegment(identity, token);
      positional = positional ? `${positional}.${segment}` : String(segment);
      prefixes?.set(identity, positional);
      continue;
    }

    identity = appendKeySegment(identity, segment);
    positional = positional ? `${positional}.${segment}` : segment;
    prefixes?.set(identity, positional);
  }

  return identity;
}

/** Collect the scalar members of every array, so a scalar element can be keyed by its own value. */
function collectScalarSiblings(entries: readonly FieldEntry[]): Map<string, string[]> {
  const byArray = new Map<string, string[]>();
  for (const entry of entries) {
    const last = entry.segments[entry.segments.length - 1];
    if (typeof last !== 'number') continue;
    if (entry.value === null || entry.value === undefined || typeof entry.value === 'object') continue;
    const arrayPath = entry.segments.slice(0, -1).join('.');
    const bucket = byArray.get(arrayPath);
    if (bucket) bucket.push(String(entry.value));
    else byArray.set(arrayPath, [String(entry.value)]);
  }
  return byArray;
}

/**
 * Index one unit's configuration by identity path.
 *
 * Every document in a multi-document unit is indexed separately, because two
 * documents routinely carry the same path and joining them would silently
 * compare a Deployment's `metadata.name` against a ConfigMap's.
 */
export function indexUnitByIdentity(data: string | undefined): IdentityIndexedUnit {
  const entries = parseUnitDataStructured(data);
  if (entries.length === 0) return { documents: [] };

  // `parseUnitDataStructured` emits documents in order and in one run, so a
  // change of resource identity marks a document boundary.
  const documents: IdentityIndexedDocument[] = [];
  const perDocument: FieldEntry[][] = [];
  let currentResource: ResourceInfo | undefined;
  let current: FieldEntry[] | undefined;
  let seenPaths = new Set<string>();

  for (const entry of entries) {
    // A path is unique within one document, so a repeat is a document boundary.
    // That covers the case two adjacent documents carry no identity at all and
    // the resource reference therefore never changes.
    if (current === undefined || entry.resource !== currentResource || seenPaths.has(entry.path)) {
      current = [];
      seenPaths = new Set<string>();
      perDocument.push(current);
      currentResource = entry.resource;
    }
    current.push(entry);
    seenPaths.add(entry.path);
  }

  for (const docEntries of perDocument) {
    const valueByPositionalPath = new Map<string, unknown>();
    for (const entry of docEntries) valueByPositionalPath.set(entry.path, entry.value);

    const scalarSiblings = collectScalarSiblings(docEntries);
    const tokenCache = new Map<string, string>();
    const valueByIdentityPath = new Map<string, unknown>();
    const positionalByIdentityPath = new Map<string, string>();
    const positionalByIdentityPrefix = new Map<string, string>();

    for (const entry of docEntries) {
      const identity = identityPathFor(
        entry.segments,
        valueByPositionalPath,
        scalarSiblings,
        tokenCache,
        positionalByIdentityPrefix,
      );
      valueByIdentityPath.set(identity, entry.value);
      positionalByIdentityPath.set(identity, entry.path);
    }

    documents.push({
      resource: docEntries[0]?.resource,
      valueByIdentityPath,
      positionalByIdentityPath,
      positionalByIdentityPrefix,
    });
  }

  return { documents };
}

/** Split an identity path into its printable segments, honouring bracket quoting. */
export function splitIdentityPath(path: string): string[] {
  const segments: string[] = [];
  let buffer = '';
  let inBracket = false;

  for (let i = 0; i < path.length; i += 1) {
    const char = path[i];
    if (char === '\\' && inBracket) {
      i += 1;
      buffer += path[i] ?? '';
      continue;
    }
    if (char === '[' && !inBracket) {
      if (buffer) {
        segments.push(buffer);
        buffer = '';
      }
      inBracket = true;
      buffer = '[';
      continue;
    }
    if (char === ']' && inBracket) {
      inBracket = false;
      segments.push(`${buffer}]`);
      buffer = '';
      continue;
    }
    if (char === '.' && !inBracket) {
      if (buffer) segments.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer) segments.push(buffer);
  return segments;
}

/** Join printable segments back into a path, keeping bracket segments flush against what precedes them. */
export function joinIdentitySegments(segments: readonly string[]): string {
  let out = '';
  for (const segment of segments) {
    if (segment.startsWith('[')) out += segment;
    else out = out ? `${out}.${segment}` : segment;
  }
  return out;
}

/** True when any segment of the path fell back to positional alignment. */
export function pathIsPositional(path: string): boolean {
  return splitIdentityPath(path).some((segment) => segment.startsWith(`[${POSITIONAL_MARKER}`));
}

/**
 * The canonical dot-index path this identity path names IN THIS DOCUMENT.
 *
 * THE WHOLE POINT, AND THE RISK. `containers[api].image` is `containers.0.image`
 * in one deployment and `containers.1.image` in another. An edit that took
 * another column's canonical path and wrote it to a sibling would set a
 * DIFFERENT container's image and report success — the same class of silent
 * wrong answer as aligning lists by position, arrived at from the writing side
 * instead of the reading side. So the path is resolved against the document
 * being written, every time, and never carried across from another column.
 *
 * Returns `undefined` when the path cannot be expressed here, which is the
 * caller's cue to refuse the edit rather than approximate it. That happens when
 * a list element on the way to the field does not exist in this document — you
 * cannot set `containers[debug].image` on a deployment that has no `debug`
 * container without also deciding where in the list it goes, which is a
 * different operation from editing a value.
 */
export function resolveIdentityPath(
  document: IdentityIndexedDocument,
  identityPath: string,
): string | undefined {
  const known = document.positionalByIdentityPath.get(identityPath);
  if (known !== undefined) return known;

  const segments = splitIdentityPath(identityPath);
  for (let cut = segments.length - 1; cut > 0; cut -= 1) {
    const prefix = joinIdentitySegments(segments.slice(0, cut));
    const positionalPrefix = document.positionalByIdentityPrefix.get(prefix);
    if (positionalPrefix === undefined) continue;
    const rest = segments.slice(cut);
    // A bracket in the tail is a list element this document does not have.
    if (rest.some((segment) => segment.startsWith('['))) return undefined;
    return [positionalPrefix, ...rest].join('.');
  }

  // Nothing of the path exists here. A single plain segment is a root-level
  // field, which any document can take; anything deeper is not expressible.
  if (segments.length === 1 && !segments[0]?.startsWith('[')) return segments[0];
  return undefined;
}

/** True when this document could only be joined across deployments by its position. */
export function documentKeyIsPositional(docKey: string): boolean {
  return docKey.includes(`${POSITIONAL_MARKER}doc:`) || docKey.includes(`/${POSITIONAL_MARKER}`);
}
