// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { isArrayElementPath } from './componentKeyUtils';
import type { FieldEntry, ResourceInfo } from './configParser';

// ============================================================================
// TREE BUILDING FOR DIFFS
// ============================================================================

/** A tree node representing either a folder (intermediate path segment) or a leaf (diff entry). */
export interface DiffTreeNode {
  key: string;
  type: 'folder' | 'leaf';
  children?: DiffTreeNode[];
  /** Present on leaf nodes — the diff values */
  diff?: { oldValue: string; newValue: string };
  /** True for nodes injected as surrounding context (rendered dimmed) */
  context?: boolean;
  /**
   * True for the synthetic per-document wrapper folders produced by
   * {@link buildResourceGroupedTree}. Such a node is a DISPLAY-ONLY container: its
   * `key` is a human label ("Service guestbook"), NOT a config path segment, so it
   * must contribute NOTHING to the dot-paths of its descendants.
   *
   * This is load-bearing. Every diff/override/staging lookup
   * (changedPaths, upgradeFieldDiffs, variationFieldDiffs, prefixIndex,
   * setValueAtPath) is keyed on the BARE dot-path (`spec.replicas`). Renderers
   * must therefore treat a path-transparent node's own path as its parent's
   * prefix, so children keep resolving to bare paths rather than
   * "Service guestbook.spec.replicas".
   *
   * This field answers ONLY the path-composition question. It deliberately says
   * nothing about how to ADDRESS the node — see {@link DiffTreeNode.document}.
   */
  pathTransparent?: boolean;
  /**
   * Set on (and only on) the synthetic per-document wrappers described above.
   *
   * A wrapper resolves its own fullPath to its parent's prefix — `''` at the top
   * level — so `fullPath` is USELESS as an identity: every sibling wrapper shares
   * it, and `''` is falsy, so truthiness guards silently pass. `document.id` is the
   * separate, stable, unique, NON-EMPTY handle to use for anything that ADDRESSES a
   * row (composer targeting, menu actions, React keys) rather than composing a path.
   */
  document?: DocumentIdentity;
}

/** The targeting identity + write scope of one source document's wrapper node. */
export interface DocumentIdentity {
  /**
   * Stable, unique, non-empty id for the wrapper — NEVER a config path.
   * Ids share the targeting namespace with ordinary nodes' full paths, so the
   * prefix is widened until it cannot collide with a real top-level key.
   */
  id: string;
  /** Resource identity of the source document; undefined when extraction failed. */
  resource?: ResourceInfo;
  /**
   * True when a write aimed at this document is GUARANTEED to land in it, i.e. the
   * document is uniquely addressable by resource identity AND the unit's toolchain
   * honours that scope. When false, callers must not offer document-scoped edits:
   * the write would silently land in whichever document `setValueAtPath` picks
   * (the last one), which is the wrong resource.
   */
  writable: boolean;
}

/**
 * STAGING KEY — the identity a staged change is keyed on.
 *
 * Staging (`stagedPaths`, staged edits, committed rows) must be scoped to ONE
 * source document: two documents in a multi-doc Unit can share a bare dot-path
 * (both a Service and a Deployment carry `apiVersion`), and keying staged state on
 * the bare path alone makes staging one row silently stage the sibling document's
 * same-named row. The stage key qualifies the bare path with the owning document's
 * stable id.
 *
 * A single-document row has no `docScope`, so its key IS the bare path — the
 * common case is byte-identical to the pre-scoping behaviour. U+0001 cannot
 * occur in a dot-path or in a wrapper id (`__doc…`), so the join is unambiguous
 * and reversible via {@link stageKeyPath} / {@link stageKeyDocId}.
 */
export const STAGE_KEY_SEP = '\u0001';

/** The staged-membership key for `path` within `docScope` (bare path if unscoped). */
export function docStageKey(docScope: DocumentIdentity | undefined, path: string): string {
  return docScope ? `${docScope.id}${STAGE_KEY_SEP}${path}` : path;
}

/** The bare config path carried by a stage key (identity for an unscoped key). */
export function stageKeyPath(key: string): string {
  const i = key.indexOf(STAGE_KEY_SEP);
  return i === -1 ? key : key.slice(i + 1);
}

/** The owning document id of a stage key, or undefined for an unscoped (single-doc) key. */
export function stageKeyDocId(key: string): string | undefined {
  const i = key.indexOf(STAGE_KEY_SEP);
  return i === -1 ? undefined : key.slice(0, i);
}

