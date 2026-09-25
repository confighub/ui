// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { isMap, isScalar, isSeq, LineCounter, parse as parseYaml, parseAllDocuments, stringify as stringifyYaml } from 'yaml';
import type { ResourceInfo } from '@confighub/rtk-query';

// ============================================================================
// PARSE CACHE
// ============================================================================

/**
 * Bounded LRU cache for full-parse results, keyed on the raw `data` string.
 *
 * `parseUnitData` / `parseUnitDataStructured` YAML/JSON-parse +
 * recursively flatten the ENTIRE (multi-MB) unit configuration, and are each invoked
 * several times per unit per build (diff old+new, build paths, field-path meta)
 * AND re-run on every RTK poll. Keying on the Data string itself is stable and
 * content-addressed: identical bytes → identical parse, so there is no staleness
 * even though RTK replaces the units array (and thus the wrapping objects) on
 * every poll while the Data payload is unchanged. A new Data version is a new
 * key and parses fresh.
 *
 * The returned structures are treated as READ-ONLY by all callers (they only
 * `.get()` / `.entries()` / `.find()` / iterate — verified across InspectPanel,
 * entryBuilders, ComponentValuesSection, useSetAttributesMutation), so it is safe
 * to hand out the same shared instance across calls. The budget bounds memory
 * growth across many units/polls; least-recently-used entries are evicted first.
 */

/**
 * Maximum number of cached entries.
 *
 * A single unit contributes THREE distinct data strings to a component build
 * (upstream, downstream and the live/edited copy), so an N-unit component needs
 * ~3N slots to stay resident. The previous flat cap of 50 therefore started
 * evicting live entries at 17 units, and every RTK poll re-parsed multi-MB
 * payloads that were still on screen. Measured cost of one poll's re-parse under
 * the old cap: 16 units 22.6ms, 17 units 38ms, 20 units 89ms, 50 units 208ms —
 * i.e. the cliff is exactly where 3N crosses 50.
 *
 * 150 slots keeps a 50-unit component fully resident with headroom for a version
 * or two in flight, which comfortably covers the ~30-unit components we size for.
 */
const PARSE_CACHE_MAX_ENTRIES = 150;

/**
 * Maximum total source bytes (summed `data.length` of the cached payloads) held
 * by one cache.
 *
 * The entry cap alone is not a memory bound: 150 slots of ordinary KB-sized units
 * is nothing, but 150 slots of the 5.3MB kyverno CRD unit would
 * pin gigabytes once the parsed structures are counted. 32MB of source keeps four
 * of those monsters resident — enough that flipping between the handful of huge
 * units in a component never re-parses — while a component of ordinary units
 * never approaches the limit and is bounded by the entry cap instead.
 *
 * Both budgets are enforced together: entries are evicted LRU-first until the
 * cache is under BOTH. The most recently inserted entry is never evicted, so a
 * single oversized payload is still cached (and simply evicts everything else)
 * rather than thrashing on every call.
 */
const PARSE_CACHE_MAX_BYTES = 32 * 1024 * 1024;

interface ParseCacheLimits {
  maxEntries: number;
  maxBytes: number;
}

const DEFAULT_PARSE_CACHE_LIMITS: ParseCacheLimits = {
  maxEntries: PARSE_CACHE_MAX_ENTRIES,
  maxBytes: PARSE_CACHE_MAX_BYTES,
};

function makeParseCache<T>(
  compute: (data: string) => T,
  limits: ParseCacheLimits = DEFAULT_PARSE_CACHE_LIMITS,
): (data: string | undefined) => T {
  const cache = new Map<string, T>();
  const empty = compute('');
  let cachedBytes = 0;
  return (data: string | undefined): T => {
    if (!data) return empty;
    const hit = cache.get(data);
    if (hit !== undefined) {
      // Refresh recency: re-insert so it moves to the most-recent position.
      cache.delete(data);
      cache.set(data, hit);
      return hit;
    }
    const value = compute(data);
    cache.set(data, value);
    cachedBytes += data.length;
    // Evict least-recently-used entries (first key in insertion order) until the
    // cache is within BOTH budgets. Never evict the entry just inserted, so an
    // oversized payload is still cached rather than re-parsed on every call.
    while (
      cache.size > 1
      && (cache.size > limits.maxEntries || cachedBytes > limits.maxBytes)
    ) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
      cachedBytes -= oldest.length;
    }
    return value;
  };
}

// ============================================================================
// DATA PARSING
// ============================================================================

/** Parse INI-style content (must have at least one [section] header) into a flat map of section.key → value. Returns null if content lacks section headers or contains lines without key=value pairs. */
function parseIni(content: string): Map<string, string> | null {
  const lines = content.split('\n');
  let section = '';
  let foundSection = false;
  const result = new Map<string, string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      foundSection = true;
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return null; // Not INI
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    result.set(section ? `${section}.${key}` : key, value);
  }

  return foundSection ? result : null;
}

