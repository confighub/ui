// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The value of one field in each Variant of the Component, for the Inspect popover. The field is
// found in each Variant's Unit by resource type and resource name and path, never by path
// alone: two documents of a multi-document Unit can share a path.

import type { ComponentDeployment, PaneUnit } from '../componentTypes';
import { atomText, buildSpecSheet } from './specSheetModel';

export interface VariantValue {
  deploymentId: string;
  displayName: string;
  /** The Variant's Space slug. */
  spaceSlug: string;
  /** The Unit of this Variant that holds the field. */
  unitId: string;
  /** The Variant it is made from, by name; undefined for a base. */
  upstreamName?: string;
  /** The Release the Variant runs, by number. */
  releaseNum?: number;
  unitCount: number;
  value: string | undefined;
  isCurrent: boolean;
}

export interface VariantField {
  /** The resource's kind and name, as the sheet draws its head. */
  kind?: string;
  name?: string;
  /** The bare path of the field in its document. */
  path: string;
}

/** The sheet atom of `field` in a Unit's data, or undefined when that Unit does not hold it. */
function valueIn(data: string | undefined, toolchainType: string | undefined, field: VariantField): string | undefined {
  const sheet = buildSpecSheet(data, { scopedWritesSupported: !!toolchainType && toolchainType.toUpperCase().includes('YAML') });
  const resource = sheet.resources.find((r) => r.kind === field.kind && r.name === field.name);
  if (!resource) return undefined;
  for (const part of resource.parts) {
    for (const block of part.blocks) {
      const atom = block.atoms.find((a) => a.path === field.path);
      if (atom) return atomText(atom);
    }
  }
  const head = [resource.kindAtom, resource.nameAtom, resource.apiVersionAtom].find((a) => a?.path === field.path);
  return head ? atomText(head) : undefined;
}

/**
 * One entry per Variant (deployment) that has a Unit with the current Unit's slug; the current
 * Variant is marked.
 */
export function variantValues(
  field: VariantField,
  slug: string,
  currentSpaceId: string,
  deployments: readonly ComponentDeployment[],
  unitsByDeployment: ReadonlyMap<string, PaneUnit[]>,
): VariantValue[] {
  const out: VariantValue[] = [];
  for (const dep of deployments) {
    const sibling = unitsByDeployment.get(dep.deploymentId)?.find((u) => u.slug === slug);
    if (!sibling) continue;
    out.push({
      deploymentId: dep.deploymentId,
      displayName: dep.displayName,
      spaceSlug: dep.slug,
      unitId: sibling.unitId,
      upstreamName: deployments.find((d) => d.deploymentId === dep.parentDeploymentId)?.displayName,
      releaseNum: dep.runningRelease?.releaseNum,
      unitCount: dep.unitCount,
      value: valueIn(sibling.data, sibling.toolchainType, field),
      isCurrent: dep.deploymentId === currentSpaceId,
    });
  }
  return out;
}
