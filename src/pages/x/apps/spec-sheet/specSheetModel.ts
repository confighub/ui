// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The spec sheet's model: a Unit's configuration as resources, parts and blocks, in the
// order of the stored document, with every field as one atom keyed by its stage key.
//
// Pure on purpose. It imports no React and none of the modules that keep a cache or a
// side effect at module level (`entryBuilders.ts`, the parse caches of `configParser.ts`),
// so it can move to a worker if a large Unit ever needs it.
import type { ResourceInfo } from '@confighub/rtk-query';
import { type Node as YamlNode, isMap, isScalar, isSeq, parseAllDocuments } from 'yaml';

import type { FieldEntry } from '../configParser';
import { type DocumentScope, computeDocumentScopes, docStageKey } from '../diffTree';

/** An empty map or an empty list: a field the tree drops, drawn here as a value of its own. */
export type EmptyContainer = { empty: 'map' } | { empty: 'list' };

export interface SheetAtom {
  /** The stage key: the bare path, qualified by the document in a multi-document Unit. */
  key: string;
  /** The bare dot path, as the tree and the staging code write it. */
  path: string;
  segments: (string | number)[];
  /** A scalar (string, number, boolean, null) or an empty container. */
  value: unknown;
  /** True for `{}` and `[]`. They are not leaves of the tree, so no stage key of the tree matches them. */
  emptyContainer?: 'map' | 'list';
  /** The index of the resource that holds the atom. */
  resource: number;
  /** Kebab-case id for test ids, unique in the sheet: `container-gateway-env-node-env`. */
  testKey: string;
  /** A key only upstream has (Incoming): the Unit holds no value for it. */
  added?: boolean;
  /**
   * For an item of a list of plain values (`command`, `args`, `drop`): the list, which the
   * sheet draws as one value. Each item keeps its own stage key.
   */
  list?: { path: string; testKey: string; index: number; length: number };
}

export type PartKind =
  | 'metadata'
  | 'spec'
  | 'pod'
  | 'container'
  | 'init'
  | 'volumes'
  | 'section';

export interface SheetBlock {
  /** Unique inside the sheet: `<part id>-<block key>`, with a run number for a second run. */
  id: string;
  /** Kebab-case id for test ids: `container-gateway-image`. */
  testKey: string;
  /** The staging scope of the document the block is in (the first part of its stage keys). */
  docId?: string;
  /** The block key (`image`, `env`, `labels`, ...), shared by every run of the same key. */
  key: string;
  label: string;
  atoms: SheetAtom[];
  /** The path every atom of the block starts with, relative to the part. */
  prefix: string;
}

export interface SheetPart {
  id: string;
  /** Kebab-case id for test ids, unique in the sheet: `container-gateway`, `deployment-metadata`, `pod`. */
  testKey: string;
  /** For a container or init container: its image, for the fold line. */
  image?: string;
  kind: PartKind;
  title: string;
  /** The atom drawn as the title (a container's `name`), if the title is a field. */
  titleAtom?: SheetAtom;
  blocks: SheetBlock[];
  atomCount: number;
}

export interface SheetResource {
  /** Unique inside the sheet, kebab case: `deployment-openclaw`, `document-3`. */
  id: string;
  index: number;
  kind?: string;
  name?: string;
  apiVersion?: string;
  kindAtom?: SheetAtom;
  nameAtom?: SheetAtom;
  apiVersionAtom?: SheetAtom;
  parts: SheetPart[];
  /** The id of the document's staging scope: the first part of its stage keys. Absent for a single document. */
  docId?: string;
  /** A resource only upstream has, or has deleted: it is one tick on its head, with no field. */
  whole?: { key: string; change: 'added' | 'deleted'; available: boolean };
  /** False for a document that is not a map (a list or a scalar at the root), or a text Unit. */
  structured: boolean;
}