/** Parse Properties/Env-style content into a flat map. Returns null if not Properties. */
function parseProperties(content: string): Map<string, string> | null {
  const lines = content.split('\n');
  const result = new Map<string, string>();
  let hasEntries = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return null; // Not Properties
    result.set(line.slice(0, eqIdx).trim(), line.slice(eqIdx + 1).trim());
    hasEntries = true;
  }

  return hasEntries ? result : null;
}

/** Line-based fallback: map each line to its 1-based line number. */
function parseAsLines(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) result.set(`[${i + 1}]`, lines[i]);
  }
  return result;
}

/**
 * Options for every read-only YAML parse in this module.
 *
 * `uniqueKeys` (the duplicate-key check) is QUADRATIC in the WIDTH of a map — the
 * composer compares each new key against every key already in that map.
 *
 * Measured through `parseUnitData` (see componentTreePipeline.bench.test.ts):
 *
 *              4,000 keys   16,000 keys   scaling for 4x the keys
 *   on (old)     141ms        1,830ms       13.0x   ← quadratic
 *   off (new)     25ms           94ms        3.7x   ← near-linear
 *
 * So a wide unit — a big ConfigMap, or a properties/env-style AppConfig — parses
 * ~19x faster. Note this is width-specific: it is worth ~nothing on the kyverno
 * CRD fixture, whose maps are thousands of NARROW, deep ones rather than a few
 * wide ones. It removes a cliff rather than shaving the common case.
 *
 * Turning it off does not change what we produce. A duplicate key was ALREADY
 * last-wins here: the check only records an error on the Document, and this
 * module's read path never inspects `doc.errors` — it calls `toJSON()`, which
 * assigns pairs in order, so the later value already won. (The single-doc
 * `parse()` helper does throw on that error, but the old code caught the throw
 * and fell straight through to `parseAllDocuments`, which does not — so the
 * observable result was last-wins either way.)
 *
 * Scope: this is the READ/display path only. The write path (`setValueAtPath` /
 * `deleteValueAtPath`) deliberately keeps the default options, because there a
 * duplicate-key error makes `parse()` throw and the write is reported as an
 * unsupported format rather than silently rewriting the wrong key.
 */
const YAML_READ_OPTIONS = { uniqueKeys: false } as const;

/** A YAML/JSON stream parsed exactly once: each document's plain value + its resource identity. */
interface ParsedDocs {
  /** Each document's plain-JS value, in stream order. Entries may be null (empty documents). */
  docs: unknown[];
  /** Resource identity per document, index-aligned with {@link docs}. */
  resources: (ResourceInfo | undefined)[];
}

/**
 * Parse a YAML/JSON stream ONCE into plain values, or null when the content is
 * not YAML at all (or holds no non-null document).
 *
 * This replaces the old "try single-doc `parse()`, then re-parse the whole thing
 * with `parseAllDocuments()`" pair, which ran independently inside BOTH
 * `parseUnitData` and `parseUnitDataStructured`.
 *
 * Two things were wrong with that, and it is worth being precise about which one
 * actually cost the time:
 *
 *  - The speculative `parse()` was NOT a second full parse. `parseDocument` stops
 *    as soon as a second document is composed, so on a multi-doc payload it only
 *    parses the first document — 6ms of the kyverno fixture's 5.3MB. It was also
 *    redundant even when it SUCCEEDED, because a successful single-doc parse is
 *    exactly `docs[0]`, flattened by the same code path. Removing it is right, but
 *    it is a cleanup, not the win.
 *  - The real cost was that the flat and structured flatteners each parsed the
 *    SAME payload for themselves. ComponentValuesSection memoizes
 *    `buildFieldPathMeta(unit.data)` beside the flat parse of that identical
 *    string, so opening one component parsed its bytes three times (old, new, and
 *    old again structurally) instead of twice. Sharing this result removes a whole
 *    parse from every build: measured 1,161ms → 891ms end-to-end on the 5.3MB
 *    fixture (~23%), with the remaining ~700ms being the two parses a build
 *    genuinely needs.
 *
 * Single-document input is simply `docs.length === 1`.
 */
function parseDocsOnceUncached(content: string): ParsedDocs | null {
  try {
    const parsed = parseAllDocuments(content, YAML_READ_OPTIONS);
    if (parsed.length === 0) return null;
    const docs = parsed.map((d) => d.toJSON() as unknown);
    if (!docs.some((d) => d != null)) return null;
    return { docs, resources: docs.map((d) => extractResourceIdentity(d)) };
  } catch {
    return null;
  }
}

/**
 * Memoized {@link parseDocsOnceUncached}, keyed on the DECODED content string.
 *
 * With this in front, `parseUnitData` and `parseUnitDataStructured` share a single
 * YAML parse per payload instead of each running their own.
 *
 * Its budget is deliberately much smaller than the flattened-result caches'. A
 * document tree is several times larger in memory than the text it came from
 * (every scalar becomes a boxed JS value), and unlike the flattened results
 * nothing renders from it directly — it exists only so the two flatteners for a
 * given payload, which run back to back, share one parse. Holding the last few
 * payloads captures that, and a miss here is never worse than the old behaviour,
 * where each flattener always parsed for itself.
 */