/**
 * A tree node DURING construction. Identical to {@link DiffTreeNode} except for
 * `childIndex`, a key→folder mirror of `children` that turns the sibling lookup
 * from a linear `children.find(...)` scan into an O(1) map hit.
 *
 * Without it, filling a folder that ends up with F children costs O(F^2), which
 * is what froze the UI on WIDE documents (a single 8,000-element array made
 * `buildPathTree` alone take ~400ms; the array folder is filled by 24,000 pushes
 * each scanning up to 8,000 siblings).
 *
 * `childIndex` is builder-only state and MUST NOT escape into the rendered tree —
 * {@link collapseFolderChains} strips it from every folder it visits, which is
 * every folder that can be reached from the returned forest.
 */
interface BuilderNode extends DiffTreeNode {
  children?: BuilderNode[];
  childIndex?: Map<string, BuilderNode>;
}

/** A fresh builder folder: empty children plus its (empty) sibling index. */
function builderFolder(key: string, context?: boolean): BuilderNode {
  const node: BuilderNode = { key, type: 'folder', children: [], childIndex: new Map() };
  if (context !== undefined) node.context = context;
  return node;
}

/**
 * Build a collapsible tree from an array of field diffs.
 * Splits paths on '.' to create hierarchy, then collapses single-child chains.
 *
 * Sibling ORDER is user-visible and is strictly insertion order: a folder appears
 * at the position of the first path that needed it, and leaves in the order their
 * paths were supplied. The `childIndex` only accelerates the *lookup*; every node
 * is still appended to `children` in the same order the linear scan produced.
 */
export function buildDiffTree(fieldDiffs: { path: string; oldValue: string; newValue: string }[]): DiffTreeNode[] {
  const root = builderFolder('root');

  for (const diff of fieldDiffs) {
    const parts = diff.path.split('.');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.children!.push({
          key: part,
          type: 'leaf',
          diff: { oldValue: diff.oldValue, newValue: diff.newValue },
        });
      } else {
        // Only FOLDERS are indexed, so a same-named leaf never satisfies this
        // lookup — matching the old `find(c => c.key === part && c.type === 'folder')`.
        let child = current.childIndex!.get(part);
        if (!child) {
          child = builderFolder(part);
          current.children!.push(child);
          current.childIndex!.set(part, child);
        }
        current = child;
      }
    }
  }

  return collapseFolderChains(root.children ?? []);
}

/**
 * Build a collapsible tree from an array of path/value pairs (no diff context).
 * Each leaf carries the value as its `newValue`. Splits paths on '.' to create
 * hierarchy, then collapses single-child chains.
 */
export function buildPathTree(paths: { path: string; value: string }[]): DiffTreeNode[] {
  return buildDiffTree(paths.map(({ path, value }) => ({ path, oldValue: '', newValue: value })));
}

/**
 * Collapse single-child folder chains (a → b → c becomes "a.b.c") but never
 * collapse a folder into a leaf, so leaf rows always have a short key with at
 * least one parent folder above them.
 *
 * CONSUMES ITS INPUT. `nodes` (and every folder beneath it) is mutated in place
 * and returned; do not pass a tree anyone else still holds a reference to. Both
 * callers — {@link buildDiffTree} and {@link buildContextTree} — hand over a tree
 * they built locally on the line above and never look at again, so nothing
 * observes the intermediate shape. The previous version deep-copied every folder,
 * which doubled the allocation cost of every tree build for no benefit.
 *
 * Also strips the builder-only `childIndex` (see {@link BuilderNode}) from every
 * folder it visits, which is how that field is prevented from escaping into the
 * rendered tree. Deleting it here is safe for genuine {@link DiffTreeNode} inputs
 * too — the field simply is not there.
 */
export function collapseFolderChains(nodes: DiffTreeNode[]): DiffTreeNode[] {
  for (const node of nodes) {
    if (node.type === 'leaf') continue;

    delete (node as BuilderNode).childIndex;

    let children = collapseFolderChains(node.children ?? []);
    let key = node.key;
    let context = node.context;
    let collapsed = false;

    while (children.length === 1 && children[0].type === 'folder') {
      const child = children[0];
      key = `${key}.${child.key}`;
      // The collapsed folder is dimmed only if BOTH links of the chain were.
      context = context && child.context;
      children = child.children ?? [];
      collapsed = true;
    }

    node.key = key;
    node.children = children;
    // Only touch `context` when a chain actually collapsed, so a folder that did
    // not collapse keeps the exact property shape it was built with.
    if (collapsed) node.context = context;
  }

  return nodes;
}

// ============================================================================
// RESOURCE GROUPING — one subtree per source YAML document
// ============================================================================

/** A contiguous run of leaves that all originated from the same source document. */
export interface DocumentGroup {
  resource: ResourceInfo | undefined;
  entries: FieldEntry[];
}

