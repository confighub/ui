// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The server path of a tree row in a heavy Unit, which loads no whole-unit blame (PLAN.md decision
// 13). The tree names array elements by position; the server by merge key (positionalPath.ts).
//
// Best effort: which arrays have merge keys is the server's per-type knowledge (yamlkit
// MergeKeysForPath). The Kubernetes lists keyed by `name` are named here; any other array keeps
// its index, as the server does where it finds no merge key. A wrong guess reads as the details'
// error line, never as another field.
import type { ResourceInfo } from '@confighub/rtk-query';

import { positionalToMergeKeyPath } from '@/components/field-diagnosis/positionalPath';

import { parseUnitDataStructured } from '../configParser';

const NAME_KEYED = /(^|\.)(containers|initContainers|ephemeralContainers|env|volumes|imagePullSecrets)$/;

const mergeKeysFor = (arrayPath: string) => (NAME_KEYED.test(arrayPath) ? ['name'] : undefined);

const sameResource = (a: ResourceInfo | undefined, b: ResourceInfo | undefined) =>
  !b || (a?.ResourceType === b.ResourceType && a?.ResourceName === b.ResourceName);

export function heavyFieldPath(data: string | undefined, path: string, resource: ResourceInfo | undefined): string | undefined {
  const leaves = new Map<string, unknown>();
  for (const entry of parseUnitDataStructured(data)) {
    if (sameResource(entry.resource, resource)) leaves.set(entry.path, entry.value);
  }
  return positionalToMergeKeyPath(leaves, path, mergeKeysFor);
}