export interface SpecSheet {
  resources: SheetResource[];
  /** Every atom once, in the order the sheet draws it. */
  atoms: SheetAtom[];
}

export interface BuildSpecSheetOptions {
  /** Whether a write can be aimed at one document (the YAML toolchains). Feeds the document scopes. */
  scopedWritesSupported?: boolean;
  /** Text formats the tree does not read as documents (Properties, Env, INI, TOML, Text). */
  flatValues?: Map<string, string>;
}

type PathSeg = string | number;

interface WalkedLeaf {
  segments: PathSeg[];
  value: unknown;
  emptyContainer?: 'map' | 'list';
}

const WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
  'Job',
]);

/** Walks a YAML node in document order. Integer-like keys stay where they are written. */
function walkNode(node: unknown, segments: PathSeg[], out: WalkedLeaf[]): void {
  if (isMap(node)) {
    if (node.items.length === 0) {
      if (segments.length > 0) out.push({ segments, value: {}, emptyContainer: 'map' });
      return;
    }
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      walkNode(pair.value, [...segments, key], out);
    }
    return;
  }
  if (isSeq(node)) {
    if (node.items.length === 0) {
      if (segments.length > 0) out.push({ segments, value: [], emptyContainer: 'list' });
      return;
    }
    node.items.forEach((item, i) => walkNode(item, [...segments, i], out));
    return;
  }
  if (isScalar(node)) {
    out.push({ segments, value: node.value });
    return;
  }
  // An alias or a missing value (`key:` with nothing after it) reads as null.
  out.push({ segments, value: node == null ? null : ((node as YamlNode).toJSON?.() ?? null) });
}

function joinPath(segments: PathSeg[]): string {
  return segments.map(String).join('.');
}

/** The same identity the tree reads from a document (`configParser.ts`, extractResourceIdentity). */
function resourceIdentity(doc: unknown): ResourceInfo | undefined {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
  const d = doc as Record<string, unknown>;
  const apiVersion = typeof d.apiVersion === 'string' ? d.apiVersion : undefined;
  const kind = typeof d.kind === 'string' ? d.kind : undefined;
  const meta = d.metadata;
  const metaObj =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : undefined;
  const namespace = typeof metaObj?.namespace === 'string' ? metaObj.namespace : undefined;
  const name = typeof metaObj?.name === 'string' ? metaObj.name : undefined;
  if (!apiVersion && !kind && !namespace && !name) return undefined;
  return {
    ResourceType:
      apiVersion !== undefined && kind !== undefined ? `${apiVersion}/${kind}` : undefined,
    ResourceName: name !== undefined ? `${namespace ?? ''}/${name}` : undefined,
  };
}

interface ParsedDocument {
  json: unknown;
  leaves: WalkedLeaf[];
}

function parseDocuments(data: string): ParsedDocument[] | null {
  try {
    const docs = parseAllDocuments(data, { uniqueKeys: false });
    if (!Array.isArray(docs) || docs.length === 0) return null;
    const out: ParsedDocument[] = [];
    for (const doc of docs) {
      if (doc.errors.length > 0) return null;
      const json = doc.toJSON() as unknown;
      const leaves: WalkedLeaf[] = [];
      if (json != null) walkNode(doc.contents, [], leaves);
      out.push({ json, leaves });
    }
    return out.some((d) => d.json != null) ? out : null;
  } catch {
    return null;
  }
}

