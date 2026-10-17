// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a ChangeOrder does to container images, read off the server's diff.
 *
 * About nine in ten ChangeOrders only move an image tag, so the list and the
 * detail page lead with that move. Everything here is pure (no React, no MUI,
 * no runtime import from the data layer) so the Playwright pure runner can
 * exercise it: `tests/image-change.pure.spec.ts`.
 */

import type { ConfigDiff, PathChange, PathSegment, ResourceDiff, UnitDiff } from '@confighub/rtk-query';

import { diffsUnderPaths } from '../x/apps/change-order/linkedSourcePaths';
import { parseImageRef, type ImageRef } from '../x/apps/imageRef';

/** Only what the configuration proves: an init container, or a native sidecar. */
export type ContainerRole = 'init' | 'sidecar' | null;

/**
 * The size of an image tag move. `build` is an image tag with no readable
 * semver (a commit, a date); `digest` is the same image tag on a new digest;
 * `registry` is a move to a different registry, namespace or repository.
 */
export type BumpKind = 'major' | 'minor' | 'patch' | 'downgrade' | 'build' | 'digest' | 'registry';

export interface ImageSide {
  /** The full image reference as the configuration holds it. */
  ref: string;
  tag?: string;
  /** Present only when the reference pins `@sha256:`. Never inferred. */
  digest?: string;
}

/**
 * `image`: a container image, or a Helm-style `image: {repository, tag}` pair,
 * with a name and a registry. `version`: a bare version field (`streams.stable.tag`,
 * `chartVersion`) that names no image; its identity is the path it sits under.
 */
export type ImageChangeKind = 'image' | 'version';

export interface ImageChange {
  kind: ImageChangeKind;
  /** True for an entry of a pod spec's container lists. False for a Helm `image: {repository, tag}` pair and for a version change, which sit in a values document. */
  container: boolean;
  /** `containerName|repoPath|fromRef|toRef`: one entry per distinct move. */
  key: string;
  containerName: string;
  role: ContainerRole;
  /** The workload the container sits in; `null` when the move spans more than one. */
  workload: { kind: string; name: string } | null;
  /** The repository's own name, e.g. `payments-api`. For a version change, the path the field sits under, e.g. `streams.stable`. */
  repository: string;
  /** Registry and namespace, e.g. `ghcr.io/acme`. Empty for a version change, and when a Helm values file names no registry. */
  registryPath: string;
  /** Version changes only: the field that changed, e.g. `tag` or `appVersion`. */
  leafKey?: string;
  from: ImageSide;
  to: ImageSide;
  bump: BumpKind;
  /** Units the diff was read over that carry this move. */
  unitCount: number;
}

/** One non-image changed field, for a chip: a short label, and both values. */
export interface FieldChangeDetail {
  /** Short, readable label: `replicas`, `env.INDEX_SHARDS`, `resources.limits.memory`. */
  label: string;
  /** The full path, for a tooltip. */
  path: string;
  from: string;
  to: string;
}

export interface ImageChanges {
  status: 'loading' | 'unavailable' | 'none' | 'some';
  images: ImageChange[];
  /**
   * Non-image changed fields. `sample` holds short labels; `details` the same
   * fields with their values, in the same order, for chips that show them.
   */
  fieldChanges: { count: number; sample: string[]; details: FieldChangeDetail[] };
  /** Units the diff was read over with at least one change. */
  unitCount: number;
}

/** How many field changes are kept for display. The count is always the true total. */
const FIELD_SAMPLE_LIMIT = 6;

export const EMPTY_FIELD_CHANGES: ImageChanges['fieldChanges'] = Object.freeze({
  count: 0,
  sample: [],
  details: [],
}) as ImageChanges['fieldChanges'];

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** `v1.2.3`, `1.2.3-alpine`, `1.2`: major and minor required, patch optional, any suffix ignored. */
const VERSION = /^v?(\d+)\.(\d+)(?:\.(\d+))?/;