const parseDocsOnce: (content: string | undefined) => ParsedDocs | null =
  makeParseCache<ParsedDocs | null>(parseDocsOnceUncached, {
    maxEntries: 8,
    maxBytes: 16 * 1024 * 1024,
  });

/**
 * Parse a unit's configuration into a flat map of path → value.
 * Tries: JSON → YAML (single- or multi-document) → INI → Properties → line-based fallback.
 */
function parseUnitDataUncached(data: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!data) return result;

  const content = data;

  // 1. JSON
  try {
    const parsed = JSON.parse(content);
    flattenObject(parsed, '', result);
    return result;
  } catch { /* not JSON */ }

  // 2. YAML — single- and multi-document share ONE parse (see parseDocsOnce).
  const parsed = parseDocsOnce(content);
  if (parsed) {
    for (const doc of parsed.docs) {
      if (doc != null) flattenObject(doc, '', result);
    }
    return result;
  }

  // 3. INI
  const iniResult = parseIni(content);
  if (iniResult) return iniResult;

  // 4. Properties / Env
  const propsResult = parseProperties(content);
  if (propsResult) return propsResult;

  // 5. Line-based fallback (HCL, TOML, unknown)
  return parseAsLines(content);
}

/**
 * Parse a unit's configuration into a flat map of path → value,
 * memoized by the configuration string so a given payload parses once per version.
 * See {@link makeParseCache}. The returned map is READ-ONLY — callers must not
 * mutate it (it is shared across calls).
 */
export const parseUnitData: (data: string | undefined) => Map<string, string> =
  makeParseCache(parseUnitDataUncached);

// ============================================================================
// VALUE SETTER
// ============================================================================

/** Split a dot-notation path (including bracket indices) into typed navigation keys. */
function parseDotPath(path: string): (string | number)[] {
  const keys: (string | number)[] = [];
  for (const part of path.split('.')) {
    if (/^\d+$/.test(part)) {
      keys.push(parseInt(part, 10));
    } else {
      const bracketIdx = part.indexOf('[');
      if (bracketIdx === -1) {
        keys.push(part);
      } else {
        const key = part.slice(0, bracketIdx);
        if (key) keys.push(key);
        for (const m of part.matchAll(/\[(\d+)\]/g)) {
          keys.push(parseInt(m[1], 10));
        }
      }
    }
  }
  return keys;
}

/** Coerce newValue to match the type of originalValue (number, boolean, or string). */
function coerceValue(newValue: string, originalValue: unknown): unknown {
  if (typeof originalValue === 'number') {
    const n = Number(newValue);
    if (!isNaN(n)) return n;
  }
  if (typeof originalValue === 'boolean') {
    if (newValue === 'true') return true;
    if (newValue === 'false') return false;
  }
  return newValue;
}

/**
 * Result of a value-mutation (`setValueAtPath` / `deleteValueAtPath`).
 * On success carries the new configuration; on failure carries a
 * machine-readable `code` plus a user-facing `message`.
 */
export type SetValueResult =
  | { ok: true; data: string }
  | {
      ok: false;
      code: 'unsupported-format' | 'array-creation-unsupported' | 'conflict';
      message: string;
    };

/** Outcome of attempting to set a value at a nested key path. */
type NestedSetStatus = 'set' | 'not-found' | 'array-creation-needed' | 'conflict';
interface NestedSetResult {
  status: NestedSetStatus;
  /** For 'conflict': the path segment that already holds a non-object value. */
  conflictSegment?: string;
}

/**
 * Coerce a value being CREATED (no original to match the type of). Created keys
 * default to string-typed, but we JSON-coerce obvious primitives (numbers,
 * booleans, null) so a numeric upstream value doesn't leave a residual diff
 * (e.g. upstream `8080` flattens to "8080" → created back as the number 8080).
 */
function coerceCreatedValue(newValue: string): unknown {
  if (newValue === 'true') return true;
  if (newValue === 'false') return false;
  if (newValue === 'null') return null;
  if (newValue !== '' && !isNaN(Number(newValue))) return Number(newValue);
  return newValue;
}

/** True if any key in `keys[start..end]` (inclusive) is a numeric array index. */
function rangeHasNumericKey(keys: (string | number)[], start: number, end: number): boolean {
  for (let s = start; s <= end; s++) {
    if (typeof keys[s] === 'number') return true;
  }
  return false;
}

/**
 * Mutate `obj` in place, setting the value at the given key path among the keys
 * that already exist. Uses greedy key matching so that object keys that
 * themselves contain dots (e.g. `"traefik.ingress.kubernetes.io/router"`) are
 * matched correctly even when the path was produced by splitting on dots.
 *
 * Returns `true` if an existing key was found and set, `false` otherwise.
 */
