// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Pure helpers extracted from CreateComponentPane.tsx's
// buildInput/effectiveUnitCount so the per-file grouping and granularity math
// live outside the component.

import { slugify } from '@/components/query-builder/ViewTabs';

import type { CreateComponentInput } from './useCreateComponentMutation';

export type Granularity = CreateComponentInput['granularity'];

/** Minimal shape `effectiveUnitCount` needs — a structural subset of `DraftDoc`. */
export interface EffectiveCountDoc {
  kind: string | null;
  sourcePath?: string;
}

const isCrd = (d: EffectiveCountDoc) => d.kind === 'CustomResourceDefinition';
const isNamespace = (d: EffectiveCountDoc) => d.kind === 'Namespace';
const isConfigMap = (d: EffectiveCountDoc) => d.kind === 'ConfigMap';

/**
 * Effective number of Units `docs` collapse to under a granularity, mirroring the
 * server's `groupUnits` (plan.go ~:275-362):
 *   - per-resource: one Unit per resource.
 *   - per-file: one Unit per SOURCE FILE the docs came from. Paste/manual drafts
 *     have no `sourcePath` and collapse into one synthetic document (mirroring
 *     `groupIntoSourceDocuments`'s grouping), so this returns 1 for paste/manual,
 *     and the distinct-file count for folder mode.
 *   - minimal: FOUR buckets — Namespaces, CRDs, plain (non-AppConfig) ConfigMaps,
 *     and "main" (everything else). Each NON-EMPTY bucket is one Unit. (AppConfig
 *     carriers always split into their own Unit set, but the wizard can't reliably
 *     detect them from raw YAML, so a plain-looking ConfigMap counts as the
 *     ConfigMap bucket here.)
 */
export function effectiveUnitCount(docs: EffectiveCountDoc[], gran: Granularity): number {
  if (docs.length === 0) return 0;
  if (gran === 'per-resource') return docs.length;
  if (gran === 'per-file') {
    return new Set(docs.map((d) => d.sourcePath ?? '__single__')).size;
  }
  // minimal: count distinct non-empty buckets.
  let ns = 0;
  let crd = 0;
  let cm = 0;
  let main = 0;
  for (const d of docs) {
    if (isNamespace(d)) ns++;
    else if (isCrd(d)) crd++;
    else if (isConfigMap(d)) cm++;
    else main++;
  }
  return (ns > 0 ? 1 : 0) + (crd > 0 ? 1 : 0) + (cm > 0 ? 1 : 0) + (main > 0 ? 1 : 0);
}

/** One group of resources that collapse into a single server-named Unit. */
export interface GroupedUnit<T> {
  /** Human label for the resulting Unit — a bucket name (minimal), the
   * originating file (per-file), or the resource's own kind (per-resource). */
  label: string;
  docs: T[];
}

/**
 * Group `docs` into the Units a granularity would actually produce, for
 * display — same bucketing rules as {@link effectiveUnitCount} (so
 * `groupDraftsForDisplay(docs, gran).length === effectiveUnitCount(docs,
 * gran)` always), but returning the grouped docs and a label instead of a bare
 * count. Lets the Units/Review lists show resources visually clustered under
 * the Unit they become, instead of a flat list next to an unrelated-looking
 * count chip.
 */
export function groupDraftsForDisplay<T extends EffectiveCountDoc>(
  docs: T[],
  gran: Granularity,
): GroupedUnit<T>[] {
  if (docs.length === 0) return [];

  if (gran === 'per-resource') {
    return docs.map((d) => ({ label: d.kind ?? 'resource', docs: [d] }));
  }

  if (gran === 'per-file') {
    const byPath = new Map<string, T[]>();
    for (const d of docs) {
      const key = d.sourcePath ?? '(pasted content)';
      const bucket = byPath.get(key);
      if (bucket) bucket.push(d);
      else byPath.set(key, [d]);
    }
    return [...byPath].map(([label, groupDocs]) => ({ label, docs: groupDocs }));
  }

  // minimal — same first-match-wins bucketing as effectiveUnitCount. Main
  // first: it's the bucket the help text leads with, and typically the one
  // holding most of what was pasted/uploaded.
  const main: T[] = [];
  const configMap: T[] = [];
  const crd: T[] = [];
  const namespace: T[] = [];
  for (const d of docs) {
    if (isNamespace(d)) namespace.push(d);
    else if (isCrd(d)) crd.push(d);
    else if (isConfigMap(d)) configMap.push(d);
    else main.push(d);
  }
  const groups: GroupedUnit<T>[] = [];
  if (main.length > 0) groups.push({ label: 'Main unit', docs: main });
  if (configMap.length > 0) groups.push({ label: 'ConfigMap unit', docs: configMap });
  if (crd.length > 0) groups.push({ label: 'CRD unit', docs: crd });
  if (namespace.length > 0) groups.push({ label: 'Namespace unit', docs: namespace });
  return groups;
}