/**
 * Partition flattened leaves into one group per source document.
 *
 * `parseUnitDataStructured` walks documents in order and tags every leaf of a
 * given document with the SAME `resource` object reference, so documents appear
 * as contiguous runs and a reference change marks a document boundary. Grouping
 * this way is what stops a Unit holding e.g. a Service + a Deployment from
 * rendering as one merged tree (where `apiVersion`/`kind` collide last-write-wins
 * and unrelated `spec.*` leaves become siblings).
 *
 * KNOWN LIMITATION: documents whose identity could not be extracted are all
 * tagged `undefined`, so two ADJACENT unidentified documents merge into one
 * group. That is the pre-existing merged behaviour, never worse than today.
 */
export function groupFieldEntriesByDocument(entries: FieldEntry[]): DocumentGroup[] {
  const groups: DocumentGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    // Reference equality (not deep equality): same document ⇒ same object.
    if (last && last.resource === entry.resource) {
      last.entries.push(entry);
    } else {
      groups.push({ resource: entry.resource, entries: [entry] });
    }
  }
  return groups;
}

/** Trailing segment of a slash-joined identifier ("apps/v1/Deployment" → "Deployment"). */
function lastSegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const idx = value.lastIndexOf('/');
  const segment = idx === -1 ? value : value.slice(idx + 1);
  return segment || undefined;
}

/**
 * Human label for a document group, e.g. "Service guestbook".
 * `ResourceType` is `apiVersion/kind` and `ResourceName` is `namespace/name`, so
 * we take the trailing segment of each. Degrades gracefully when
 * `extractResourceIdentity` returned nothing or only part of the identity:
 * kind-only, name-only, then a positional "Document N" fallback.
 */
export function documentGroupLabel(resource: ResourceInfo | undefined, index: number): string {
  const kind = lastSegment(resource?.ResourceType);
  const name = lastSegment(resource?.ResourceName);
  if (kind && name) return `${kind} ${name}`;
  return kind ?? name ?? `Document ${index + 1}`;
}

/** Base prefix for wrapper targeting ids. Widened by {@link pickDocIdPrefix} on collision. */
const DOC_ID_BASE = '__doc';

/**
 * Choose a wrapper-id prefix that cannot collide with any real top-level path in
 * this unit. Wrapper ids and ordinary nodes' full paths share ONE targeting
 * namespace, and nothing stops a document from having a top-level key literally
 * named `__doc0`, so widen the prefix until it is provably disjoint.
 */
function pickDocIdPrefix(entries: FieldEntry[]): string {
  const rootKeys = entries.map((e) => e.path.split('.')[0]);
  let prefix = DOC_ID_BASE;
  while (rootKeys.some((k) => k.startsWith(prefix))) prefix = `_${prefix}`;
  return prefix;
}

/**
 * The scope a server-side `set-attributes` write would use to address this
 * document, or undefined when the document cannot be addressed at all.
 *
 * A PARTIAL identity is deliberately treated as unaddressable: a scope carrying
 * only `ResourceType` also matches a sibling document of the same type, so a write
 * pinned to it could land in the wrong resource.
 */
function resourceScopeKey(resource: ResourceInfo | undefined): string | undefined {
  if (!resource) return undefined;
  const { ResourceType, ResourceName } = resource;
  if (ResourceType === undefined || ResourceName === undefined) return undefined;
  // NUL-joined: it cannot occur in either field, so the join is unambiguous.
  return `${ResourceType}\u0000${ResourceName}`;
}

/** Options for {@link buildResourceGroupedTree}. */
export interface ResourceGroupedTreeOptions {
  /**
   * Whether this unit's toolchain routes writes through the server's
   * resource-scoped `set-attributes` (see `isYamlToolchain`). Defaults to FALSE so
   * a caller that omits it gets read-only wrappers rather than silently
   * misdirected writes — the safe direction to fail.
   */
  scopedWritesSupported?: boolean;
  /**
   * The unit's document scopes computed from its FULL (unnarrowed) entries —
   * i.e. {@link computeDocumentScopes} over every entry, not just the ones a
   * filter (e.g. `filterMode='upgradable'`) narrowed the tree down to.
   *
   * Without this, a caller that narrows `entries` before calling this function
   * gets scope ids computed from THAT NARROWED set — positional (`__doc${i}`)
   * over however many documents survived the narrowing. If narrowing drops an
   * EARLIER document entirely (its own fields didn't change), a later
   * document's id shifts (doc1 → doc0), and — worse — narrowing down to a
   * single surviving document collapses the tree to the bare, unwrapped shape
   * entirely (see the `groups.length === 1` shortcut below), silently
   * DROPPING scoping altogether. Any OTHER computation keyed on the full
   * entries (e.g. an auto-stage effect building keys via
   * {@link computeDocumentScopes} over the unfiltered set) then stages a
   * SCOPED key ("doc1\x01path") that never matches this tree's own ACTUAL
   * (unscoped, or differently-numbered) key for the same row — the row never
   * reads as staged no matter what actually changed.
   *
   * When provided, each narrowed group's scope is looked up by resource
   * IDENTITY (reference equality — narrowing only ever filters the same
   * `FieldEntry[]`, never clones it, so this holds) against this list instead
   * of being recomputed positionally, and the multi-document wrapper shape is
   * preserved even when narrowing leaves only one document's fields visible.
   */
  fullDocumentScopes?: DocumentScope[];
}

