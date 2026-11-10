// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Where the Validation page links the entities it names, on the app's own routes. */

export const spaceLink = (spaceId: string): string => `/spaces/${spaceId}`;

export const targetLink = (targetId: string): string => `/targets?edit=${targetId}`;

export const componentLink = (componentSlug: string): string =>
  `/components?app=${encodeURIComponent(componentSlug)}`;

export const triggerLink = (triggerId: string): string => `/triggers?edit=${triggerId}`;

export const unitLink = (spaceId: string, unitId: string): string =>
  `/units/${spaceId}/${unitId}`;
