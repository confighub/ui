// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A resource keeps its identity, and with it its protection and history, when the API
// version of its type changes: the server identifies resources by their types without the
// version, toolchain by toolchain, and these functions do the same. ResourceType itself keeps
// the version.

/**
 * A Kubernetes resource type without its API version: apps/v1/Deployment becomes
 * apps/Deployment and v1/Service becomes Service. The version is found by its position in
 * <apiVersion>/<kind>, so any version a CustomResourceDefinition names works.
 */
export function kubernetesResourceTypeWithoutAPIVersion(resourceType: string): string {
  const segments = resourceType.split('/');
  if (segments.length === 2) return segments[1];
  if (segments.length === 3) return `${segments[0]}/${segments[2]}`;
  return resourceType;
}

/** A version in an application configuration schema: v1, v2alpha3, v1b1, v1rc2. */
const SCHEMA_VERSION_SEGMENT = /^v[0-9]+([a-z]+[0-9]+)?$/;

/**
 * An application configuration schema without its version:
 * registrybot.confighub.com/v1alpha3 becomes registrybot.confighub.com. A schema has no fixed
 * structure, so a version is recognized by its form.
 */
export function schemaWithoutVersion(resourceType: string): string {
  if (!resourceType.includes('/')) return resourceType;
  const kept = resourceType.split('/').filter((segment) => !SCHEMA_VERSION_SEGMENT.test(segment));
  return kept.length > 0 ? kept.join('/') : resourceType;
}

/** A resource type of the given toolchain without its API version. */
export function resourceTypeWithoutAPIVersion(resourceType: string, toolchainType: string | undefined): string {
  if (toolchainType?.startsWith('Kubernetes/')) return kubernetesResourceTypeWithoutAPIVersion(resourceType);
  if (toolchainType?.startsWith('AppConfig/')) return schemaWithoutVersion(resourceType);
  return resourceType;
}

/** True when two resource types of a toolchain are the same type, possibly in different API versions. */
export function sameResourceType(a: string, b: string, toolchainType: string | undefined): boolean {
  return a === b || resourceTypeWithoutAPIVersion(a, toolchainType) === resourceTypeWithoutAPIVersion(b, toolchainType);
}

/** True when two Kubernetes resource types are the same type, possibly in different API versions. */
export function sameKubernetesResourceType(a: string, b: string): boolean {
  return a === b || kubernetesResourceTypeWithoutAPIVersion(a) === kubernetesResourceTypeWithoutAPIVersion(b);
}