function setExistingValue(obj: unknown, keys: (string | number)[], newValue: string): boolean {
  function navigate(current: unknown, keyIdx: number): boolean {
    if (keyIdx >= keys.length) return false;
    if (current == null || typeof current !== 'object') return false;

    const key = keys[keyIdx];

    // ── Array navigation ──────────────────────────────────────────────────────
    if (typeof key === 'number') {
      const arr = current as unknown[];
      if (key < 0 || key >= arr.length) return false;
      if (keyIdx === keys.length - 1) {
        arr[key] = coerceValue(newValue, arr[key]);
        return true;
      }
      return navigate(arr[key], keyIdx + 1);
    }

    // ── Object navigation with greedy dot-key matching ────────────────────────
    // Try progressively longer dotted-key combinations starting from the longest
    // (most greedy) so that keys that literally contain dots are preferred over
    // naive single-segment navigation.
    const rec = current as Record<string, unknown>;
    for (let end = keys.length - 1; end >= keyIdx; end--) {
      // Skip ranges that include a numeric segment — those are array indices and
      // should never be joined into a string key.
      if (rangeHasNumericKey(keys, keyIdx, end)) continue;

      const tryKey = (keys.slice(keyIdx, end + 1) as string[]).join('.');
      if (!(tryKey in rec)) continue;

      if (end === keys.length - 1) {
        // This is the final key — set the value.
        rec[tryKey] = coerceValue(newValue, rec[tryKey]);
        return true;
      }
      // Not the final key — recurse into the child.
      if (navigate(rec[tryKey], end + 1)) return true;
    }

    return false;
  }

  return navigate(obj, 0);
}

/**
 * Create a missing key (including intermediate objects) at the given path using
 * a naive single-segment walk. Arrays are never fabricated — paths that require
 * an array index report 'array-creation-needed'. A segment that collides with an
 * existing scalar reports 'conflict'.
 */
function createNestedValue(obj: unknown, keys: (string | number)[], newValue: string): NestedSetResult {
  let current = obj;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const isLast = i === keys.length - 1;

    // We never fabricate arrays for missing keys.
    if (typeof key === 'number') return { status: 'array-creation-needed' };

    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      return { status: 'conflict', conflictSegment: String(keys[i - 1]) };
    }
    const rec = current as Record<string, unknown>;

    if (isLast) {
      rec[key] = coerceCreatedValue(newValue);
      return { status: 'set' };
    }

    const next = keys[i + 1];
    // The next segment is an array index — would require fabricating an array.
    if (typeof next === 'number') return { status: 'array-creation-needed' };

    if (!(key in rec)) {
      rec[key] = {};
      current = rec[key];
    } else {
      const child = rec[key];
      if (child == null || typeof child !== 'object' || Array.isArray(child)) {
        return { status: 'conflict', conflictSegment: key };
      }
      current = child;
    }
  }
  return { status: 'not-found' };
}

/**
 * Set the value at `keys` in `obj`, first matching existing keys, then (if
 * `create` is true) creating the missing key/intermediate objects.
 */
function setNestedValue(
  obj: unknown,
  keys: (string | number)[],
  newValue: string,
  create: boolean,
): NestedSetResult {
  if (setExistingValue(obj, keys, newValue)) return { status: 'set' };
  if (!create) return { status: 'not-found' };
  return createNestedValue(obj, keys, newValue);
}

/**
 * Remove the value at `keys` from `obj` in place, pruning any parent objects
 * that become empty as a result (so a created key's intermediate objects are
 * cleaned up on revert). Returns `true` if a key was removed.
 */
function deleteNestedValue(obj: unknown, keys: (string | number)[]): boolean {
  function navigate(current: unknown, keyIdx: number): boolean {
    if (keyIdx >= keys.length) return false;
    if (current == null || typeof current !== 'object') return false;

    const key = keys[keyIdx];

    if (typeof key === 'number') {
      const arr = current as unknown[];
      if (key < 0 || key >= arr.length) return false;
      if (keyIdx === keys.length - 1) {
        arr.splice(key, 1);
        return true;
      }
      const child = arr[key];
      if (!navigate(child, keyIdx + 1)) return false;
      if (child != null && typeof child === 'object' && !Array.isArray(child)
        && Object.keys(child).length === 0) {
        arr.splice(key, 1);
      }
      return true;
    }

    const rec = current as Record<string, unknown>;
    for (let end = keys.length - 1; end >= keyIdx; end--) {
      if (rangeHasNumericKey(keys, keyIdx, end)) continue;

      const tryKey = (keys.slice(keyIdx, end + 1) as string[]).join('.');
      if (!(tryKey in rec)) continue;

      if (end === keys.length - 1) {
        delete rec[tryKey];
        return true;
      }
      const child = rec[tryKey];
      if (navigate(child, end + 1)) {
        // Prune the parent object if removing the child emptied it.
        if (child != null && typeof child === 'object' && !Array.isArray(child)
          && Object.keys(child).length === 0) {
          delete rec[tryKey];
        }
        return true;
      }
    }
    return false;
  }

  return navigate(obj, 0);
}

