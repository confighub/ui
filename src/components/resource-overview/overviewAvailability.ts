// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { isKubernetesToolchain } from '@/components/code-editor/language';

/**
 * Which resources have an Overview, without loading the views themselves, so a
 * page can decide whether to offer one before it lazy-loads them.
 */

/**
 * The ResourceTypes of configuration other than Kubernetes resources that have
 * a view (the keys of NON_KUBERNETES_REGISTRY in registry.tsx), each with the
 * toolchain whose documents the view reads. An AppConfig document's
 * ResourceType is its configHub.configSchema whatever its format, so the
 * toolchain is what says the body is YAML.
 */
export const NON_KUBERNETES_OVERVIEW_TYPES: ReadonlyMap<string, string> = new Map([
  ['InstallerRecord', 'AppConfig/YAML'],
]);

/**
 * True when a resource has an Overview: every Kubernetes resource does, with
 * the generic view for types without their own, and other configuration does
 * only when a view is registered for its ResourceType.
 */
export function offersOverview(
  toolchainType: string | undefined,
  resourceType: string | undefined,
): boolean {
  return (
    isKubernetesToolchain(toolchainType) ||
    (!!resourceType &&
      !!toolchainType &&
      NON_KUBERNETES_OVERVIEW_TYPES.get(resourceType) === toolchainType)
  );
}

/**
 * The configHub.configSchema of an AppConfig/YAML document, which is its
 * ResourceType. Read with a pattern rather than a parse, since a Unit's whole
 * configuration may be large and this runs while rendering a list of Units.
 */
const CONFIG_SCHEMA_REGEXP =
  /^configHub:[ \t]*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+configSchema:[ \t]*['"]?([^'"\s#]+)/m;

/**
 * offersOverview for a whole Unit, before its resources are read: true when its
 * configuration is Kubernetes, or an AppConfig/YAML document with a view.
 */
export function unitOffersOverview(
  toolchainType: string | undefined,
  data: string | undefined,
): boolean {
  if (isKubernetesToolchain(toolchainType)) return true;
  if (toolchainType !== 'AppConfig/YAML' || !data) return false;
  return offersOverview(toolchainType, CONFIG_SCHEMA_REGEXP.exec(data)?.[1]);
}
