// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ANALYTICS_EVENTS, ENTITY_TYPES } from '../utility/analytics-constants';

/**
 * Analytics Event Names
 */
export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Entity Types for Analytics
 */
export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/**
 * Base properties for entity creation events
 * NOTE: Only includes non-sensitive data (no user input like names/slugs)
 */
export interface EntityCreatedProperties {
  entity_type: EntityType;
  entity_id: string;
  // Additional non-sensitive metadata (dropdowns, selections, counts)
  [key: string]: string | number | boolean | undefined;
}

/**
 * Properties for bulk entity creation events
 */
export interface EntityBulkCreatedProperties {
  entity_type: EntityType;
  count: number;
  // Additional non-sensitive metadata
  [key: string]: string | number | boolean | undefined;
}

/** The views of a Component's configuration, as analytics names them. */
export type ConfigViewName = 'sheet' | 'code' | 'stacked';

/**
 * A view of a Component's configuration is on screen. Fixed words only: no ids, no names.
 */
export interface ConfigViewShownProperties {
  view: ConfigViewName;
  /** Where the view is. */
  surface: 'component_drawer';
  /**
   * `open`: the drawer opened a Component in this view (the one in use, often the default).
   * `switch`: the person picked the view in the View menu.
   * `large_unit`: the person opened a Unit too large for the sheet as code.
   */
  trigger: 'open' | 'switch' | 'large_unit';
}