/** Minimal shape `buildUnitPlan` needs — the fields it derives a Unit slug or
 * content from. */
export interface PlannableDoc extends EffectiveCountDoc {
  name: string;
  resourceName: string | null;
  namespace: string | null;
  yaml: string;
}

/** One Unit `buildUnitPlan` would actually create. */
export interface PlannedUnit {
  slug: string;
  /** 'crd' for the minimal-mode CRD bucket, 'normal' otherwise — the only
   * two kinds a purely client-side plan can produce (no AppConfig detection
   * without the server's toolchain-inference pass). */
  kind: 'normal' | 'crd';
  /** The Unit's full YAML body: its member resources' YAML, in the order
   * they were staged. NOT the server's dependency-aware topological order —
   * that requires the get-references/get-workload-labels functions, which
   * only run server-side, so a multi-resource Unit here is ordered however
   * the resources happened to arrive (paste/file order), not by what
   * references what. */
  content: string;
}

export interface UnitPlan {
  units: PlannedUnit[];
  /** "Kind/namespace/name" identifiers of Secret resources dropped rather
   * than authored as Units — Secrets are never uploaded, mirroring the
   * server's old behavior even though nothing server-side enforces it now. */
  skippedSecrets: string[];
}

/** Renders a resource identifier the way the server's `skippedSecretID` did:
 * "Kind/namespace/name" (or "Kind//name" when cluster-scoped). */
function skippedSecretID(d: PlannableDoc): string {
  return `Secret/${d.namespace ?? ''}/${d.resourceName ?? d.name}`;
}

/** Derives a Unit slug for a minimal-mode bucket, matching the server's old
 * `plan.go` bucket-stem convention (`addBucket`). */
function minimalBucketSlug(label: string, baseSlug: string): string {
  switch (label) {
    case 'ConfigMap unit':
      return `${baseSlug}-configmaps`;
    case 'CRD unit':
      return `${baseSlug}-crds`;
    case 'Namespace unit':
      return `${baseSlug}-namespaces`;
    default:
      return baseSlug;
  }
}

/** Derives a Unit slug for a per-file group from its originating path,
 * matching the server's old `fileStem` (base name, extension stripped). */
function fileStemSlug(path: string, baseSlug: string): string {
  if (path === '(pasted content)') return baseSlug;
  const base = path.replace(/^.*\//, '').replace(/\.[^./]+$/, '');
  return slugify(base) || baseSlug;
}

/**
 * Builds the actual Units (slug + concatenated content) a granularity would
 * create, entirely client-side — the browser-only replacement for the
 * server's `upload.BuildPlan`. Buckets identically to
 * {@link groupDraftsForDisplay} (so the Units created always match what the
 * wizard already showed the user), but this is the one place that turns
 * those buckets into real, unique Unit slugs and joined YAML content.
 *
 * Deliberately does NOT infer Unit→Unit Links or order a multi-resource
 * Unit's documents by dependency — both need the server-side
 * get-references/get-workload-labels functions, which can't run in a
 * browser. Add Links manually afterward if a Space needs them.
 */
export function buildUnitPlan(docs: PlannableDoc[], gran: Granularity, baseSlug: string): UnitPlan {
  const skippedSecrets: string[] = [];
  const authorable = docs.filter((d) => {
    if (d.kind === 'Secret') {
      skippedSecrets.push(skippedSecretID(d));
      return false;
    }
    return true;
  });

  if (authorable.length === 0) return { units: [], skippedSecrets };

  if (gran === 'per-resource') {
    return {
      units: authorable.map((d) => ({
        slug: d.name,
        kind: d.kind === 'CustomResourceDefinition' ? 'crd' : 'normal',
        content: d.yaml,
      })),
      skippedSecrets,
    };
  }

  const groups = groupDraftsForDisplay(authorable, gran);
  const used = new Set<string>();
  const uniqueSlug = (base: string): string => {
    let candidate = base || 'unit';
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    used.add(candidate);
    return candidate;
  };

  return {
    units: groups.map((g) => ({
      slug: uniqueSlug(gran === 'per-file' ? fileStemSlug(g.label, baseSlug) : minimalBucketSlug(g.label, baseSlug)),
      kind: g.label === 'CRD unit' ? 'crd' : 'normal',
      content: g.docs.map((d) => d.yaml).join('\n---\n'),
    })),
    skippedSecrets,
  };
}
