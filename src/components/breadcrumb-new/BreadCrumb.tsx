// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';

import { type ExtendedUnitRead } from '@confighub/rtk-query';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { type GroupByOption } from '../group-by-selector/GroupBySelector';

// ============================================================================
// TYPES
// ============================================================================

export interface IBreadcrumbProps {
  /** The unit to display breadcrumb for */
  unit: ExtendedUnitRead;
  /** Current grouping mode - determines which intermediate level to show */
  groupBy?: GroupByOption;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

export const BreadcrumbContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  color: theme.palette.text.secondary,
  fontSize: '0.8125rem',
  marginBottom: theme.spacing(0.5),
}));

export const BreadcrumbLink = styled(Link)(({ theme }) => ({
  color: theme.palette.text.secondary,
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': {
    color: theme.palette.primary.main,
    textDecoration: 'underline',
  },
}));

export const BreadcrumbText = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.disabled,
  fontSize: '0.8125rem',
}));

export const Separator = styled(ChevronRightIcon)(({ theme }) => ({
  fontSize: 16,
  color: theme.palette.text.disabled,
}));

// ============================================================================
// HELPERS
// ============================================================================

interface GroupSegment {
  label: string;
  value: string | null;
}

/**
 * Gets the intermediate breadcrumb segments based on groupBy option.
 * Returns an array to support multi-level groupings like app>environment.
 */
export const getGroupSegments = (
  unit: ExtendedUnitRead,
  groupBy: GroupByOption,
): GroupSegment[] => {
  const labels = unit?.Unit?.Labels;

  switch (groupBy) {
    case 'cluster':
      return [{ label: 'Cluster', value: labels?.cluster ?? null }];
    case 'app':
      return [{ label: 'App', value: labels?.app ?? null }];
    case 'environment':
      return [{ label: 'Environment', value: labels?.environment ?? null }];
    case 'space':
      return [
        {
          label: 'Space',
          value: unit?.Space?.DisplayName ?? unit?.Space?.Slug ?? null,
        },
      ];
    case 'target':
      return [
        {
          label: 'Target',
          value: unit?.Target?.DisplayName ?? unit?.Target?.Slug ?? null,
        },
      ];
    case 'app>environment':
      return [
        { label: 'App', value: labels?.app ?? null },
        { label: 'Environment', value: labels?.environment ?? null },
      ];
    case 'environment>app':
      return [
        { label: 'Environment', value: labels?.environment ?? null },
        { label: 'App', value: labels?.app ?? null },
      ];
    case 'none':
    default:
      return [];
  }
};

export const Breadcrumb = memo(({ unit, groupBy }: IBreadcrumbProps) => {
  const spaceName = unit?.Space?.DisplayName ?? unit?.Space?.Slug ?? 'Unknown Space';
  const segments = getGroupSegments(unit, groupBy ?? 'none');

  return (
    <BreadcrumbContainer>
      {/* Space */}
      {groupBy === 'none' && <BreadcrumbLink>{spaceName}</BreadcrumbLink>}

      {/* Group segments */}
      {segments.map((segment) =>
        segment.value ? (
          <span key={segment.label} style={{ display: 'contents' }}>
            {/* <Separator /> */}
            <BreadcrumbLink>{segment.value}</BreadcrumbLink>
          </span>
        ) : (
          <span key={segment.label} style={{ display: 'contents' }}>
            <Separator />
            <BreadcrumbText>Ungrouped</BreadcrumbText>
          </span>
        ),
      )}

      {/* Current unit (non-clickable) */}
      <Separator />
      <BreadcrumbText>{unit?.Unit?.Slug ?? unit?.Unit?.DisplayName ?? 'Unit'}</BreadcrumbText>
    </BreadcrumbContainer>
  );
});

Breadcrumb.displayName = 'Breadcrumb';
