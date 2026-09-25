// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Container image references: recognising them in a config path, taking them
 * apart, and saying what KIND of move a pair of them represents.
 *
 * Pure string logic with no React and no data-layer dependency, so the rules can
 * be exercised directly.
 */

import { isRemovalSentinel } from './componentValues';

/**
 * The pod-spec arrays whose elements carry an `image` field.
 *
 * The server holds the canonical list in `public/configkit/k8skit`
 * (`ContainersPaths` / `ContainerArrayPaths`), but that package is reachable
 * only from the function-execution layer — it has no consumer in `internal/` and
 * nothing serves it to the browser. These three strings are therefore a
 * deliberate duplicate, recorded here so that whoever unifies them later knows
 * both copies exist.
 */
const CONTAINER_ARRAYS = ['containers', 'initContainers', 'ephemeralContainers'] as const;

/**
 * Paths arrive in the flattened DOT-INDEX form `parseUnitData` produces —
 * `spec.template.spec.containers.0.image`, never `containers[0].image`.
 *
 * Hoisted rather than built per call: this runs once per path per render over
 * every path in a unit.
 */
const IMAGE_PATH = new RegExp(`(?:^|\\.)(${CONTAINER_ARRAYS.join('|')})\\.(\\d+)\\.image$`);

export interface ContainerImagePath {
  /** Which pod-spec array the container sits in. */
  list: (typeof CONTAINER_ARRAYS)[number];
  /** Position within that array. NOT an identity — see {@link containerPrefix}. */
  index: number;
  /**
   * The path of the container element itself, so a sibling field can be reached:
   * `spec.template.spec.containers.0` for the image path above.
   *
   * This is a POSITION, not an identity. A container replaced at the same index
   * looks like the same container to every lookup keyed on it. Reconciling
   * containers by name instead would be a change to the diff model rather than
   * to this view, so callers must not treat the index as stable identity.
   */
  containerPrefix: string;
}

/** The container an image path belongs to, or null if the path is not an image. */
export function parseImagePath(path: string): ContainerImagePath | null {
  const m = IMAGE_PATH.exec(path);
  if (!m) return null;
  return {
    list: m[1] as ContainerImagePath['list'],
    index: Number(m[2]),
    containerPrefix: path.slice(0, path.length - '.image'.length),
  };
}

export interface ImageRef {
  /** Registry host, when the first segment looks like one. `null` for `otel/collector`. */
  registry: string | null;
  /** Everything between the registry and the repository name. */
  namespace: string | null;
  /** The final path segment — the repository's own name. */
  repository: string;
  /** Registry, namespace and repository joined: everything left of the tag. */
  repoPath: string;
  tag: string | null;
  digest: string | null;
}

/**
 * Split `registry/namespace/repository:tag@digest`.
 *
 * A colon LEFT of the last slash is a port on the registry host
 * (`localhost:5000/app`), not a tag separator, which is the same rule the
 * registry clients use.
 */
export function parseImageRef(ref: string | null | undefined): ImageRef | null {
  if (!ref) return null;
  let rest = ref;
  let digest: string | null = null;
  const at = rest.indexOf('@');
  if (at !== -1) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  let tag: string | null = null;
  const lastSlash = rest.lastIndexOf('/');
  const lastColon = rest.lastIndexOf(':');
  if (lastColon > lastSlash) {
    tag = rest.slice(lastColon + 1);
    rest = rest.slice(0, lastColon);
  }
  const segments = rest.split('/');
  const repository = segments.pop() ?? rest;
  // A host is the first segment only when it looks like one: it carries a dot or
  // a port. `otel/opentelemetry-collector` has no registry, `ghcr.io/x` does.
  const hasHost = segments.length > 0 && /[.:]/.test(segments[0]);
  const registry = hasHost ? segments[0] : null;
  const namespaceSegments = hasHost ? segments.slice(1) : segments;
  return {
    registry,
    namespace: namespaceSegments.length ? namespaceSegments.join('/') : null,
    repository,
    repoPath: rest,
    tag,
    digest,
  };
}