/** Build the user-facing message for a structured set/create failure. */
function setFailureResult(result: NestedSetResult, path: string): SetValueResult {
  if (result.status === 'array-creation-needed') {
    return {
      ok: false,
      code: 'array-creation-unsupported',
      message: `Can't add "${path}": adding new array elements isn't supported. Edit the unit's config directly to add this field.`,
    };
  }
  if (result.status === 'conflict') {
    return {
      ok: false,
      code: 'conflict',
      message: `Can't add "${path}": "${result.conflictSegment ?? ''}" already holds a value and can't contain nested fields.`,
    };
  }
  return {
    ok: false,
    code: 'unsupported-format',
    message: `Can't add "${path}": adding new keys isn't supported for this configuration format. Edit the unit's config directly to add this field.`,
  };
}

/** Build the user-facing message for an unsupported (non-structured) format. */
function unsupportedFormatResult(content: string, path: string): SetValueResult {
  const formatLabel = parseIni(content) ? 'INI configs'
    : parseProperties(content) ? 'Properties/env configs'
    : 'this configuration format';
  return {
    ok: false,
    code: 'unsupported-format',
    message: `Can't add "${path}": adding new keys isn't supported for ${formatLabel}. Edit the unit's config directly to add this field.`,
  };
}

/** Determine whether `content` is multi-document YAML (multiple docs or a leading `---`). */
function isMultiDocYaml(content: string): boolean {
  try {
    const docs = parseAllDocuments(content);
    return docs.length > 1 || (docs.length === 1 && content.trimStart().startsWith('---'));
  } catch {
    return false;
  }
}

/**
 * Re-serialise a parsed multi-document YAML stream, re-stringifying only the
 * edited document (at `updatedIdx`) and preserving the original text — including
 * comments — for every other document. Mirrors the `---` separators between docs.
 */
function serializeMultiDocYaml(
  docs: ReturnType<typeof parseAllDocuments>,
  docObjects: unknown[],
  updatedIdx: number,
): string {
  return docs
    .map((doc, i) => {
      const yamlStr = i === updatedIdx
        ? (docObjects[i] != null ? stringifyYaml(docObjects[i] as object) : '')
        : doc.toString();
      return i === 0 ? yamlStr : `---\n${yamlStr}`;
    })
    .join('');
}

/**
 * The document indices a multi-doc write should consider, in priority order.
 *
 * - resource GIVEN → only the document(s) whose identity matches, ascending. This
 *   is the document-scoped write: it targets exactly the resource the caller named
 *   and never last-wins, so a per-document edit can't leak into a sibling.
 * - resource ABSENT → every index, last-to-first, preserving the historical
 *   last-document-wins behaviour for unscoped writes byte-for-byte.
 */
function documentCandidateIdxs(docObjects: unknown[], resource?: ResourceInfo): number[] {
  if (!resource) return docObjects.map((_o, i) => i).reverse();
  return docObjects.reduce<number[]>((acc, obj, i) => {
    if (matchesResource(extractResourceIdentity(obj), resource)) acc.push(i);
    return acc;
  }, []);
}

/**
 * Set a field value at `path` (dot-notation with bracket indices) inside `data`
 * (JSON or YAML). Missing keys (including nested intermediate
 * objects) are CREATED for JSON and YAML. Arrays are never fabricated, and
 * INI/Properties/line-based formats fail gracefully with a specific message.
 *
 * When `resource` is supplied and `data` is multi-document YAML, the write is
 * pinned to the document with that resource identity (see {@link documentCandidateIdxs}).
 */