function kebab(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Sentence case for a key: `imagePullSecrets` → `Image pull secrets`. */
export function blockLabelOf(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

const CONTAINER_BLOCKS: Record<string, string> = {
  image: 'image',
  imagePullPolicy: 'image',
  command: 'command',
  args: 'command',
  workingDir: 'command',
  ports: 'ports',
  env: 'env',
  envFrom: 'env',
  resources: 'resources',
  livenessProbe: 'probes',
  readinessProbe: 'probes',
  startupProbe: 'probes',
  volumeMounts: 'mounts',
  volumeDevices: 'mounts',
  securityContext: 'security',
};

const POD_BLOCKS: Record<string, string> = {
  securityContext: 'security',
  automountServiceAccountToken: 'security',
  serviceAccountName: 'security',
  serviceAccount: 'security',
  nodeSelector: 'scheduling',
  affinity: 'scheduling',
  tolerations: 'scheduling',
  topologySpreadConstraints: 'scheduling',
  priorityClassName: 'scheduling',
  nodeName: 'scheduling',
  imagePullSecrets: 'scheduling',
};

const BLOCK_LABELS: Record<string, string> = {
  image: 'Image',
  command: 'Command',
  ports: 'Ports',
  env: 'Env',
  resources: 'Resources',
  probes: 'Probes',
  mounts: 'Mounts',
  security: 'Security',
  scheduling: 'Scheduling',
  volumes: 'Sources',
};

/** Keys whose value is one list of keys and values: the whole map is one block. */
const MAP_PARTS = new Set(['data', 'stringData', 'binaryData']);

interface Placement {
  partKey: string;
  partKind: PartKind;
  partTitle: string;
  /** Path of the part, as segments. Block keys are read under it. */
  partPrefix: PathSeg[];
  blockKey: string;
  blockPrefix: PathSeg[];
  /** The atom is the part's title (a container name). */
  isTitle?: boolean;
  /** The atom is drawn in the resource head (kind, apiVersion, metadata.name). */
  head?: 'kind' | 'apiVersion' | 'name';
}

function placeInWorkload(
  seg: PathSeg[],
  podRoot: PathSeg[],
  json: Record<string, unknown>,
): Placement | null {
  const n = podRoot.length;
  const startsWith = (prefix: PathSeg[]) => prefix.every((p, i) => seg[i] === p);
  if (!startsWith(podRoot)) return null;
  const podSpec = [...podRoot, 'spec'];
  if (
    startsWith(podSpec) &&
    (seg[n + 1] === 'containers' || seg[n + 1] === 'initContainers') &&
    typeof seg[n + 2] === 'number'
  ) {
    const listKey = seg[n + 1] as string;
    const index = seg[n + 2] as number;
    const isInit = listKey === 'initContainers';
    const containerPrefix = [...podSpec, listKey, index];
    const containerJson = getAt(json, containerPrefix);
    const name =
      containerJson &&
      typeof containerJson === 'object' &&
      typeof (containerJson as Record<string, unknown>).name === 'string'
        ? ((containerJson as Record<string, unknown>).name as string)
        : `${isInit ? 'init container' : 'container'} ${index + 1}`;
    const rest = seg.slice(containerPrefix.length);
    const first = String(rest[0] ?? '');
    const partKey = `${isInit ? 'init' : 'container'}:${index}`;
    if (rest.length === 1 && first === 'name') {
      return {
        partKey,
        partKind: isInit ? 'init' : 'container',
        partTitle: name,
        partPrefix: containerPrefix,
        blockKey: 'name',
        blockPrefix: rest,
        isTitle: true,
      };
    }
    const blockKey = CONTAINER_BLOCKS[first] ?? first;
    return {
      partKey,
      partKind: isInit ? 'init' : 'container',
      partTitle: name,
      partPrefix: containerPrefix,
      blockKey,
      blockPrefix: blockKey === first ? [first] : [],
    };
  }
  if (startsWith(podSpec) && seg[n + 1] === 'volumes') {
    return {
      partKey: 'volumes',
      partKind: 'volumes',
      partTitle: 'Volumes',
      partPrefix: [...podSpec, 'volumes'],
      blockKey: 'volumes',
      blockPrefix: [],
    };
  }
  // The rest of the Pod template: its metadata and its spec.
  const sub = seg[n];
  const first = String(seg[n + 1] ?? '');
  if (sub === 'metadata') {
    return {
      partKey: 'pod',
      partKind: 'pod',
      partTitle: 'Pod',
      partPrefix: [...podRoot, 'metadata'],
      blockKey: first,
      blockPrefix: [first],
    };
  }
  if (sub === 'spec') {
    const blockKey = POD_BLOCKS[first] ?? first;
    return {
      partKey: 'pod',
      partKind: 'pod',
      partTitle: 'Pod',
      partPrefix: podSpec,
      blockKey,
      blockPrefix: blockKey === first ? [first] : [],
    };
  }
  return {
    partKey: 'pod',
    partKind: 'pod',
    partTitle: 'Pod',
    partPrefix: podRoot,
    blockKey: String(sub ?? 'other'),
    blockPrefix: sub === undefined ? [] : [sub],
  };
}

function getAt(root: unknown, segments: PathSeg[]): unknown {
  let cur: unknown = root;
  for (const s of segments) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[String(s)];
  }
  return cur;
}

function placeAtom(
  seg: PathSeg[],
  json: Record<string, unknown>,
  kind: string | undefined,
): Placement {
  const top = String(seg[0]);
  if (seg.length === 1 && top === 'kind')
    return {
      partKey: '',
      partKind: 'section',
      partTitle: '',
      partPrefix: [],
      blockKey: '',
      blockPrefix: [],
      head: 'kind',
    };
  if (seg.length === 1 && top === 'apiVersion')
    return {
      partKey: '',
      partKind: 'section',
      partTitle: '',
      partPrefix: [],
      blockKey: '',
      blockPrefix: [],
      head: 'apiVersion',
    };
  if (top === 'metadata') {
    if (seg.length === 2 && seg[1] === 'name') {
      return {
        partKey: '',
        partKind: 'section',
        partTitle: '',
        partPrefix: [],
        blockKey: '',
        blockPrefix: [],
        head: 'name',
      };
    }
    const first = String(seg[1] ?? '');
    return {
      partKey: 'metadata',
      partKind: 'metadata',
      partTitle: 'Metadata',
      partPrefix: ['metadata'],
      blockKey: first,
      blockPrefix: seg.length > 1 ? [first] : [],
    };
  }
  if (top === 'spec') {
    const isWorkload = kind !== undefined && WORKLOAD_KINDS.has(kind);
    if (isWorkload && seg[1] === 'template') {
      const placed = placeInWorkload(seg, ['spec', 'template'], json);
      if (placed) return placed;
    }
    if (kind === 'Pod') {
      const placed = placeInWorkload(['__pod', ...seg], ['__pod'], { __pod: json } as Record<
        string,
        unknown
      >);
      if (placed) {
        return {
          ...placed,
          partPrefix: placed.partPrefix.slice(1),
        };
      }
    }
    const first = String(seg[1] ?? '');
    return {
      partKey: 'spec',
      partKind: 'spec',
      partTitle: 'Spec',
      partPrefix: ['spec'],
      blockKey: first,
      blockPrefix: seg.length > 1 ? [first] : [],
    };
  }
  // Any other top-level key is a part of its own (Data of a ConfigMap, Rules of a Role, ...).
  if (MAP_PARTS.has(top) || seg.length === 1) {
    return {
      partKey: top,
      partKind: 'section',
      partTitle: blockLabelOf(top),
      partPrefix: [top],
      blockKey: top,
      blockPrefix: [],
    };
  }
  const first = String(seg[1]);
  return {
    partKey: top,
    partKind: 'section',
    partTitle: blockLabelOf(top),
    partPrefix: [top],
    blockKey: first,
    blockPrefix: [first],
  };
}

function blockLabel(key: string): string {
  return BLOCK_LABELS[key] ?? blockLabelOf(key);
}

interface DocumentSlot {
  resource: ResourceInfo | undefined;
  leaves: WalkedLeaf[];
  json: unknown;
}

/**
 * The document scopes of the tree, for these documents. `computeDocumentScopes` reads the
 * leaves the tree reads (`flattenStructured`: no `{}`, no `[]`, no empty document), so the
 * same leaves are handed to it, and each document is mapped to the scope of its leaves.
 */
function scopesFor(
  slots: DocumentSlot[],
  scopedWritesSupported: boolean,
): (DocumentScope | undefined)[] {
  const entries: FieldEntry[] = [];
  const firstEntryOfSlot: number[] = [];
  slots.forEach((slot) => {
    firstEntryOfSlot.push(entries.length);
    for (const leaf of slot.leaves) {
      if (leaf.emptyContainer) continue;
      entries.push({
        path: joinPath(leaf.segments),
        segments: leaf.segments,
        value: leaf.value,
        resource: slot.resource,
      });
    }
  });
  const scopes = computeDocumentScopes(entries, { scopedWritesSupported });
  if (scopes.length === 0) return slots.map(() => undefined);
  // Scopes are the runs of entries with one resource reference, in order: walk them.
  const result: (DocumentScope | undefined)[] = [];
  let scopeIndex = -1;
  let lastResource: ResourceInfo | undefined | null = null;
  slots.forEach((slot, i) => {
    const count = (firstEntryOfSlot[i + 1] ?? entries.length) - firstEntryOfSlot[i];
    if (count === 0) {
      // A document with no leaf of the tree joins no scope; its empty containers keep the
      // scope of the document before it, or the bare path when there is none.
      result.push(scopeIndex >= 0 ? scopes[scopeIndex] : undefined);
      return;
    }
    if (lastResource === null || slot.resource !== lastResource) scopeIndex += 1;
    lastResource = slot.resource;
    result.push(scopes[scopeIndex]);
  });
  return result;
}

function resourceSlug(
  kind: string | undefined,
  name: string | undefined,
  index: number,
  used: Set<string>,
): string {
  const base =
    kind || name
      ? kebab([kind, name].filter(Boolean).join(' ')) || `document-${index + 1}`
      : `document-${index + 1}`;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/** Lower kebab case with no camel split, as the design's test ids: `livenessProbe` → `livenessprobe`. */
function idWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The words of a path for a test id: list items that carry a `name` are written by it
 * (`env.2.value` → `env-node-env`), and the `value` of an env item is the item itself.
 */
function idPath(json: unknown, root: PathSeg[], segments: PathSeg[]): string {
  const words: string[] = [];
  let cur: unknown = getAt(json, root);
  for (let i = root.length; i < segments.length; i++) {
    const seg = segments[i];
    const next =
      cur != null && typeof cur === 'object'
        ? (cur as Record<string, unknown>)[String(seg)]
        : undefined;
    if (
      typeof seg === 'number' &&
      next &&
      typeof next === 'object' &&
      typeof (next as Record<string, unknown>).name === 'string'
    ) {
      words.push((next as Record<string, unknown>).name as string);
    } else if (
      seg === 'value' &&
      i === segments.length - 1 &&
      i >= 2 &&
      segments[i - 2] === 'env'
    ) {
      // NODE_ENV's value is the env item itself.
    } else {
      words.push(String(seg));
    }
    cur = next;
  }
  return idWord(words.join('-'));
}

function partIdOf(
  placed: Placement,
  kindWord: string,
): { part: string; prefix: string; root: PathSeg[] } {
  const nameWord = idWord(placed.partTitle);
  switch (placed.partKind) {
    case 'container':
      return {
        part: `container-${nameWord}`,
        prefix: `container-${nameWord}`,
        root: placed.partPrefix,
      };
    case 'init':
      return { part: `init-${nameWord}`, prefix: `init-${nameWord}`, root: placed.partPrefix };
    case 'volumes':
      return { part: 'volumes', prefix: 'volumes', root: placed.partPrefix };
    case 'pod': {
      const root = placed.partPrefix.slice(0, placed.partPrefix.length - 1);
      return { part: 'pod', prefix: 'pod', root };
    }
    case 'metadata':
    case 'spec':
      return { part: `${kindWord}-${placed.partKind}`, prefix: kindWord, root: [] };
    default:
      return {
        part: `${kindWord}-${idWord(placed.partKey) || 'values'}`,
        prefix: kindWord,
        root: [],
      };
  }
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/**
 * Builds the sheet of one Unit's configuration. Every field the stored document holds is
 * one atom, drawn once, including `{}` and `[]`. Resources keep document order; inside a
 * resource the parts sit where their first field sits, and blocks are contiguous runs of
 * one key, so no field moves past a field of another block of its part.
 */
export function buildSpecSheet(
  data: string | undefined,
  options: BuildSpecSheetOptions = {},
): SpecSheet {
  if (options.flatValues) return flatSheet(options.flatValues);
  if (!data || !data.trim()) return { resources: [], atoms: [] };
  const docs = parseDocuments(data);
  if (!docs) return { resources: [], atoms: [] };

  const slots: DocumentSlot[] = docs
    .filter((d) => d.json != null)
    .map((d) => ({ resource: resourceIdentity(d.json), leaves: d.leaves, json: d.json }));
  const scopes = scopesFor(slots, options.scopedWritesSupported === true);
  const usedIds = new Set<string>();
  const usedTestKeys = new Set<string>();
  const usedPartKeys = new Set<string>();
  const resources: SheetResource[] = [];
  const atoms: SheetAtom[] = [];

  slots.forEach((slot, index) => {
    const scope = scopes[index];
    const json = slot.json;
    const isMapDoc = !!json && typeof json === 'object' && !Array.isArray(json);
    const obj = isMapDoc ? (json as Record<string, unknown>) : {};
    const kind = typeof obj.kind === 'string' ? obj.kind : undefined;
    const apiVersion = typeof obj.apiVersion === 'string' ? obj.apiVersion : undefined;
    const meta =
      obj.metadata && typeof obj.metadata === 'object'
        ? (obj.metadata as Record<string, unknown>)
        : undefined;
    const name = typeof meta?.name === 'string' ? meta.name : undefined;
    const resource: SheetResource = {
      id: resourceSlug(kind, name, index, usedIds),
      index,
      kind,
      name,
      apiVersion,
      parts: [],
      docId: scope?.id,
      structured: isMapDoc,
    };
    const kindWord = idWord(kind ?? '') || 'document';
    const toAtom = (
      leaf: WalkedLeaf,
      idPrefix = kindWord,
      idRoot: PathSeg[] = [],
    ): SheetAtom => {
      const path = joinPath(leaf.segments);
      const rel = isMapDoc ? idPath(obj, idRoot, leaf.segments) : idWord(path);
      const last = leaf.segments[leaf.segments.length - 1];
      const parent =
        typeof last === 'number' ? getAt(obj, leaf.segments.slice(0, -1)) : undefined;
      if (
        Array.isArray(parent) &&
        parent.every((item) => item === null || typeof item !== 'object')
      ) {
        const listRel = isMapDoc
          ? idPath(obj, idRoot, leaf.segments.slice(0, -1))
          : idWord(path);
        const listTestKey = [idPrefix, listRel].filter(Boolean).join('-') || idPrefix;
        return {
          testKey: uniqueId(`${listTestKey}-${last}`, usedTestKeys),
          list: {
            path: joinPath(leaf.segments.slice(0, -1)),
            testKey: listTestKey,
            index: last as number,
            length: parent.length,
          },
          key: docStageKey(scope, path),
          path,
          segments: leaf.segments,
          value: leaf.value,
          resource: index,
        };
      }
      return {
        testKey: uniqueId([idPrefix, rel].filter(Boolean).join('-') || idPrefix, usedTestKeys),
        key: docStageKey(scope, path),
        path,
        segments: leaf.segments,
        value: leaf.value,
        emptyContainer: leaf.emptyContainer,
        resource: index,
      };
    };

    if (!isMapDoc) {
      // A list or a scalar at the root: one part of plain keys and values.
      const partKey = uniqueId(`${kindWord}-values`, usedPartKeys);
      const part: SheetPart = {
        id: `${resource.id}-values`,
        testKey: partKey,
        kind: 'section',
        title: 'Values',
        blocks: [],
        atomCount: 0,
      };
      const block: SheetBlock = {
        id: `${part.id}-values`,
        testKey: `${partKey}-values`,
        key: 'values',
        label: 'Values',
        atoms: [],
        prefix: '',
      };
      for (const leaf of slot.leaves) block.atoms.push(toAtom(leaf));
      part.blocks.push(block);
      part.atomCount = block.atoms.length;
      resource.parts.push(part);
      atoms.push(...block.atoms);
      resources.push(resource);
      return;
    }

    const parts = new Map<string, SheetPart>();
    // The last block of each part, so a run of one key continues it and a new key starts a block.
    const lastBlock = new Map<string, SheetBlock>();
    const blockRuns = new Map<string, number>();
    const partIds = new Map<string, { part: string; prefix: string; root: PathSeg[] }>();
    for (const leaf of slot.leaves) {
      const placed = placeAtom(leaf.segments, obj, kind);
      let ids = placed.head ? undefined : partIds.get(placed.partKey);
      if (!placed.head && !ids) {
        const base = partIdOf(placed, kindWord);
        const part = uniqueId(base.part, usedPartKeys);
        // A second container of one name, or a second Deployment, keeps its fields apart too.
        ids = {
          ...base,
          prefix:
            part === base.part ? base.prefix : `${base.prefix}${part.slice(base.part.length)}`,
          part,
        };
        partIds.set(placed.partKey, ids);
      }
      const atom = placed.head ? toAtom(leaf) : toAtom(leaf, ids!.prefix, ids!.root);
      if (placed.head) {
        if (placed.head === 'kind') resource.kindAtom = atom;
        else if (placed.head === 'apiVersion') resource.apiVersionAtom = atom;
        else resource.nameAtom = atom;
        continue;
      }
      let part = parts.get(placed.partKey);
      if (!part) {
        part = {
          id: `${resource.id}-${kebab(placed.partKey.replace(':', '-')) || 'values'}`,
          testKey: ids!.part,
          kind: placed.partKind,
          title: placed.partTitle,
          blocks: [],
          atomCount: 0,
        };
        parts.set(placed.partKey, part);
      }
      part.atomCount += 1;
      if (placed.isTitle) {
        part.titleAtom = atom;
        continue;
      }
      if (
        (placed.partKind === 'container' || placed.partKind === 'init') &&
        leaf.segments[leaf.segments.length - 1] === 'image' &&
        leaf.segments.length === placed.partPrefix.length + 1
      ) {
        part.image = typeof atom.value === 'string' ? atom.value : undefined;
      }
      let block = lastBlock.get(placed.partKey);
      if (!block || block.key !== placed.blockKey) {
        const runKey = `${placed.partKey}\u0000${placed.blockKey}`;
        const run = (blockRuns.get(runKey) ?? 0) + 1;
        blockRuns.set(runKey, run);
        block = {
          id: `${part.id}-${kebab(placed.blockKey) || 'values'}${run > 1 ? `-${run}` : ''}`,
          testKey: `${part.testKey}-${idWord(placed.blockKey) || 'values'}${run > 1 ? `-${run}` : ''}`,
          docId: scope?.id,
          key: placed.blockKey,
          label: blockLabel(placed.blockKey),
          atoms: [],
          prefix: joinPath([...placed.partPrefix, ...placed.blockPrefix]),
        };
        part.blocks.push(block);
        lastBlock.set(placed.partKey, block);
      }
      block.atoms.push(atom);
    }
    resource.parts = [...parts.values()];
    // The head draws kind, name, apiVersion, in that order.
    for (const a of [resource.kindAtom, resource.nameAtom, resource.apiVersionAtom])
      if (a) atoms.push(a);
    for (const part of resource.parts) {
      if (part.titleAtom) atoms.push(part.titleAtom);
      for (const block of part.blocks) atoms.push(...block.atoms);
    }
    resources.push(resource);
  });

  return { resources, atoms };
}

function flatSheet(values: Map<string, string>): SpecSheet {
  const block: SheetBlock = {
    id: 'values-values',
    testKey: 'values-values',
    key: 'values',
    label: 'Values',
    atoms: [],
    prefix: '',
  };
  const used = new Set<string>();
  for (const [path, value] of values) {
    block.atoms.push({
      key: path,
      path,
      segments: path.split('.'),
      value,
      resource: 0,
      testKey: uniqueId(`values-${idWord(path)}`, used),
    });
  }
  const part: SheetPart = {
    id: 'values',
    testKey: 'values',
    kind: 'section',
    title: 'Values',
    blocks: [block],
    atomCount: block.atoms.length,
  };
  const resource: SheetResource = {
    id: 'values',
    index: 0,
    parts: block.atoms.length ? [part] : [],
    structured: false,
  };
  return { resources: block.atoms.length ? [resource] : [], atoms: block.atoms };
}

/** The path of an atom relative to its block, for the key column: `limits.cpu` under `resources`. */
export function atomKeyInBlock(atom: SheetAtom, block: SheetBlock): string {
  if (!block.prefix) return atom.path;
  return atom.path.startsWith(`${block.prefix}.`)
    ? atom.path.slice(block.prefix.length + 1)
    : atom.path === block.prefix
      ? ''
      : atom.path;
}

/** The text of an atom's value, as the sheet writes it. */
export function atomText(atom: SheetAtom): string {
  if (atom.emptyContainer === 'map') return '{}';
  if (atom.emptyContainer === 'list') return '[]';
  const v = atom.value;
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return String(v);
}

/** The kebab-case form of a path, for test ids: `spec.template.spec.containers.0.image` → `...-0-image`. */
export function testKeyOf(text: string): string {
  return kebab(text);
}

/**
 * The same sheet with only the atoms `keep` takes, in the same order: a scope (Changes, Local
 * overrides) filters the sheet, never reorders it. Resources and parts with no atom left go;
 * a resource head stays when any of its fields stays.
 */
export function filterSpecSheet(sheet: SpecSheet, keep: (atom: SheetAtom) => boolean): SpecSheet {
  const resources: SheetResource[] = [];
  // A resource changed whole is shown whole: its fields are not ticked one by one.
  const whole = new Set(sheet.resources.filter((r) => r.whole).map((r) => r.index));
  for (const resource of sheet.resources) {
    if (resource.whole) {
      resources.push(resource);
      continue;
    }
    const parts: SheetPart[] = [];
    for (const part of resource.parts) {
      const blocks = part.blocks
        .map((block) => ({ ...block, atoms: block.atoms.filter(keep) }))
        .filter((block) => block.atoms.length > 0);
      const titleKept = !!part.titleAtom && keep(part.titleAtom);
      if (blocks.length === 0 && !titleKept) continue;
      parts.push({ ...part, blocks, atomCount: blocks.reduce((n, b) => n + b.atoms.length, 0) + (titleKept ? 1 : 0) });
    }
    const headKept = [resource.kindAtom, resource.nameAtom, resource.apiVersionAtom].some((a) => a && keep(a));
    if (parts.length > 0 || headKept || resource.whole) resources.push({ ...resource, parts });
  }
  return { resources, atoms: sheet.atoms.filter((a) => keep(a) || whole.has(a.resource)) };
}