/** Build one group's subtree from ONLY that document's own leaves. */
function buildGroupSubtree(group: DocumentGroup): DiffTreeNode[] {
  return buildDiffTree(
    group.entries.map((e) => ({ path: e.path, oldValue: '', newValue: String(e.value) })),
  );
}

/**
 * Build a tree with one labeled top-level node per source document.
 *
 * Each document's subtree is built by the EXISTING buildDiffTree /
 * collapseFolderChains machinery, fed only that document's own leaves — so
 * per-document shape, ordering and folder collapsing are unchanged. The wrapper
 * nodes are `pathTransparent`, so descendant dot-paths stay BARE and every
 * existing bare-path-keyed lookup (highlighting, staging, overrides) keeps
 * working untouched.
 *
 * A single-document unit renders BARE (no wrapper), so the common case looks
 * exactly as it does today; a wrapper only appears once there is something to
 * disambiguate. Labels are de-duplicated so React keys stay unique when two
 * documents share an identity (or lack one).
 *
 * Each wrapper carries a `document` handle holding the two things its `key` and
 * its (empty) fullPath cannot supply: a unique NON-EMPTY id to address the row by,
 * and whether a write can be pinned to this document. Labels are display-only and
 * must never be used for either — two documents can share one.
 */
export function buildResourceGroupedTree(
  entries: FieldEntry[],
  options: ResourceGroupedTreeOptions = {},
): DiffTreeNode[] {
  const groups = groupFieldEntriesByDocument(entries);
  if (groups.length === 0) return [];

  // The unit's real, FULL document count — see fullDocumentScopes' doc. Once
  // narrowing (or a lack thereof) is factored out, a unit is only genuinely
  // single-document when its full scope list says so too.
  const fullScopes = options.fullDocumentScopes;
  const isActuallyMultiDoc = fullScopes ? fullScopes.length > 1 : groups.length > 1;

  // One document (or a format with no document identity at all, e.g. INI /
  // properties / line-based) → no wrapper: identical to the pre-grouping tree.
  if (!isActuallyMultiDoc) return buildGroupSubtree(groups[0]);

  // Resolve each narrowed group's scope against the FULL computation by
  // resource identity (reference equality) when provided, so ids stay
  // consistent with whatever staged the same paths from the unfiltered set —
  // falling back to a fresh positional computation over the narrowed groups
  // only when no caller has threaded the full scopes through (preserves this
  // function's own standalone behaviour for any other/future caller).
  const scopes = fullScopes
    ? groups.map((group) => fullScopes.find((s) => s.resource === group.resource))
    : computeDocumentScopes(entries, options);

  const usedLabels = new Map<string, number>();
  return groups.map((group, i) => {
    const base = documentGroupLabel(group.resource, i);
    const seen = usedLabels.get(base) ?? 0;
    usedLabels.set(base, seen + 1);
    // A narrowed group whose resource isn't found in fullScopes shouldn't
    // happen (see the doc above), but degrades to an unscoped id rather than
    // throwing — a missing scope is a staging-key mismatch, not a crash.
    const scope = scopes[i];
    const id = scope?.id ?? `${pickDocIdPrefix(entries)}${i}`;
    const resource = scope?.resource ?? group.resource;
    const writable = scope?.writable ?? false;
    return {
      key: seen === 0 ? base : `${base} (${seen + 1})`,
      type: 'folder' as const,
      pathTransparent: true,
      document: { id, resource, writable },
      children: buildGroupSubtree(group),
    };
  });
}

/** One source document's staging identity: its wrapper {@link DocumentIdentity} plus its own bare paths. */
export interface DocumentScope extends DocumentIdentity {
  /** The bare dot-paths that belong to this document — the per-document staging namespace. */
  paths: string[];
}

/**
 * The per-document scopes for a unit's entries, in document order, sharing the
 * EXACT id/writable scheme {@link buildResourceGroupedTree} stamps on its wrappers
 * so a stage key built here ({@link docStageKey}) matches the one a rendered leaf
 * builds from its `docScope`. Returns `[]` for a single-document (or identity-less)
 * unit — the caller then keys staging on bare paths, unchanged.
 */
