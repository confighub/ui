// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Column, ExtendedViewRead } from '@confighub/rtk-query';
import {
  ALL_GROUPS,
  LABEL_PREFIX,
  SPACE_LABEL_PREFIX,
  getGroupByColumns,
} from '@/components/group-nav';

import { ViewEntityType } from './adapters';

export { ALL_GROUPS, LABEL_PREFIX, SPACE_LABEL_PREFIX, getGroupByColumns };

/**
 * Draft state for a view being created or edited.
 * Mirrors ViewRead fields but all optional except slug.
 */
export interface DraftView {
  /** Entity type the view operates on. Mapped to View.Of + Filter.From on save. */
  entityType: ViewEntityType;
  displayName: string;
  slug: string;
  whereClause: string;
  whereDataClause: string;
  resourceType: string;
  columns: Column[];
  groupBys: string[];
  orderBy: string;
  orderByDirection: 'ASC' | 'DESC';
}

export const EMPTY_DRAFT: DraftView = {
  entityType: 'Unit',
  displayName: '',
  slug: '',
  whereClause: '',
  whereDataClause: '',
  resourceType: '',
  columns: [],
  groupBys: [],
  orderBy: '',
  orderByDirection: 'ASC',
};

/**
 * Annotation key that flags a View as a Resource-typed view. The View itself
 * still has Of='Unit' and Filter.From='Unit' (Resource isn't a real backend
 * entity); the annotation tells the UI to render rows extracted via
 * `get-resources` instead of the units themselves.
 */
export const VIEW_TARGET_ANNOTATION = 'confighub.com/view-target';

/**
 * Resolve the entity type for an existing view. Prefer Filter.From (always set
 * server-side) over View.Of so legacy views that pre-date the Of field still
 * render. The view-target annotation can override the inferred type when the
 * View is being interpreted as a Resource view. Falls back to 'Unit' as the
 * historical default.
 */
export function entityTypeOfView(ev: ExtendedViewRead): ViewEntityType {
  const from = ev.Filter?.From ?? ev.View?.Of;
  if (from === 'Resource') return 'Resource';
  if (from === 'Space') return 'Space';
  // Before a View could declare Resource as its Of, the builder recorded the
  // intent in an annotation. Views saved then still carry it.
  if (ev.View?.Annotations?.[VIEW_TARGET_ANNOTATION] === 'Resource') {
    return 'Resource';
  }
  return 'Unit';
}

/** Convert an ExtendedViewRead back into a DraftView for editing */
export function viewToDraft(ev: ExtendedViewRead): DraftView {
  const v = ev.View;
  return {
    entityType: entityTypeOfView(ev),
    displayName: v?.DisplayName ?? v?.Slug ?? '',
    slug: v?.Slug ?? '',
    whereClause: ev.Filter?.Where ?? '',
    whereDataClause: ev.Filter?.WhereData ?? '',
    resourceType: ev.Filter?.ResourceType ?? '',
    columns: v?.Columns ?? [],
    groupBys: getGroupByColumns(v),
    orderBy: v?.OrderBy ?? '',
    orderByDirection: (v?.OrderByDirection as 'ASC' | 'DESC') ?? 'ASC',
  };
}

/** Generate a filter slug from a view slug */
export function filterSlugFromViewSlug(viewSlug: string): string {
  return `${viewSlug}-filter`;
}

/** Derive a URL-safe slug from a display name */
export function slugFromDisplayName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Filter snippets for computed conditions that can be inserted into the WHERE clause */
export interface FilterSnippet {
  label: string;
  description: string;
  expression: string;
}

/**
 * Snippets keyed by entity type. Unit-specific computed predicates wouldn't
 * parse against Space rows, so the editor only surfaces the snippets matching
 * the current entity type.
 */
export const FILTER_SNIPPETS_BY_ENTITY: Record<ViewEntityType, FilterSnippet[]> = {
  Unit: [
    {
      label: 'Unreleased Changes',
      description: 'Units where head revision is ahead of live and a target is assigned',
      expression: "HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL",
    },
    {
      label: 'Needs Upgrade',
      description: 'Linked units where upstream has a newer revision',
      expression: "UpstreamRevisionNum > 0 AND UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum",
    },
    {
      label: 'Has Target',
      description: 'Units with a target assigned',
      expression: "TargetID IS NOT NULL",
    },
    {
      label: 'No Target',
      description: 'Units without a target',
      expression: "TargetID IS NULL",
    },
  ],
  Space: [],
  // Resource filters evaluate against the underlying unit, so the same unit-
  // level predicates apply. Reusing them gives the user one less thing to
  // re-learn when switching view types.
  Resource: [
    {
      label: 'Has Target',
      description: 'Units with a target assigned',
      expression: "TargetID IS NOT NULL",
    },
  ],
};