/**
 * What kind of move a pair of references represents.
 *
 * `major` / `minor` / `patch` need no explanation beyond semver. The rest:
 *   `repo`   the image changed registry, namespace or repository name
 *   `digest` the tag did not move and the image behind it did
 *   `build`  a tag with no readable semver — a date, a commit, a build label
 *   `other`  nothing moved, or one side is absent
 *
 * THE REPOSITORY IS TESTED BEFORE THE TAG. A move to a different registry at an
 * identical tag is a real change and the row is otherwise least able to show it,
 * because everywhere else the repository is printed once and shared. Reading the
 * tag first reports such a move as unchanged.
 */
export type ImageChangeClass = 'major' | 'minor' | 'patch' | 'build' | 'digest' | 'repo' | 'other';

export function classifyImageChange(from: ImageRef | null, to: ImageRef | null): ImageChangeClass {
  if (!from || !to) return 'other';
  if (from.repoPath !== to.repoPath) return 'repo';
  if (from.tag === to.tag) return from.digest !== to.digest ? 'digest' : 'other';
  const strip = (tag: string | null): string[] => (tag ?? '').replace(/^v/, '').split('.');
  const fromParts = strip(from.tag);
  const toParts = strip(to.tag);
  const numeric = (parts: string[]): boolean => parts.every((p) => /^\d+$/.test(p));
  if (numeric(fromParts) && numeric(toParts) && fromParts.length >= 2 && toParts.length >= 2) {
    if (fromParts[0] !== toParts[0]) return 'major';
    if (fromParts[1] !== toParts[1]) return 'minor';
    return 'patch';
  }
  return 'build';
}

/** Magnitude bars, or a shape where magnitude cannot be ranked. */
export type ImageMeterLevel = 'flat' | 'low' | 'mid' | 'high' | 'digest';

/**
 * Magnitude rides the meter and never the colour: red and green already mean
 * "before" and "after" in every row of this pane, and a severity ramp laid over
 * that channel would collide with them.
 *
 * A move with no rankable magnitude sits flat rather than borrowing the patch
 * level, so the glyph reads as "cannot be ranked" instead of "small".
 */
export const IMAGE_METER_LEVEL: Record<ImageChangeClass, ImageMeterLevel> = {
  major: 'high',
  minor: 'mid',
  patch: 'low',
  build: 'flat',
  repo: 'flat',
  other: 'flat',
  digest: 'digest',
};

/**
 * The word beside the meter, where there is one.
 *
 * A word is printed ONLY where the meter cannot carry the fact, which is one
 * case. `high` is a ranked signal on a channel built to rank, so a major bump
 * needs no word. `digest` is a shape no other class uses, so it is not
 * mistakable for anything else. But `flat` is shared by a registry move, a
 * commit tag, a date tag and a plain retag — it says "cannot be ranked", which
 * is true of all four and distinguishes none of them, so the registry move is
 * the only class whose meaning the glyph cannot carry.
 */
export const IMAGE_CLASS_WORD: Partial<Record<ImageChangeClass, string>> = {
  repo: 'Registry',
};

/** Widest-first, for `rowImageChange` to rank pairwise classifications against. */
const IMAGE_CLASS_RANK: Record<ImageChangeClass, number> = {
  repo: 6,
  major: 5,
  minor: 4,
  patch: 3,
  build: 2,
  digest: 1,
  other: 0,
};

/**
 * The widest kind of move among the DISTINCT references a compare row holds,
 * across every pair — not just adjacent columns, because three deployments
 * can agree pairwise-adjacent while the row as a whole spans a registry move.
 *
 * There is no reference column any more, so this is a fact about the row,
 * not about any one column's line — `CompareImageRows` prints it once, in
 * the group head, rather than beside every line the way a per-pair class
 * used to sit.
 *
 * Returns `null` when fewer than two distinct references are present:
 * either every deployment agrees, or there is nothing to compare yet.
 */
export function rowImageChange(refs: readonly ImageRef[]): ImageChangeClass | null {
  const distinct: ImageRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.repoPath}:${ref.tag ?? ''}@${ref.digest ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(ref);
  }
  if (distinct.length < 2) return null;

  let widest: ImageChangeClass | null = null;
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      const a = distinct[i];
      const b = distinct[j];
      if (!a || !b) continue;
      const cls = classifyImageChange(a, b);
      if (widest === null || IMAGE_CLASS_RANK[cls] > IMAGE_CLASS_RANK[widest]) widest = cls;
    }
  }
  return widest;
}