export function computeDocumentScopes(
  entries: FieldEntry[],
  options: ResourceGroupedTreeOptions = {},
): DocumentScope[] {
  const groups = groupFieldEntriesByDocument(entries);
  if (groups.length <= 1) return [];

  const idPrefix = pickDocIdPrefix(entries);
  // A document is only addressable if its identity picks out exactly ONE document
  // in THIS unit: two documents sharing an identity (or lacking one) are
  // indistinguishable to a resource-scoped write, so neither may be written to.
  const scopeKeys = groups.map((g) => resourceScopeKey(g.resource));
  const scopeCounts = new Map<string, number>();
  for (const key of scopeKeys) {
    if (key !== undefined) scopeCounts.set(key, (scopeCounts.get(key) ?? 0) + 1);
  }
  return groups.map((group, i) => {
    const scopeKey = scopeKeys[i];
    return {
      id: `${idPrefix}${i}`,
      resource: group.resource,
      writable: options.scopedWritesSupported === true
        && scopeKey !== undefined
        && scopeCounts.get(scopeKey) === 1,
      paths: group.entries.map((e) => e.path),
    };
  });
}

// ============================================================================
// CONTEXT TREE — build a full subtree with context nodes for progressive disclosure
// ============================================================================

/**
 * Build a context-enriched subtree for a given path prefix.
 * Uses allPaths to create the full tree of children at that level.
 * Nodes matching changedDiffs keep context: undefined (real diffs) with actual old/new values.
 * All others get context: true (rendered dimmed).
 */
export function buildContextTree(
  prefix: string,
  allPaths: { path: string; value: string }[],
  changedPaths: Set<string>,
  changedDiffs?: Map<string, { oldValue: string; newValue: string }>,
  prefixIndex?: PrefixIndex,
): DiffTreeNode[] {
  const searchPrefix = prefix ? prefix + '.' : '';
  const root = builderFolder('root');

  for (const entry of allPaths) {
    if (!entry.path.startsWith(searchPrefix)) continue;

    const relativePath = entry.path.slice(searchPrefix.length);
    if (!relativePath) continue;

    const parts = relativePath.split('.');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        const changed = changedPaths.has(entry.path);
        const realDiff = changed ? changedDiffs?.get(entry.path) : undefined;
        current.children!.push({
          key: part,
          type: 'leaf',
          diff: realDiff ?? { oldValue: '', newValue: entry.value },
          context: changed ? undefined : true,
        });
      } else {
        // O(1) sibling lookup (see BuilderNode) — only folders are indexed, so a
        // same-named leaf never satisfies it, matching the old linear find().
        let child = current.childIndex!.get(part);
        if (!child) {
          const partialPath = searchPrefix + parts.slice(0, i + 1).join('.');
          // Prefer the O(1)/O(log n) prefix index when available; fall back to the
          // linear scan only when no index was threaded through (e.g. tests).
          const hasChangedDescendant = prefixIndex
            ? prefixIndex.changedUnder(partialPath) > 0 || changedPaths.has(partialPath)
            : [...changedPaths].some((p) => p.startsWith(partialPath + '.') || p === partialPath);
          child = builderFolder(part, !hasChangedDescendant);
          current.children!.push(child);
          current.childIndex!.set(part, child);
        }
        current = child;
      }
    }
  }

  return collapseFolderChains(root.children ?? []);
}

// ============================================================================
// KEY-CONTEXT INJECTION — surface identifying sibling fields (name, key, etc.)
// ============================================================================

/** Field names that typically identify an item in a list or map. */
const KEY_LIKE_NAMES = new Set([
  'key', 'path', 'id', 'namespace', 'kind', 'type',
  'hostname', 'host', 'url', 'address', 'repo', 'repository',
]);

/** One candidate identifying sibling: its leaf key and that leaf's value. */
export interface KeyContextCandidate {
  key: string;
  value: string;
}

/**
 * The identifying-sibling candidates that live directly under one parent path,
 * in `allPaths` order.
 *
 * Both lists are bounded (a parent has at most a handful of `name`-ish keys and
 * at most |KEY_LIKE_NAMES| key-like ones), so scanning a bucket is O(1) in the
 * size of the document. Keeping the FULL ordered list rather than just the first
 * entry is load-bearing: the lookup has to skip candidates already present as
 * real children, and the original scan would then fall through to the NEXT
 * candidate in `allPaths` order.
 */
export interface KeyContextBucket {
  /** Direct children whose key lowercases to exactly `name`. */
  names: KeyContextCandidate[];
  /** Direct children whose key lowercases into {@link KEY_LIKE_NAMES}. */
  keyLike: KeyContextCandidate[];
}

/** parent dot-path → its identifying-sibling candidates. Top-level keys sit under `''`. */
export type KeyContextIndex = Map<string, KeyContextBucket>;

