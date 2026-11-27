// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Staged Keep on merge changes (stage key → whether to keep) as the `ResourceGuards[]` that
// SetUnitGuard expects: one entry per resource, setting the Override guard on the bare paths to
// keep and removing it from the paths to let go. A key's resource comes from the Unit's own
// data: in a multi-document Unit, from the document the stage key names, as two documents can
// hold the same bare path; else from the path. Paths with no resource group together.
// Every key must already be free of array indexes: a positional path would be written under a
// key the merge engine's own lookup never matches.

import type { ResourceGuards, ResourceInfo } from '@confighub/rtk-query';
import { overrideGuardEdit, overrideGuardValue } from '@/utility/override-guard';
import { parseUnitDataStructured } from '../../configParser';
import { computeDocumentScopes, stageKeyDocId, stageKeyPath } from '../../diffTree';

export function buildProtectionEdits(
  protection: ReadonlyMap<string, boolean>,
  data: string | undefined,
  hasUpstream: boolean,
): ResourceGuards[] {
  const entries = parseUnitDataStructured(data);
  const byDocument = new Map(computeDocumentScopes(entries).map((s) => [s.id, s.resource]));
  const byPath = new Map(entries.map((e) => [e.path, e.resource]));
  const byResource = new Map<string, { resource?: ResourceInfo; keep: string[]; release: string[] }>();
  for (const [key, target] of protection) {
    const bare = stageKeyPath(key);
    const docId = stageKeyDocId(key);
    const resource = docId !== undefined && byDocument.has(docId) ? byDocument.get(docId) : byPath.get(bare);
    const resourceKey = JSON.stringify(resource ?? {});
    let entry = byResource.get(resourceKey);
    if (!entry) {
      entry = { resource, keep: [], release: [] };
      byResource.set(resourceKey, entry);
    }
    (target ? entry.keep : entry.release).push(bare);
  }
  const value = overrideGuardValue(hasUpstream);
  return [...byResource.values()].map((e) => overrideGuardEdit(e.resource, e.keep, e.release, value));
}
