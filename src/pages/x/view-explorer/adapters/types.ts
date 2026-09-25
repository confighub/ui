// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { NavigateFunction } from 'react-router-dom';

import { Column } from '@confighub/rtk-query';

import { GroupNavRow } from '../cell-value';

/**
 * Entity types the View Explorer can render. 'Unit' and 'Space' mirror the
 * backend's `View.Of` / `Filter.From` field. 'Resource' is a frontend-only
 * pseudo-type: the View is persisted with Of='Unit' and an annotation
 * `confighub.com/view-target = Resource`, then rendered as one row per
 * resource extracted from the matching units via the `get-resources`
 * function. From the user's perspective Resource is an equal first-class
 * choice; the indirection lives entirely in this file's neighbours
 * (useTransparentFilter, entityTypeOfView, useViewData).
 */
export type ViewEntityType = 'Unit' | 'Space' | 'Resource';

/**
 * EntityAdapter captures the entity-specific bits the View Explorer needs in
 * order to render views over different entity types. The Unit adapter exists
 * for backward compatibility; new entity types should add their own adapter
 * and register it in `./index.ts`.
 *
 * Cell extraction lives in the View Explorer's own `cell-value.ts`
 * (delegating unit rows to the shared group-nav extractor) so the stable
 * shared GroupNavPanel stays unaware of Space/Resource entity types. The
 * adapter only carries the entity-shape metadata the page + builder need.
 */
export interface EntityAdapter {
  /** Server-side entity type — written to View.Of and Filter.From. */
  entityType: ViewEntityType;
  /** UI noun used in toolbar messages ("3 units"). */
  noun: string;
  nounPlural: string;
  /** Default column set seeded into a new view of this type. */
  defaultColumns: Column[];
  /**
   * Full column vocabulary surfaced in the ColumnPicker / Group By / Order By
   * selectors. Label columns (Labels.x / Space.Labels.x) are appended at
   * render time from useLabelKeys.
   */
  allColumns: string[];
  /**
   * Whitelist of attribute names suggested by the WHERE-clause typeahead.
   * Only attributes the server's filter syntax accepts for this entity type
   * should appear here.
   */
  filterFields: string[];
  /**
   * Whether the entity has user-supplied configuration data (i.e. Units do,
   * Spaces don't). Drives whether the ViewBuilder renders the Data Filter +
   * Resource Type section.
   */
  supportsDataFilter: boolean;
  /**
   * Whether the entity contains Kubernetes-shaped resources extractable via the
   * `get-resources` function. Drives the Resources tab in EntityDetailDrawer.
   * Spaces are containers and don't carry resource data themselves.
   */
  supportsResources: boolean;
  /** Stable row identity for DataGrid keys + click resolution. */
  getRowId(row: GroupNavRow): string | undefined;
  /** Detail-page URL for the row, used by handleRowClick. */
  getRowHref(row: GroupNavRow): string | undefined;
  /** Default row click — opens detail in new tab on cmd/ctrl-click. */
  navigateToRow(
    row: GroupNavRow,
    event: React.MouseEvent,
    navigate: NavigateFunction,
    extraState?: Record<string, unknown>,
  ): void;
}