function parseVersion(tag: string | undefined): [number, number, number] | null {
  if (tag === undefined) return null;
  const m = VERSION.exec(tag);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

/**
 * The size of the move from one image tag to another.
 *
 * The first part that rises names the bump; a part that falls before any rises
 * is a downgrade. Equal versions (only a suffix or a digest moved) and image
 * tags with no readable version are `build`, because guessing a size from a
 * date or a commit would be invented precision.
 */
export function bumpKindOf(fromTag: string | undefined, toTag: string | undefined): BumpKind {
  const a = parseVersion(fromTag);
  const b = parseVersion(toTag);
  if (!a || !b) return 'build';
  const names: BumpKind[] = ['major', 'minor', 'patch'];
  for (let i = 0; i < 3; i += 1) {
    if (b[i] > a[i]) return names[i];
    if (b[i] < a[i]) return 'downgrade';
  }
  return 'build';
}

/**
 * The kind of a whole reference pair: a repository move outranks any image tag
 * move, and an unchanged image tag on a new digest is `digest`, not a version
 * move, because nothing a reader would call a version changed.
 */
export function bumpKindOfRefs(from: ImageRef, to: ImageRef): BumpKind {
  if (from.repoPath !== to.repoPath) return 'registry';
  if (from.tag === to.tag && from.digest !== to.digest) return 'digest';
  return bumpKindOf(from.tag ?? undefined, to.tag ?? undefined);
}

/** `sha256:9f2c…41ab`, shortened for display as `@9f2c…41ab`. The full digest belongs in a tooltip. */
export function shortDigest(digest: string): string {
  const hex = digest.replace(/^sha256:/, '');
  return hex.length <= 9 ? `@${hex}` : `@${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/**
 * The new image tag split into the part it shares with the old one and the
 * part that changed, so the changed part can be marked.
 *
 * Semver: the change starts at the first of major/minor/patch that differs, and
 * runs to the end (`1.15.0` from `1.14.2` marks `15.0`). Anything else: the
 * longest common prefix, cut back to a separator, so `sha-3f9a1c2` →
 * `sha-81bd04e` marks `81bd04e`, not `1bd04e`.
 */
export function markDelta(fromTag: string, toTag: string): { keep: string; changed: string } {
  const a = parseVersion(fromTag);
  const b = parseVersion(toTag);
  if (a && b) {
    let i = 0;
    while (i < 3 && a[i] === b[i]) i += 1;
    if (i < 3) {
      const prefix = toTag.startsWith('v') ? 'v' : '';
      const parts = toTag.slice(prefix.length).split('.');
      // `1.2.3` → `1.2`: the new image tag has no part where the change is, so fall to the prefix rule.
      if (i < parts.length) {
        const kept = parts.slice(0, i).join('.');
        return { keep: `${prefix}${kept}${kept ? '.' : ''}`, changed: parts.slice(i).join('.') };
      }
    }
  }
  if (fromTag === toTag) return { keep: toTag, changed: '' };
  let p = 0;
  while (p < fromTag.length && p < toTag.length && fromTag[p] === toTag[p]) p += 1;
  while (p > 0 && !/[-._:+]/.test(toTag[p - 1] ?? '')) p -= 1;
  return { keep: toTag.slice(0, p), changed: toTag.slice(p) };
}

// ---------------------------------------------------------------------------
// Monograms
// ---------------------------------------------------------------------------

/**
 * Two letters for an image: the first letters of its first two words, or its
 * first two letters when it has one word. `opentelemetry-collector-contrib` is
 * `OC`, `envoy` is `EN`.
 */
export function monogramOf(repository: string): string {
  const words = repository.split(/[-_.]+/).filter((w) => w.length > 0);
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? repository).slice(0, 2);
  return letters.toUpperCase();
}

/** Soft ground and legible ink, from the design. An image keeps its pair on every row. */
const MONOGRAM_HUES: readonly (readonly [string, string])[] = [
  ['#e6eefc', '#234ba6'],
  ['#e5f3ec', '#1c6b45'],
  ['#fbefe0', '#8a4b00'],
  ['#f4e8f6', '#7a2f86'],
  ['#e3f2f5', '#145e6c'],
  ['#fbe9ea', '#a02a36'],
  ['#eeeefa', '#3d3f99'],
  ['#eef3df', '#4f6113'],
];

/** A stable hue pair for an image name: the same name gets the same colours on every row. */
export function monogramHueOf(repository: string): { ground: string; ink: string } {
  let h = 0;
  for (const c of repository) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [ground, ink] = MONOGRAM_HUES[h % MONOGRAM_HUES.length] ?? MONOGRAM_HUES[0];
  return { ground, ink };
}

/**
 * The full field path of a version change, as data: `streams.stable.tag`.
 * Empty parent path (a field at the document's top level) leaves the key alone.
 */
export function versionPathOf(image: Pick<ImageChange, 'repository' | 'leafKey'>): string {
  const leaf = image.leafKey ?? '';
  return image.repository === '' || image.repository === leaf ? leaf : `${image.repository}.${leaf}`;
}

/** The word a monogram is made from: the repository, or the last segment of a version change's path. */
export function monogramNameOf(image: Pick<ImageChange, 'kind' | 'repository'>): string {
  return image.kind === 'version' ? (image.repository.split('.').pop() || image.repository) : image.repository;
}

// ---------------------------------------------------------------------------
// Version fields
// ---------------------------------------------------------------------------

/**
 * The keys that name a version, exactly and case-sensitively. A scan for
 * anything that looks like a version would take `apiVersion`, `resourceVersion`
 * and schema versions, which are not releases of anything this ChangeOrder ships.
 */
const VERSION_KEYS: ReadonlySet<string> = new Set(['tag', 'imageTag', 'version', 'appVersion', 'chartVersion']);

/**
 * Maps whose keys are labels a person chose, not the release this ChangeOrder
 * ships. A `version: 1.4.2` label often bumps together with the image and would
 * show as a second card, or as a false one when it changes alone.
 */
const LABEL_MAPS: ReadonlySet<string> = new Set(['labels', 'annotations', 'matchLabels', 'selector']);

/** `v0.8.21`, `1.4.2-rc1`, `2.0.0+build5`, `1.2`: digits.digits(.digits), optional leading `v`, optional suffix. */
const VERSION_VALUE = /^v?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z][0-9A-Za-z.+-]*)?$/;

export function looksLikeVersion(value: string | undefined): value is string {
  return value !== undefined && VERSION_VALUE.test(value);
}

interface VersionMove {
  /** The path the field sits under, e.g. `streams.stable`; empty at the document's top level. */
  parentPath: string;
  leafKey: string;
  fromTag: string;
  toTag: string;
  /** Both full image references, when a sibling `repository` (or `image`) names the image. */
  refs: { from: string; to: string } | null;
  /** Sibling changes folded into `refs`, which must not also count as field changes. */
  consumed: PathChange[];
}

/** A key that names where a path sits, so a leaf and its siblings share one. */
function parentKeyOf(segments: readonly PathSegment[]): string {
  return segments
    .slice(0, -1)
    .map((s) => s.Field ?? `[${(s.MergeKeys ?? []).map((k) => `${k.Key}=${k.Value}`).join(',')}#${s.ToIndex}/${s.FromIndex}]`)
    .join('\u0000');
}

/** One side of a sibling leaf as a single-line scalar: an unchanged one holds the same value on both sides. */
function scalarSide(change: PathChange | undefined, side: 'from' | 'to'): string | undefined {
  if (!change) return undefined;
  const value = change.ChangeType === 'None' || side === 'to' ? change.ToValue : change.FromValue;
  return value !== undefined && value !== '' && !/\s/.test(value) ? value : undefined;
}

const carriesTagOrDigest = (ref: string): boolean => ref.includes('@') || ref.lastIndexOf(':') > ref.lastIndexOf('/');

/**
 * A changed leaf that is a version: its key is one of {@link VERSION_KEYS} and
 * BOTH values look like a version. If a sibling `repository` (Helm's
 * `image: {repository, tag}`) or `image` names the image, both references are
 * built so it reads as a normal image bump.
 */
function readVersionMove(change: PathChange, siblings: ReadonlyMap<string, ReadonlyMap<string, PathChange>>): VersionMove | null {
  const segments = change.Segments ?? [];
  const leafKey = segments[segments.length - 1]?.Field;
  if (leafKey === undefined || !VERSION_KEYS.has(leafKey)) return null;
  if (segments.some((segment) => segment.Field !== undefined && LABEL_MAPS.has(segment.Field))) return null;
  const fromTag = change.FromValue;
  const toTag = change.ToValue;
  if (!looksLikeVersion(fromTag) || !looksLikeVersion(toTag)) return null;

  const near = siblings.get(parentKeyOf(segments));
  const repoChange = near?.get('repository') ?? near?.get('image');
  const registryChange = near?.get('registry');
  const build = (side: 'from' | 'to', tag: string): string | undefined => {
    const repo = scalarSide(repoChange, side);
    if (repo === undefined) return undefined;
    // A sibling that is already a full reference (a registry fact's `image: ghcr.io/acme/web:v1.2.3`)
    // is the image, if its own tag is the one that changed.
    if (carriesTagOrDigest(repo)) return parseImageRef(repo)?.tag === tag ? repo : undefined;
    const registry = scalarSide(registryChange, side);
    const base = registry !== undefined && !repo.startsWith(`${registry}/`) ? `${registry}/${repo}` : repo;
    return `${base}:${tag}`;
  };
  const fromRef = build('from', fromTag);
  const toRef = build('to', toTag);
  const refs = fromRef !== undefined && toRef !== undefined ? { from: fromRef, to: toRef } : null;
  const consumed = refs ? [repoChange, registryChange].filter((c): c is PathChange => c !== undefined && isChange(c)) : [];
  return {
    parentPath: segments.slice(0, -1).map(segmentLabel).join('.'),
    leafKey,
    fromTag,
    toTag,
    refs,
    consumed,
  };
}

// ---------------------------------------------------------------------------
// Reading the diff
// ---------------------------------------------------------------------------

const CONTAINER_LISTS = new Set(['containers', 'initContainers', 'ephemeralContainers']);

interface ContainerAt {
  /** Index of the container-list field segment. */
  listIndex: number;
  list: string;
  name: string;
}

/** The innermost container element a path runs through, if any. */
function containerOf(segments: readonly PathSegment[]): ContainerAt | null {
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const field = segments[i]?.Field;
    if (field === undefined || !CONTAINER_LISTS.has(field)) continue;
    const element = segments[i + 1];
    if (element === undefined || element.Field !== undefined) continue;
    const keyed = element.MergeKeys?.find((k) => k.Key === 'name')?.Value;
    const index = element.ToIndex >= 0 ? element.ToIndex : element.FromIndex;
    return { listIndex: i, list: field, name: keyed ?? `${field}.${index}` };
  }
  return null;
}

/** One segment as a reader would write it: a field name, or `[name]` for a keyed element. */
function segmentLabel(segment: PathSegment): string {
  if (segment.Field !== undefined) return segment.Field;
  const key = segment.MergeKeys?.[0]?.Value;
  if (key !== undefined) return key;
  return String(segment.ToIndex >= 0 ? segment.ToIndex : segment.FromIndex);
}

/**
 * A short label for a changed field. Inside a container, the path below the
 * container (`env.INDEX_SHARDS`, with a keyed element's trailing `value` dropped);
 * elsewhere, the path without the pod template's `spec.template.spec`.
 */
export function fieldLabelOf(segments: readonly PathSegment[] | null | undefined, displayPath: string): string {
  if (!segments || segments.length === 0) return displayPath;
  const container = containerOf(segments);
  let rest = container ? segments.slice(container.listIndex + 2) : [...segments];
  if (!container) {
    while (rest.length > 1 && (rest[0]?.Field === 'spec' || rest[0]?.Field === 'template')) rest = rest.slice(1);
  }
  const labels = rest.map(segmentLabel);
  const last = rest[rest.length - 1];
  const beforeLast = rest[rest.length - 2];
  if (labels.length > 1 && last?.Field === 'value' && beforeLast !== undefined && beforeLast.Field === undefined) {
    labels.pop();
  }
  return labels.join('.') || displayPath;
}

function isImagePath(segments: readonly PathSegment[]): ContainerAt | null {
  const last = segments[segments.length - 1];
  if (last?.Field !== 'image') return null;
  const container = containerOf(segments);
  // The image must be the container's own field, not something nested deeper.
  if (!container || container.listIndex !== segments.length - 3) return null;
  return container;
}

function workloadOf(resource: ResourceDiff): { kind: string; name: string } | null {
  const info = resource.Resource;
  if (!info) return null;
  // A Unit with no resource of its own carries these placeholders, which name nothing.
  const typeWord = info.ResourceType?.split('/').pop() ?? '';
  const kind = typeWord === 'NoSchema' ? '' : typeWord;
  const rawName = info.ResourceNameWithoutScope || info.ResourceName || '';
  const name = rawName === 'NoName' ? '' : rawName;
  if (!kind && !name) return null;
  return { kind, name };
}

function isChange(change: PathChange): boolean {
  return change.ChangeType !== 'None' && (change.Comment === undefined || change.Comment === '');
}

function sideOf(ref: string, parsed: ImageRef): ImageSide {
  const side: ImageSide = { ref };
  if (parsed.tag) side.tag = parsed.tag;
  if (parsed.digest?.startsWith('sha256:')) side.digest = parsed.digest;
  return side;
}

/** Registry and namespace of a Helm-derived reference, as far as the values file says: no host is not assumed to be Docker Hub. */
function declaredRegistryPathOf(ref: ImageRef): string {
  return [ref.registry, ref.namespace].filter((part): part is string => part !== null).join('/');
}

/** Registry and namespace. A reference with no host is a Docker Hub one. */
function registryPathOf(ref: ImageRef): string {
  const registry = ref.registry ?? 'docker.io';
  const namespace = ref.namespace ?? (ref.registry === null ? 'library' : null);
  return namespace ? `${registry}/${namespace}` : registry;
}

const ROLE_ORDER = { app: 0, sidecar: 1, init: 2 } as const;
const roleKey = (role: ContainerRole): keyof typeof ROLE_ORDER => role ?? 'app';

/**
 * Turn the per-Unit diffs of a ChangeOrder's base Space into image moves and a
 * field summary.
 *
 * A Unit that carries an `Error` makes the result `unavailable`: an error is
 * not evidence that nothing changed, so it never reads as "No image change".
 * Context rows (`ChangeType: None`, from `include=Context`) count as nothing;
 * they are read only for a container's `restartPolicy`, which is what makes an
 * init container a native sidecar.
 */
export function imageChangesFromUnitDiffs(diffs: readonly UnitDiff[]): ImageChanges {
  let failed = false;
  const groups = new Map<string, { change: Omit<ImageChange, 'unitCount'>; units: Set<string> }>();
  const fieldDetails: FieldChangeDetail[] = [];
  let fieldCount = 0;
  const changedUnits = new Set<string>();

  diffs.forEach((unitDiff, unitIndex) => {
    if (unitDiff.Error) {
      failed = true;
      return;
    }
    const unitKey = unitDiff.UnitID ?? `unit-${unitIndex}`;
    for (const resource of unitDiff.Diff?.Resources ?? []) {
      const changes = resource.Changes ?? [];
      const restartAlways = new Set<string>();
      for (const change of changes) {
        const segments = change.Segments ?? [];
        const last = segments[segments.length - 1];
        if (last?.Field !== 'restartPolicy' || change.ToValue !== 'Always') continue;
        const container = containerOf(segments);
        if (container?.list === 'initContainers' && container.listIndex === segments.length - 3) {
          restartAlways.add(container.name);
        }
      }

      const workload = workloadOf(resource);
      // Sibling leaves by where they sit, and the version fields among the changes. A sibling that
      // is folded into an image reference (a changed `repository`) must not also count as a field.
      const siblings = new Map<string, Map<string, PathChange>>();
      for (const change of changes) {
        const segments = change.Segments ?? [];
        const leaf = segments[segments.length - 1]?.Field;
        if (leaf === undefined) continue;
        const near = siblings.get(parentKeyOf(segments)) ?? new Map<string, PathChange>();
        near.set(leaf, change);
        siblings.set(parentKeyOf(segments), near);
      }
      const versionMoves = new Map<PathChange, VersionMove>();
      const consumed = new Set<PathChange>();
      for (const change of changes) {
        if (!isChange(change) || isImagePath(change.Segments ?? [])) continue;
        const move = readVersionMove(change, siblings);
        if (!move) continue;
        versionMoves.set(change, move);
        move.consumed.forEach((c) => consumed.add(c));
      }
      const record = (change: Omit<ImageChange, 'unitCount'>, unitKey: string) => {
        let group = groups.get(change.key);
        if (!group) {
          group = { change, units: new Set() };
          groups.set(change.key, group);
        }
        group.units.add(unitKey);
        const named = group.change.workload;
        if (named && (named.kind !== workload?.kind || named.name !== workload?.name)) group.change.workload = null;
      };
      if (resource.ChangeType === 'Add' || resource.ChangeType === 'Delete') {
        // A whole resource added or taken out is one field-level change for the summary.
        changedUnits.add(unitKey);
        fieldCount += 1;
        const label = `${workload?.kind ?? 'Resource'}/${workload?.name ?? ''}`;
        if (fieldDetails.length < FIELD_SAMPLE_LIMIT) {
          fieldDetails.push({ label, path: label, from: '', to: resource.ChangeType === 'Add' ? 'added' : 'removed' });
        }
        continue;
      }

      for (const change of changes) {
        if (!isChange(change)) continue;
        changedUnits.add(unitKey);
        if (consumed.has(change)) continue;
        const segments = change.Segments ?? [];
        const container = isImagePath(segments);
        const fromRef = change.FromValue ?? '';
        const toRef = change.ToValue ?? '';
        const fromParsed = container && fromRef ? parseImageRef(fromRef) : null;
        const toParsed = container && toRef ? parseImageRef(toRef) : null;
        if (container && fromParsed && toParsed) {
          // One move across workloads is one line ("in 4 Units"), so the workload is not in the key;
          // a group whose members sit in different workloads names none rather than its first one.
          const role: ContainerRole =
            container.list === 'initContainers' ? (restartAlways.has(container.name) ? 'sidecar' : 'init') : null;
          record(
            {
              kind: 'image',
              container: true,
              key: `${container.name}|${toParsed.repoPath}|${fromRef}|${toRef}`,
              containerName: container.name,
              role,
              workload,
              repository: toParsed.repository,
              registryPath: registryPathOf(toParsed),
              from: sideOf(fromRef, fromParsed),
              to: sideOf(toRef, toParsed),
              bump: bumpKindOfRefs(fromParsed, toParsed),
            },
            unitKey,
          );
          continue;
        }
        const move = versionMoves.get(change);
        if (move) {
          const name = move.parentPath || move.leafKey;
          const fromImage = move.refs ? parseImageRef(move.refs.from) : null;
          const toImage = move.refs ? parseImageRef(move.refs.to) : null;
          if (move.refs && fromImage && toImage) {
            record(
              {
                kind: 'image',
                container: false,
                key: `${name}|${toImage.repoPath}|${move.refs.from}|${move.refs.to}`,
                containerName: name,
                role: null,
                workload,
                repository: toImage.repository,
                registryPath: declaredRegistryPathOf(toImage),
                from: sideOf(move.refs.from, fromImage),
                to: sideOf(move.refs.to, toImage),
                bump: bumpKindOfRefs(fromImage, toImage),
              },
              unitKey,
            );
          } else {
            record(
              {
                kind: 'version',
                container: false,
                key: `version|${name}|${move.leafKey}|${move.fromTag}|${move.toTag}`,
                containerName: name,
                role: null,
                workload,
                repository: name,
                registryPath: '',
                leafKey: move.leafKey,
                from: { ref: move.fromTag, tag: move.fromTag },
                to: { ref: move.toTag, tag: move.toTag },
                bump: bumpKindOf(move.fromTag, move.toTag),
              },
              unitKey,
            );
          }
          continue;
        }
        fieldCount += 1;
        if (fieldDetails.length < FIELD_SAMPLE_LIMIT) {
          const path = change.DisplayPath ?? change.Path ?? '';
          fieldDetails.push({
            label: fieldLabelOf(segments, path),
            path,
            from: change.FromValue ?? '',
            to: change.ToValue ?? '',
          });
        }
      }
    }
  });

  // Images first, then bare version fields; among images, app containers, then sidecars, then init
  // containers, as a pod spec reads.
  const images = [...groups.values()]
    .map(({ change, units }) => ({ ...change, unitCount: units.size }))
    .sort(
      (a, b) =>
        Number(a.kind === 'version') - Number(b.kind === 'version') ||
        ROLE_ORDER[roleKey(a.role)] - ROLE_ORDER[roleKey(b.role)],
    );
  const fieldChanges = {
    count: fieldCount,
    sample: fieldDetails.map((d) => d.label),
    details: fieldDetails,
  };
  let status: ImageChanges['status'] = images.length > 0 ? 'some' : 'none';
  // No Unit has a Revision on either side: the ChangeOrder's Revisions were not found, which
  // says nothing about what it changed, so it must not read as "No image change".
  const noRevisions = diffs.every((d) => !d.FromRevisionNum && !d.ToRevisionNum);
  if (failed || noRevisions) status = 'unavailable';
  return { status, images, fieldChanges, unitCount: changedUnits.size };
}

/** A read still under way: say nothing yet rather than something that may be wrong. */
export const IMAGE_CHANGES_LOADING: ImageChanges = Object.freeze({
  status: 'loading',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ImageChanges;

/** A read that failed, or one with nothing it can read. */
export const IMAGE_CHANGES_UNAVAILABLE: ImageChanges = Object.freeze({
  status: 'unavailable',
  images: [],
  fieldChanges: EMPTY_FIELD_CHANGES,
  unitCount: 0,
}) as ImageChanges;

/**
 * The image changes of one `GET /api/unit_diff` read, by its state: `unavailable` when it
 * failed, never "No image change", since a failed read says nothing about what changed.
 */
export function imageChangesOfRead(diffs: readonly UnitDiff[] | undefined, failed: boolean): ImageChanges {
  if (failed) return IMAGE_CHANGES_UNAVAILABLE;
  if (diffs === undefined) return IMAGE_CHANGES_LOADING;
  return imageChangesFromUnitDiffs(diffs);
}

// ---------------------------------------------------------------------------
// Source Units the page already holds
// ---------------------------------------------------------------------------

/** One source Unit as the page already holds it: the server's diff of what the change does to it. */
export interface SourceDiffGroup {
  unitId: string;
  /** Absent for a Unit whose change could not be established, which adds nothing. */
  diff?: ConfigDiff;
}

/**
 * The image and version changes of a ChangeOrder whose change is not in its own Space.
 *
 * A fan-out ChangeOrder (TransformPaths, Upsert, Insert) makes its change in Units
 * outside its own Space, and an Invoke ChangeOrder's change is what running its
 * Invocation writes, so the server's diff of the ChangeOrder's Space sees nothing for
 * either. The page already holds each source Unit's diff, read with `include=Context`
 * for the siblings an image is named by, so the same reader decides what counts as an
 * image or a version.
 *
 * `loading` and `failed` are the source's own status: a failed read says nothing about
 * whether anything changed.
 */
export function imageChangesForSource(
  sourceStatus: 'loading' | 'resolved' | 'failed',
  groups: readonly SourceDiffGroup[],
): ImageChanges {
  if (sourceStatus === 'loading') return IMAGE_CHANGES_LOADING;
  if (sourceStatus === 'failed') return IMAGE_CHANGES_UNAVAILABLE;
  const diffs = groups.flatMap((group): UnitDiff[] =>
    // Revision numbers on both sides: the diff is of a change, never of nothing.
    group.diff === undefined ? [] : [{ UnitID: group.unitId, FromRevisionNum: 1, ToRevisionNum: 2, Diff: group.diff }],
  );
  return imageChangesFromUnitDiffs(diffs);
}

/** A path in the dot-index form the Links' paths use: `streams.stable.tag`, `spec.containers.0.image`. */
export function dotPathOfSegments(segments: readonly PathSegment[] | null | undefined): string {
  return (segments ?? []).map((s) => s.Field ?? String(s.ToIndex >= 0 ? s.ToIndex : s.FromIndex)).join('.');
}

/**
 * A source Unit's diff narrowed to the paths the ChangeOrder's Links read, as the "At the source" tree is: nothing
 * else in the Unit reaches a Space the change is promoted into. A Unit with no entry in `pathsByUnitId`, or whose
 * paths are `undefined` (the whole Unit can reach downstream), is left whole. Context rows are kept: they are
 * read only for an image's name and a container's `restartPolicy`, and count as no change.
 */
export function narrowUnitDiffsToPaths(
  diffs: readonly UnitDiff[],
  pathsByUnitId: ReadonlyMap<string, readonly string[] | undefined>,
): UnitDiff[] {
  return diffs.map((unitDiff) => {
    const paths = unitDiff.UnitID === undefined ? undefined : pathsByUnitId.get(unitDiff.UnitID);
    if (paths === undefined || !unitDiff.Diff) return unitDiff;
    const resources = (unitDiff.Diff.Resources ?? []).flatMap((resource): ResourceDiff[] => {
      // A whole resource added or taken out is not under any named path.
      if (resource.ChangeType === 'Add' || resource.ChangeType === 'Delete') return [];
      const keyed = (resource.Changes ?? []).map((change) => ({ path: dotPathOfSegments(change.Segments), change }));
      const context = keyed.filter((k) => k.change.ChangeType === 'None').map((k) => k.change);
      const carried = diffsUnderPaths(keyed.filter((k) => k.change.ChangeType !== 'None'), paths).map((k) => k.change);
      return [{ ...resource, Changes: [...carried, ...context] }];
    });
    return { ...unitDiff, Diff: { ...unitDiff.Diff, Resources: resources } };
  });
}
