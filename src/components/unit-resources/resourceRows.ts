// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { UnitResourceRow } from '@/hooks/useUnitResources';
import { resourceDisplayName } from '@/utility/resource-type-functions';

/** The resource's name, with its index when other resources of the Unit share the name. */
export function resourceLabel(row: UnitResourceRow): string {
  const name = resourceDisplayName(row.ResourceName, row.ToolchainType);
  return row.ResourceIndex > 0 ? `${name} [${row.ResourceIndex}]` : name;
}

/** The last segment of a ResourceType: the kind of a Kubernetes resource. */
export function resourceKind(resourceType: string): string {
  return resourceType.split('/').pop() || resourceType;
}

/** By kind, as kubectl groups its output, then by name. */
export function compareResources(a: UnitResourceRow, b: UnitResourceRow): number {
  return (
    resourceKind(a.ResourceType).localeCompare(resourceKind(b.ResourceType)) ||
    a.ResourceType.localeCompare(b.ResourceType) ||
    a.ResourceName.localeCompare(b.ResourceName) ||
    a.ResourceIndex - b.ResourceIndex
  );
}
