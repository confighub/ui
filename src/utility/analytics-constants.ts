// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Analytics Event Names
 * Constants for PostHog event tracking
 */

export const ANALYTICS_EVENTS = {
  // Entity creation events
  ENTITY_CREATED: 'entity_created',
  ENTITY_BULK_CREATED: 'entity_bulk_created',
} as const;

/**
 * Entity Types for Analytics
 */
export const ENTITY_TYPES = {
  SPACE: 'space',
  UNIT: 'unit',
  TARGET: 'target',
  TRIGGER: 'trigger',
  FILTER: 'filter',
  VIEW: 'view',
  INVOCATION: 'invocation',
  LINK: 'link',
} as const;
