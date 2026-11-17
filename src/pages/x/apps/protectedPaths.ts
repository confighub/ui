// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { PathAnnotationList, ResourcePathAnnotations } from '@confighub/rtk-query';

import { overrideGuardAt } from '@/utility/override-guard';
import { selectByResource, type FieldPathMeta } from './configParser';

/**
 * Build a per-path Keep on merge lookup for one unit's `PathAnnotations`: a
 * path is kept when an Override guard holds it against a merge, found the way
 * the server finds a path's guards (`overrideGuardAt`) so the UI never
 * disagrees with what a merge will actually do:
 *   1. the path's own `PathAnnotationMap` entry
 *   2. else each ANCESTOR entry, nearest first (a guard on a subtree covers
 *      what is written inside it)
 *   3. else the resource's `ResourceAnnotations`
 *   4. else `false` (not kept)
 *
 * Every path this lookup answers for is free of array indices, and the caller
 * must keep it that way. PathAnnotationMap is keyed by canonical path, which
 * addresses array elements by merge key
 * (`spec.template.spec.containers.?name=nginx.image`). The tree addresses them
 * positionally (`spec.template.spec.containers.0.image`). For a path with no
 * array segment the two notations are the SAME STRING, so no translation is
 * needed and a lookup is exact. For a path with one, the strings never match
 * and every lookup would silently return false — reporting "this will be
 * overwritten" about a value the merge is in fact keeping. There is no
 * canonical-path parser in ui/src to translate with, so array paths are
 * excluded from the count entirely rather than answered wrongly.
 */
export function buildProtectedPathLookup(
  pathAnnotations: PathAnnotationList | null | undefined,
  fieldPathMeta: Map<string, FieldPathMeta>,
): (path: string) => boolean {
  if (!pathAnnotations || pathAnnotations.length === 0) return () => false;

  const findResource = (path: string): ResourcePathAnnotations | undefined => {
    const meta = fieldPathMeta.get(path);
    // A document with no resource identity is a single-document unit, whose only
    // annotated resource answers for every path. The annotations list only the
    // resources that have any, so one entry does not mean one document when the
    // path's resource is known.
    if (!meta?.resource) return pathAnnotations.length === 1 ? pathAnnotations[0] : undefined;
    return selectByResource(pathAnnotations, (entry) => entry.Resource, meta.resource)[0];
  };

  return (path: string): boolean => overrideGuardAt(findResource(path), path) !== undefined;
}