export interface ImageRowModel {
  /** Path of the container element — stable within one render, used as the key. */
  containerPrefix: string;
  containerName: string;
  isInit: boolean;
  /** The reference before, or null when the container was added. */
  from: string | null;
  /** The reference after, or null when the container was taken out. */
  to: string | null;
  /**
   * True when the image did not move. Such a row is CONTEXT — it is shown
   * because a container that stayed behind while its neighbours moved is worth
   * seeing, and it is deliberately not a change.
   */
  unchanged: boolean;
}

const CONTAINER_LIST_ORDER: Record<ContainerImagePath['list'], number> = {
  containers: 0,
  initContainers: 1,
  ephemeralContainers: 2,
};

/**
 * Every container image worth a row, whether or not it moved.
 *
 * The two sources are deliberately different in kind, and that is what keeps the
 * change model honest:
 *   `fieldDiffs`  the changes. A container added, removed or re-tagged is here,
 *                 because `computeFieldDiffs` unions the keys of both sides and
 *                 emits wherever they differ.
 *   `allPaths`    every path on the old side. An image absent from `fieldDiffs`
 *                 but present here is by definition identical on both sides.
 * So an unchanged container never enters the change list. Nothing here
 * fabricates a no-op change to make a row appear: an entry in `fieldDiffs`
 * always means a real change, and every count derived from it stays true.
 *
 * Completeness is bounded by what the panel received. A unit over
 * `HEAVY_UNIT_BYTES` is skipped upstream and never reaches this view at all, so
 * this list is every container in the units SHOWN, not every container in the
 * release.
 */
export function buildImageRows(
  fieldDiffs: readonly { path: string; oldValue: string; newValue: string }[],
  allPaths: readonly { path: string; value: string }[],
): ImageRowModel[] {
  const NAME_SUFFIX = '.name';
  const names = new Map<string, string>();
  const unchangedImages: { parsed: ContainerImagePath; value: string }[] = [];
  const changedPaths = new Set<string>();
  for (const d of fieldDiffs) changedPaths.add(d.path);

  // One pass: the name index and the unchanged images come from the same list.
  for (const entry of allPaths) {
    if (entry.path.endsWith(NAME_SUFFIX)) {
      names.set(entry.path.slice(0, -NAME_SUFFIX.length), entry.value);
      continue;
    }
    if (changedPaths.has(entry.path)) continue;
    const parsed = parseImagePath(entry.path);
    if (parsed) unchangedImages.push({ parsed, value: entry.value });
  }
  // `allPaths` is the OLD side, so a container ADDED in this release has no name
  // there — and one RENAMED has only its former name. Both are in the change
  // list, where the new side is what the container is called now. A removed
  // container has no new name, so its old one stands.
  for (const d of fieldDiffs) {
    if (!d.path.endsWith(NAME_SUFFIX) || isRemovalSentinel(d.newValue)) continue;
    names.set(d.path.slice(0, -NAME_SUFFIX.length), d.newValue);
  }

  const rows: { row: ImageRowModel; listOrder: number; index: number }[] = [];
  const push = (parsed: ContainerImagePath, from: string | null, to: string | null, unchanged: boolean): void => {
    rows.push({
      row: {
        containerPrefix: parsed.containerPrefix,
        // A container is named by its sibling `name` field. Without one there is
        // nothing to call it but its slot, which is not a name.
        containerName: names.get(parsed.containerPrefix) ?? `${parsed.list}.${parsed.index}`,
        isInit: parsed.list === 'initContainers',
        from,
        to,
        unchanged,
      },
      listOrder: CONTAINER_LIST_ORDER[parsed.list],
      index: parsed.index,
    });
  };

  for (const d of fieldDiffs) {
    const parsed = parseImagePath(d.path);
    if (!parsed) continue;
    // A side is missing when the shared predicate says so: some toolchains
    // normalise a deleted key to an empty string rather than the dash.
    push(parsed, isRemovalSentinel(d.oldValue) ? null : d.oldValue, isRemovalSentinel(d.newValue) ? null : d.newValue, false);
  }
  for (const { parsed, value } of unchangedImages) push(parsed, value, value, true);

  rows.sort((a, b) => a.listOrder - b.listOrder || a.index - b.index);
  return rows.map((r) => r.row);
}