export function setValueAtPath(
  data: string | undefined,
  path: string,
  newValue: string,
  resource?: ResourceInfo,
): SetValueResult {
  if (!data) return { ok: true, data: data ?? '' };

  const content = data;
  const keys = parseDotPath(path);
  if (keys.length === 0) return { ok: true, data };

  // JSON — definitive once it parses to an object/array (preserves JSON format).
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed != null && typeof parsed === 'object') {
      const result = setNestedValue(parsed, keys, newValue, true);
      if (result.status === 'set') {
        return { ok: true, data: JSON.stringify(parsed, null, 2) };
      }
      return setFailureResult(result, path);
    }
  } catch { /* not JSON */ }

  // Multi-document YAML (e.g. Kubernetes manifests with --- separators).
  if (isMultiDocYaml(content)) {
    try {
      const docs = parseAllDocuments(content);
      const docObjects = docs.map((d) => d.toJSON() as unknown);
      // Candidate documents, in priority order. A resource-SCOPED write considers
      // ONLY the document matching that identity — never last-wins, so a staged edit
      // to one document (a Service's apiVersion) can't land in a sibling (#4724/#4725).
      // An UNSCOPED write keeps the historical last-document-wins scan unchanged.
      const candidateIdxs = documentCandidateIdxs(docObjects, resource);
      // Prefer an existing-match among the candidates.
      let updatedIdx = -1;
      for (const i of candidateIdxs) {
        const obj = docObjects[i];
        if (obj != null && typeof obj === 'object' && setExistingValue(obj, keys, newValue)) {
          updatedIdx = i;
          break;
        }
      }
      // Otherwise best-effort create in the first object-typed candidate.
      let createResult: NestedSetResult | null = null;
      if (updatedIdx < 0) {
        for (const i of candidateIdxs) {
          const obj = docObjects[i];
          if (obj != null && typeof obj === 'object' && !Array.isArray(obj)) {
            createResult = createNestedValue(obj, keys, newValue);
            if (createResult.status === 'set') { updatedIdx = i; }
            break;
          }
        }
      }
      if (updatedIdx >= 0) {
        return { ok: true, data: serializeMultiDocYaml(docs, docObjects, updatedIdx) };
      }
      if (createResult && createResult.status !== 'set') {
        return setFailureResult(createResult, path);
      }
    } catch { /* fall through */ }
    return unsupportedFormatResult(content, path);
  }

  // Single-document YAML.
  try {
    const parsed = parseYaml(content);
    if (parsed != null && typeof parsed === 'object') {
      const result = setNestedValue(parsed, keys, newValue, true);
      if (result.status === 'set') {
        return { ok: true, data: stringifyYaml(parsed) };
      }
      return setFailureResult(result, path);
    }
  } catch { /* not single-doc YAML */ }

  // Unsupported format (INI, Properties, line-based) — specific graceful message.
  return unsupportedFormatResult(content, path);
}

/**
 * Remove the key at `path` from `data` (JSON or YAML),
 * re-serialising while preserving format and pruning now-empty parent objects.
 * Used to revert an accepted upstream-only field back to its absent state.
 * Unsupported formats fail gracefully with a specific message.
 */
export function deleteValueAtPath(data: string | undefined, path: string, resource?: ResourceInfo): SetValueResult {
  if (!data) return { ok: true, data: data ?? '' };

  const content = data;
  const keys = parseDotPath(path);
  if (keys.length === 0) return { ok: true, data };

  // JSON — definitive once it parses to an object/array.
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed != null && typeof parsed === 'object') {
      // Idempotent: if the key is already absent, return the data unchanged.
      if (deleteNestedValue(parsed, keys)) {
        return { ok: true, data: JSON.stringify(parsed, null, 2) };
      }
      return { ok: true, data };
    }
  } catch { /* not JSON */ }

  // Multi-document YAML. A resource-scoped delete targets only the matching
  // document; unscoped keeps the historical last-wins scan (see documentCandidateIdxs).
  if (isMultiDocYaml(content)) {
    try {
      const docs = parseAllDocuments(content);
      const docObjects = docs.map((d) => d.toJSON() as unknown);
      let updatedIdx = -1;
      for (const i of documentCandidateIdxs(docObjects, resource)) {
        const obj = docObjects[i];
        if (obj != null && typeof obj === 'object' && deleteNestedValue(obj, keys)) {
          updatedIdx = i;
          break;
        }
      }
      if (updatedIdx >= 0) {
        return { ok: true, data: serializeMultiDocYaml(docs, docObjects, updatedIdx) };
      }
      return { ok: true, data }; // key already absent
    } catch { /* fall through */ }
    return {
      ok: false,
      code: 'unsupported-format',
      message: `Can't remove "${path}": editing isn't supported for this configuration format.`,
    };
  }

  // Single-document YAML.
  try {
    const parsed = parseYaml(content);
    if (parsed != null && typeof parsed === 'object') {
      if (deleteNestedValue(parsed, keys)) {
        return { ok: true, data: stringifyYaml(parsed) };
      }
      return { ok: true, data }; // key already absent
    }
  } catch { /* not single-doc YAML */ }

  // Unsupported format (INI, Properties, line-based).
  return {
    ok: false,
    code: 'unsupported-format',
    message: `Can't remove "${path}": editing isn't supported for this configuration format.`,
  };
}

// ============================================================================
// PATH → LINE MAPPING
// ============================================================================

/**
 * Walk a yaml AST node following `segments[idx..]` with greedy dot-key
 * matching, mirroring the setExistingValue greedy approach. At each map level,
 * tries joining segments[idx..end] (longest first) as a candidate key string,
 * searches the YAMLMap's .items for a matching Pair, then recurses. Numeric
 * segments are never joined into a string key. Returns undefined if the path
 * cannot be resolved.
 */