/**
 * Index `allPaths` by PARENT path in ONE pass, so {@link injectKeyContext} can
 * resolve an array element's identifying sibling with a map hit.
 *
 * Previously every array-element folder re-scanned the entire `allPaths` list,
 * making the walk O(arrayFolders x allPaths): a document with a 4,000-element
 * array cost ~1.9s, and 8,000 elements ~7.5s — the UI freeze this replaces.
 *
 * Only `name` / {@link KEY_LIKE_NAMES} leaves are retained, so the index is tiny
 * relative to the document. Build it ONCE and pass it to every `injectKeyContext`
 * call that shares the same `allPaths`.
 */
export function buildKeyContextIndex(allPaths: { path: string; value: string }[]): KeyContextIndex {
  const index: KeyContextIndex = new Map();

  for (const entry of allPaths) {
    // Split at the LAST '.': everything before it is the parent path, everything
    // after is the leaf key — exactly the "direct child of prefix" relation the
    // old startsWith(prefix + '.') + "no further dot" test expressed.
    const dot = entry.path.lastIndexOf('.');
    const key = dot === -1 ? entry.path : entry.path.slice(dot + 1);
    const lower = key.toLowerCase();
    const isName = lower === 'name';
    if (!isName && !KEY_LIKE_NAMES.has(lower)) continue;

    const parent = dot === -1 ? '' : entry.path.slice(0, dot);
    let bucket = index.get(parent);
    if (!bucket) {
      bucket = { names: [], keyLike: [] };
      index.set(parent, bucket);
    }
    (isName ? bucket.names : bucket.keyLike).push({ key, value: entry.value });
  }

  return index;
}

/**
 * Walk the diff tree and inject context leaf nodes for key-like sibling fields.
 * Only injects for array-item folders (dot-index keys like `env.0`), picking the
 * single best identifying field: 'name' first, then the first KEY_LIKE_NAMES match.
 * The sibling is looked up from the FULL `allPaths` map, so an UNCHANGED `name`
 * is still found to label its CHANGED `value` even in the narrowed Difference /
 * Upgradable views (where the unchanged name path is filtered out of the tree).
 *
 * Pass `index` (from {@link buildKeyContextIndex}) when several trees are built
 * from the SAME `allPaths` so the one-pass index is paid for once. Omitting it is
 * fully supported and simply builds the index internally.
 */
export function injectKeyContext(
  nodes: DiffTreeNode[],
  allPaths: { path: string; value: string }[],
  parentPrefix = '',
  index?: KeyContextIndex,
): DiffTreeNode[] {
  return walkKeyContext(nodes, parentPrefix, index ?? buildKeyContextIndex(allPaths));
}

/** Recursive half of {@link injectKeyContext}; the index is built once by the entry point. */
function walkKeyContext(nodes: DiffTreeNode[], parentPrefix: string, index: KeyContextIndex): DiffTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'leaf') return node;

    // Path-transparent document wrappers contribute no path segment, so sibling
    // lookups below keep hitting the bare paths present in `allPaths`.
    const fullPrefix = node.pathTransparent
      ? parentPrefix
      : parentPrefix ? `${parentPrefix}.${node.key}` : node.key;
    const children = node.children ?? [];

    const processedChildren = walkKeyContext(children, fullPrefix, index);

    // Only inject context for array-item folders (dot-index notation, e.g. `env.0`).
    if (!isArrayElementPath(node.key)) return { ...node, children: processedChildren };

    // Only inject if this folder has real (non-context) diff leaves. Load-bearing
    // for buildContextTree's output, where whole subtrees can be context-only.
    const hasRealLeaves = processedChildren.some((c) => c.type === 'leaf' && !c.context);
    if (!hasRealLeaves) return { ...node, children: processedChildren };

    const bucket = index.get(fullPrefix);
    if (!bucket) return { ...node, children: processedChildren };

    // A candidate already rendered as a real child must be skipped — injecting it
    // would duplicate the row. The skip happens at LOOKUP time (not index-build
    // time) because `existingKeys` differs per folder.
    const existingKeys = new Set(processedChildren.map((c) => c.key));
    const notExisting = (c: KeyContextCandidate): boolean => !existingKeys.has(c.key);
    // 'name' wins outright; otherwise the first key-like sibling in allPaths order.
    const best = bucket.names.find(notExisting) ?? bucket.keyLike.find(notExisting);
    if (!best) return { ...node, children: processedChildren };

    const contextNode: DiffTreeNode = {
      key: best.key,
      type: 'leaf',
      diff: { oldValue: '', newValue: best.value },
      context: true,
    };
    return { ...node, children: [contextNode, ...processedChildren] };
  });
}

