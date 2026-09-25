// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

import type { ExtendedViewRead } from '@confighub/rtk-query';

import type { EntityType, LabelOptions } from './types';

/**
 * Context value for QueryBuilder
 * Provides shared data to all child components to avoid props drilling
 */
export interface QueryBuilderContextValue {
  /** Entity type being filtered */
  entityType: EntityType;
  /** Available spaces for the space filter */
  spaces: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  /** Available targets for the target filter */
  targets: Array<{ id: string; name: string }>;
  /** Available toolchain types */
  toolchainTypes: string[];
  /** Available bridge workers */
  bridgeWorkers: Array<{ id: string; name: string }>;
  /** Available slugs for the slug autocomplete, with space grouping */
  slugs: Array<{ slug: string; spaceName: string }>;
  /** Available resource types for the resource type filter */
  resourceTypes: string[];
  /** Available label keys and values */
  labelOptions: LabelOptions;
  /** Whether the component is disabled */
  disabled: boolean;
  /** Callback when a saved view is selected */
  onSelectSavedView?: (view: ExtendedViewRead) => void;
  /** Callback to open the add filter menu */
  openAddMenu?: () => void;
}

const QueryBuilderContext = createContext<QueryBuilderContextValue | null>(null);

/**
 * Hook to access QueryBuilder context
 * Must be used within a QueryBuilderProvider
 */
export const useQueryBuilderContext = (): QueryBuilderContextValue => {
  const context = useContext(QueryBuilderContext);
  if (!context) {
    throw new Error('useQueryBuilderContext must be used within a QueryBuilderProvider');
  }
  return context;
};

export const QueryBuilderProvider = QueryBuilderContext.Provider;