function greedyTraverseYaml(
  node: unknown,
  segments: (string | number)[],
  idx: number,
): unknown {
  if (idx >= segments.length) return node;
  if (node == null) return undefined;

  const seg = segments[idx];

  // Array index navigation
  if (typeof seg === 'number') {
    if (!isSeq(node)) return undefined;
    const child: unknown = node.items[seg];
    if (child == null) return undefined;
    return greedyTraverseYaml(child, segments, idx + 1);
  }

  // Map navigation with greedy dot-key matching
  if (!isMap(node)) return undefined;

  for (let end = segments.length - 1; end >= idx; end--) {
    // Never join across a numeric (array-index) segment
    if (segments.slice(idx, end + 1).some((s) => typeof s === 'number')) continue;

    const tryKey = (segments.slice(idx, end + 1) as string[]).join('.');
    const pair = node.items.find(
      (p) => isScalar(p.key) && String(p.key.value) === tryKey,
    );
    if (!pair) continue;

    const child = greedyTraverseYaml(pair.value, segments, end + 1);
    if (child !== undefined) return child;
  }

  return undefined;
}

/**
 * Map each dot-notation path to the 1-based line number where its value lives
 * in `decoded` (a YAML or JSON document — JSON is parsed as a YAML subset).
 *
 * Uses a single shared LineCounter across all documents so offsets are absolute
 * for multi-doc YAML (e.g. Kubernetes manifests). When a path resolves in more
 * than one document, the LAST match wins — mirroring how setValueAtPath and
 * flattenObject treat duplicate paths across documents.
 *
 * Paths that don't resolve to a node (e.g. dotted object keys that the
 * dot-split can't reconstruct, or non-YAML/JSON content) are simply absent from
 * the returned map — callers fall back to a non-inline affordance for those.
 * Never throws: malformed input yields an empty or partial map.
 */
export function mapPathsToLines(decoded: string, paths: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (!decoded || paths.length === 0) return result;

  try {
    const lineCounter = new LineCounter();
    const docs = parseAllDocuments(decoded, { lineCounter });
    if (docs.length === 0) return result;

    for (const path of paths) {
      const keys = parseDotPath(path);
      if (keys.length === 0) continue;
      // Iterate documents in reverse so the last-wins document (the one
      // parseUnitData displays) takes precedence.
      for (let i = docs.length - 1; i >= 0; i--) {
        const node = greedyTraverseYaml(docs[i].contents, keys, 0);
        const range = (node as { range?: unknown } | null | undefined)?.range;
        if (Array.isArray(range) && typeof range[0] === 'number') {
          result.set(path, lineCounter.linePos(range[0]).line);
          break;
        }
      }
    }
  } catch {
    /* malformed input — return whatever resolved so far */
  }

  return result;
}

// ============================================================================
// STRUCTURED PARSING
// ============================================================================

export type { ResourceInfo };

export interface FieldEntry {
  path: string;
  segments: (string | number)[];
  value: unknown;
  resource?: ResourceInfo;
}

export interface FieldPathMeta {
  segments: (string | number)[];
  resource?: ResourceInfo;
}

/** Extract resource identity from the root of a parsed YAML/JSON document, returning a ResourceInfo. */
function extractResourceIdentity(doc: unknown): ResourceInfo | undefined {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
  const d = doc as Record<string, unknown>;
  const apiVersion = typeof d.apiVersion === 'string' ? d.apiVersion : undefined;
  const kind = typeof d.kind === 'string' ? d.kind : undefined;
  const meta = d.metadata;
  const namespace = (meta && typeof meta === 'object' && !Array.isArray(meta) && typeof (meta as Record<string, unknown>).namespace === 'string')
    ? (meta as Record<string, unknown>).namespace as string
    : undefined;
  const name = (meta && typeof meta === 'object' && !Array.isArray(meta) && typeof (meta as Record<string, unknown>).name === 'string')
    ? (meta as Record<string, unknown>).name as string
    : undefined;
  if (!apiVersion && !kind && !namespace && !name) return undefined;
  return {
    ResourceType: apiVersion !== undefined && kind !== undefined ? `${apiVersion}/${kind}` : undefined,
    ResourceName: name !== undefined ? `${namespace ?? ''}/${name}` : undefined,
  };
}

/**
 * Resource identity of a configuration payload: `apiVersion/kind` and
 * `namespace/name`, read from the document itself.
 *
 * A caller that must JOIN one resource across Spaces needs this. A slug cannot
 * do that job: a slug belongs to one Space, so two Spaces can hold one resource
 * under two different slugs, and a slug-keyed join then splits that resource in
 * two.
 *
 * EVERY document, not the first one. A multi-document payload holds several
 * resources, and reading only the first identifies the payload by whichever
 * document happens to lead it. Two payloads that both open with the same
 * Namespace — the ordinary "each bundle carries its namespace" layout — would
 * then be indistinguishable, and a caller joining on that identity would treat
 * two different payloads as one.
 *
 * Empty when the payload carries no resource identity at all — a format with no
 * such concept (ini, properties, plain JSON), or data that could not be read.
 * The caller must decide what that means rather than receive a guess.
 */