// ============================================================================
// PREFIX INDEX — O(log n)/O(1) descendant lookups precomputed once per build
// ============================================================================

/**
 * Precomputed lookups that replace the per-folder O(allPaths) scans previously
 * run inside every NodeRow render (allPaths.filter(startsWith),
 * changedPaths.filter(startsWith), upgradeFieldDiffs.keys().some(startsWith)).
 *
 * Built ONCE per tree build (memoized in ComponentValuesSection) and passed by
 * reference to every NodeRow, turning the render-time work from
 * O(folders x allPaths) into O(folders x log allPaths) (counts) / O(1) (ancestor
 * membership).
 */
export interface PrefixIndex {
  /** Number of allPaths entries whose path starts with `prefix.`. */
  totalUnder: (prefix: string) => number;
  /** Number of changedPaths whose path starts with `prefix.`. */
  changedUnder: (prefix: string) => number;
  /**
   * True if `folderPath` is an ancestor of a genuinely-upgrading path (upstream
   * diff present AND not locally overridden). Replaces the per-folder
   * Array.from(upgradeFieldDiffs.keys()).some(startsWith) scan.
   */
  isAncestorOfUpgrade: (folderPath: string) => boolean;
  /**
   * True if `folderPath` is an ancestor of any path that should make a folder
   * auto-expand on open (changed / upgrading / overridden). Used to seed the
   * default-collapsed expansion state so changed branches stay visible.
   */
  shouldAutoExpand: (folderPath: string) => boolean;
}

/** Count of sorted entries that fall within [`lo`, `hi`) by their `path`. */
function countInRange(sortedPaths: string[], searchPrefix: string): number {
  // searchPrefix is `${prefix}.`; descendants are exactly the paths in
  // [searchPrefix, searchPrefix + '￿') under lexicographic ordering, since
  // config paths are BMP text and U+FFFF sorts above any real continuation char.
  const lo = lowerBound(sortedPaths, searchPrefix);
  const hi = lowerBound(sortedPaths, searchPrefix + '￿');
  return hi - lo;
}

