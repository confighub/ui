// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { MutationMap, ResourceMutation, ResourceMutationList } from '@confighub/rtk-query';

import { matchesResource, type FieldPathMeta } from './configParser';

/**
 * Walk from `path` up through its dot-segment ancestors, returning the
 * `Protected` flag of the FIRST entry found in `map` — the path itself, else
 * its closest ancestor. Mirrors the server's own walk (`storedMutationAncestor`
 * / `FindAncestorPath`, `internal/views/mutation_paths.go`): the walk STOPS at
 * the first entry it finds, protected or not — it does not keep climbing past
 * an unprotected ancestor looking for a protected one further up.
 * Returns undefined when no entry (exact or ancestor) exists at all, so the
 * caller can fall through to the resource-level default.
 */
function findAncestorProtected(map: MutationMap, path: string): boolean | undefined {
  let p = path;
  for (;;) {
    const info = map[p];
    if (info !== undefined) return !!info.Protected;
    const lastDot = p.lastIndexOf('.');
    if (lastDot < 0) return undefined;
    p = p.slice(0, lastDot);
  }
}

/**
 * Build a per-path protection lookup for one unit's `MutationSources`,
 * mirroring the server's own four-rung definition of "is this path protected"
 * (`previousPathProtection`, `internal/views/unit_core.go:1730-1744`) so the UI
 * never disagrees with what a merge will actually do:
 *   1. an exact `PathMutationMap` entry for the path
 *   2. else the closest ANCESTOR entry (a path written inside a protected
 *      subtree inherits its protection)
 *   3. else the resource-level `ResourceMutationInfo.Protected` flag
 *   4. else `false` (the unprotected default)
 *
 * Every path this lookup answers for is free of array indices, and the caller
 * must keep it that way. MutationSources is keyed by ResolvedPath, which
 * addresses array elements associatively by merge key
 * (`spec.template.spec.containers.?name=nginx;@0.image` — see
 * k8skit/yamlkit_compute_mutations_test.go:222). The tree addresses them
 * positionally (`spec.template.spec.containers.0.image`). For a path with no
 * array segment the two notations are the SAME STRING, so no translation is
 * needed and a lookup is exact. For a path with one, the strings never match
 * and every lookup would silently return false — reporting "this will be
 * overwritten" about a value the merge is in fact protecting. There is no
 * ResolvedPath parser in ui/src to translate with, so array paths are excluded
 * from the count entirely rather than answered wrongly.
 */
export function buildProtectedPathLookup(
  mutationSources: ResourceMutationList | undefined,
  fieldPathMeta: Map<string, FieldPathMeta>,
): (path: string) => boolean {
  if (!mutationSources || mutationSources.length === 0) return () => false;

  const findResourceMutation = (path: string): ResourceMutation | undefined => {
    // Single-document unit: no resource identity to disambiguate, the sole
    // entry answers for every path.
    if (mutationSources.length === 1) return mutationSources[0];
    const meta = fieldPathMeta.get(path);
    return mutationSources.find((rm) => matchesResource(meta?.resource, rm.Resource ?? {}));
  };

  return (path: string): boolean => {
    const rm = findResourceMutation(path);
    if (!rm) return false;
    const viaMap = rm.PathMutationMap ? findAncestorProtected(rm.PathMutationMap, path) : undefined;
    if (viaMap !== undefined) return viaMap;
    return !!rm.ResourceMutationInfo?.Protected;
  };
}