export function resourceIdentitiesOf(data: string | undefined): ResourceInfo[] {
  if (!data) return [];

  try {
    const identity = extractResourceIdentity(JSON.parse(data));
    return identity === undefined ? [] : [identity];
  } catch { /* not JSON */ }

  const parsed = parseDocsOnce(data);
  if (!parsed) return [];
  return parsed.resources.filter((resource): resource is ResourceInfo => resource !== undefined);
}

/** Recursively flatten a parsed object, preserving typed values (unlike flattenObject which stringifies). */
function flattenStructured(
  obj: unknown,
  prefix: string,
  resource: ResourceInfo | undefined,
  result: FieldEntry[],
): void {
  if (obj === null || obj === undefined) {
    if (prefix) result.push({ path: prefix, segments: parseDotPath(prefix), value: obj, resource });
    return;
  }
  if (typeof obj !== 'object') {
    result.push({ path: prefix, segments: parseDotPath(prefix), value: obj, resource });
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      flattenStructured(obj[i], prefix ? `${prefix}.${i}` : String(i), resource, result);
    }
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    flattenStructured(value, prefix ? `${prefix}.${key}` : key, resource, result);
  }
}

/**
 * Parse a unit's configuration into a structured array of FieldEntry
 * (one per leaf value), including ResourceIdentity extracted from each YAML document.
 * Supports JSON, single-doc YAML, and multi-doc YAML.
 */
function parseUnitDataStructuredUncached(data: string | undefined): FieldEntry[] {
  if (!data) return [];

  const content = data;
  const entries: FieldEntry[] = [];

  // 1. JSON
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed != null && typeof parsed === 'object') {
      const resource = extractResourceIdentity(parsed);
      flattenStructured(parsed, '', resource, entries);
      return entries;
    }
  } catch { /* not JSON */ }

  // 2. YAML — single- and multi-document share ONE parse (see parseDocsOnce),
  //    which parseUnitData has usually already paid for on this same content.
  const parsed = parseDocsOnce(content);
  if (parsed) {
    for (let i = 0; i < parsed.docs.length; i++) {
      const obj = parsed.docs[i];
      if (obj == null) continue;
      flattenStructured(obj, '', parsed.resources[i], entries);
    }
  }

  return entries;
}

/**
 * Parse unit Data into a structured array of FieldEntry (see
 * {@link parseUnitDataStructuredUncached}), memoized by the raw Data string so a
 * given payload parses once per version. See {@link makeParseCache}. The returned
 * array is READ-ONLY — callers must not mutate it (it is shared across calls).
 */
export const parseUnitDataStructured: (data: string | undefined) => FieldEntry[] =
  makeParseCache(parseUnitDataStructuredUncached);

/**
 * Build a Map from dot-notation path → FieldPathMeta (segments + resource identity).
 * One entry per leaf in the parsed data. For multi-doc YAML with the same path in
 * multiple documents, the last document's entry wins (matching parseUnitData behaviour).
 */
export function buildFieldPathMeta(data: string | undefined): Map<string, FieldPathMeta> {
  const result = new Map<string, FieldPathMeta>();
  for (const e of parseUnitDataStructured(data)) {
    result.set(e.path, { segments: e.segments, resource: e.resource });
  }
  return result;
}

/** Return true when `entryResource` satisfies all non-undefined fields of `target`. */
export function matchesResource(entryResource: ResourceInfo | undefined, target: ResourceInfo): boolean {
  if (!entryResource) return false;
  if (target.ResourceType !== undefined && entryResource.ResourceType !== target.ResourceType) return false;
  if (target.ResourceName !== undefined && entryResource.ResourceName !== target.ResourceName) return false;
  return true;
}

/**
 * Return the string value of the field at `path` in `data`, optionally scoped to
 * a specific resource identity. If a `resource` is given and a matching document is
 * found, its value is returned. Falls back to the first document that has the path.
 * Returns undefined if the path is absent from all documents.
 */
export function findFieldValue(
  data: string | undefined,
  path: string,
  resource?: ResourceInfo,
): string | undefined {
  const entries = parseUnitDataStructured(data);
  if (resource) {
    const match = entries.find((e) => e.path === path && matchesResource(e.resource, resource));
    if (match !== undefined) return String(match.value);
  }
  const any = entries.find((e) => e.path === path);
  return any !== undefined ? String(any.value) : undefined;
}

export function flattenObject(obj: unknown, prefix: string, result: Map<string, string>): void {
  if (obj === null || obj === undefined) {
    if (prefix) result.set(prefix, String(obj));
    return;
  }

  if (typeof obj !== 'object') {
    result.set(prefix, String(obj));
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      flattenObject(obj[i], prefix ? `${prefix}.${i}` : String(i), result);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    flattenObject(value, prefix ? `${prefix}.${key}` : key, result);
  }
}