/** First index i in `arr` with arr[i] >= target (binary search). */
function lowerBound(arr: string[], target: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Add every ancestor folder path of `path` (excluding the leaf itself) to `set`. */
function addAncestors(path: string, set: Set<string>): void {
  let idx = path.indexOf('.');
  while (idx !== -1) {
    set.add(path.slice(0, idx));
    idx = path.indexOf('.', idx + 1);
  }
}

/**
 * Path count above which the treeview switches to lazy (collapsed-by-default)
 * expansion. Below this threshold every folder opens on load (old behaviour).
 * Above it only ancestors of changed/upgrading/overridden paths auto-open.
 */
export const MASSIVE_UNIT_THRESHOLD = 500;

/**
 * Build a PrefixIndex once for a given (allPaths, changedPaths, upgradeFieldDiffs,
 * variationFieldDiffs) set. Memoize the result in the component.
 *
 * When `isMassive` is false (unit has fewer than MASSIVE_UNIT_THRESHOLD paths),
 * `shouldAutoExpand` always returns true so every folder opens on load — matching
 * the pre-optimisation behaviour for small units.
 */
export function buildPrefixIndex(
  allPaths: { path: string; value: string }[],
  changedPaths: Set<string>,
  upgradeFieldDiffs: Map<string, string>,
  variationFieldDiffs: Map<string, string>,
  isMassive = true,
): PrefixIndex {
  const sortedAll = allPaths.map((e) => e.path).sort();
  const sortedChanged = [...changedPaths].sort();

  // Ancestor sets: a folder is in the set iff some qualifying leaf path lives
  // beneath it. Built by walking each qualifying path's ancestor chain once.
  const upgradeAncestors = new Set<string>();
  for (const path of upgradeFieldDiffs.keys()) {
    if (variationFieldDiffs.has(path)) continue; // genuinely-upgrading only
    addAncestors(path, upgradeAncestors);
  }

  // Auto-expand ancestors: changed/upgrading paths plus overridden ones, so the
  // user still sees what changed when the tree opens collapsed-by-default.
  const autoExpandAncestors = new Set<string>();
  for (const path of changedPaths) addAncestors(path, autoExpandAncestors);
  for (const path of upgradeFieldDiffs.keys()) addAncestors(path, autoExpandAncestors);
  for (const path of variationFieldDiffs.keys()) addAncestors(path, autoExpandAncestors);

  // Auto-expand cap (insurance for huge diffs). Each auto-expanded folder mounts
  // its children, so a diff with hundreds of distinct changed paths can mount
  // thousands of rows on open and blow past the interactive budget. For normal
  // diffs (a handful of changed paths → a few dozen ancestor folders) this stays
  // a no-op. Only when the distinct auto-expand-folder count would exceed the cap
  // do we trim to the SHALLOWEST folders (fewest path segments), keeping the
  // top-level/shallowest changed branches open and leaving deeper ones collapsed
  // — the user can still drill in manually. capAutoExpand preserves the original
  // set unchanged when it is already within budget.
  const cappedAutoExpand = capAutoExpand(autoExpandAncestors, MAX_AUTO_EXPAND_FOLDERS);

  return {
    totalUnder: (prefix) => countInRange(sortedAll, `${prefix}.`),
    changedUnder: (prefix) => countInRange(sortedChanged, `${prefix}.`),
    isAncestorOfUpgrade: (folderPath) => upgradeAncestors.has(folderPath),
    shouldAutoExpand: isMassive
      ? (folderPath) => cappedAutoExpand.has(folderPath)
      : () => true,
  };
}

/**
 * Maximum number of distinct folders allowed to auto-expand on open. Generous
 * enough that real diffs (the demo unit: 6 changed paths → 17 auto-expanded
 * folders) are never affected, but bounds the worst case so a diff with hundreds
 * of scattered changed paths doesn't mount thousands of rows at once.
 */
export const MAX_AUTO_EXPAND_FOLDERS = 150;

/**
 * Bound the auto-expand folder set to at most `cap` folders. Returns the input
 * set unchanged (same reference, zero cost) when it is already within budget —
 * so normal diffs are completely unaffected. When over budget, keeps the
 * SHALLOWEST folders (fewest '.'-separated segments, ties broken
 * lexicographically for determinism), which corresponds to opening the
 * top-level/shallowest changed branches and leaving deeper ones collapsed.
 */
export function capAutoExpand(ancestors: Set<string>, cap: number): Set<string> {
  if (ancestors.size <= cap) return ancestors;
  const depthOf = (p: string): number => {
    let d = 0;
    let idx = p.indexOf('.');
    while (idx !== -1) {
      d++;
      idx = p.indexOf('.', idx + 1);
    }
    return d;
  };
  const sorted = [...ancestors].sort((a, b) => {
    const da = depthOf(a);
    const db = depthOf(b);
    if (da !== db) return da - db;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return new Set(sorted.slice(0, cap));
}

// ============================================================================
// DOM & FORMATTING HELPERS
// ============================================================================

/** Format a Date as relative time (e.g. "2m ago", "1h ago", "just now") */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Inject optimistic empty-folder nodes into the tree. Each pending folder whose parent path
 * matches a folder in `nodes` is prepended as the first child of that parent; top-level pending
 * folders (parent === '') are prepended to `nodes`. Returns `nodes` unchanged if pendingFolders is
 * empty.
 */
export function injectPendingFolders(
  nodes: DiffTreeNode[],
  pendingFolders: { fullPath: string; key: string }[],
  parentPrefix = '',
): DiffTreeNode[] {
  if (pendingFolders.length === 0) return nodes;

  const topLevel = pendingFolders.filter((pf) => {
    const dotIdx = pf.fullPath.lastIndexOf('.');
    const pfParent = dotIdx === -1 ? '' : pf.fullPath.slice(0, dotIdx);
    return pfParent === parentPrefix;
  });

  const mapped: DiffTreeNode[] = nodes.map((node) => {
    if (node.type !== 'folder') return node;
    // Document wrappers are path-transparent: recurse with the parent's prefix so a
    // pending folder nested inside a document still matches its real bare path.
    const nodeFullPath = node.pathTransparent
      ? parentPrefix
      : parentPrefix ? `${parentPrefix}.${node.key}` : node.key;
    const childResult = injectPendingFolders(node.children ?? [], pendingFolders, nodeFullPath);
    if (childResult === (node.children ?? [])) return node;
    return { ...node, children: childResult };
  });

  if (topLevel.length === 0) return mapped;

  const synthetics: DiffTreeNode[] = topLevel.map((pf) => ({
    key: pf.key,
    type: 'folder' as const,
    children: [],
  }));
  return [...synthetics, ...mapped];
}

/** Temporarily forces nowrap on cells, measures truncation, then restores. */
export function measureTruncation(cells: (HTMLDivElement | null)[]): boolean {
  const valid = cells.filter((c): c is HTMLDivElement => c !== null);
  if (valid.length === 0) return false;

  for (const cell of valid) {
    cell.style.whiteSpace = 'nowrap';
    cell.style.overflowWrap = 'normal';
  }

  let truncated = false;
  for (const cell of valid) {
    if (cell.scrollWidth > cell.clientWidth + 1) {
      truncated = true;
      break;
    }
  }

  for (const cell of valid) {
    cell.style.whiteSpace = '';
    cell.style.overflowWrap = '';
  }

  return truncated;
}
