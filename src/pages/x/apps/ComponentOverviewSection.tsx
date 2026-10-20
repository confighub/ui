// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useMemo, useState } from 'react';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import { ResourceOverview } from '@/components/resource-overview/ResourceOverview';
import { compareResources, resourceKind, resourceLabel } from '@/components/unit-resources/resourceRows';
import { useUnitResources } from '@/hooks/useUnitResources';

import { componentTheme } from './componentTheme';

interface ComponentOverviewSectionProps {
  spaceId: string;
  unitId: string;
  /**
   * The unit's configuration. Read only to fetch the resources again when it
   * changes, since the server re-extracts them in the same write.
   */
  data?: string;
}

/**
 * Overview of a unit's configuration in the component pane: one row per
 * resource, sorted by kind and name, each opening to the friendly view the
 * resource explorer and the Unit's Resources tab show.
 *
 * The resources are read from the Resource entity rather than parsed out of
 * `data`, so the pane shows exactly what those other pages show. A unit with
 * one resource opens it; with several, each waits for a click, so the list
 * reads as a table of contents.
 */
export const ComponentOverviewSection = memo(({ spaceId, unitId, data }: ComponentOverviewSectionProps) => {
  const { rows, isLoading, error } = useUnitResources({
    spaceID: spaceId,
    unitID: unitId,
    withBody: true,
    refreshKey: data,
  });
  const sortedRows = useMemo(() => [...rows].sort(compareResources), [rows]);
  // The resources whose row was clicked, toggled against the default.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const openByDefault = sortedRows.length === 1;

  // The first load shows a spinner; a refetch after an edit keeps showing what was there.
  if (isLoading && rows.length === 0) {
    return (
      <Box data-testid='component-overview-section' sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box data-testid='component-overview-section' sx={{ p: 1 }}>
        <Alert severity='error'>{error}</Alert>
      </Box>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <Box
        data-testid='component-overview-section'
        sx={{ px: 2, py: 2, fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, fontStyle: 'italic' }}
      >
        This unit's configuration contains no resources.
      </Box>
    );
  }

  return (
    <Box data-testid='component-overview-section'>
      {sortedRows.map((row) => {
        const isOpen = openByDefault !== toggled.has(row.id);
        return (
          <Box key={row.id} sx={{ borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
            <Box
              component='button'
              type='button'
              aria-expanded={isOpen}
              data-testid='component-overview-resource'
              onClick={() =>
                setToggled((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(row.id)) next.add(row.id);
                  return next;
                })
              }
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                px: 1.5,
                py: '5px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: componentTheme.fontSans,
                '&:hover': { background: componentTheme.bgSubtle },
              }}
            >
              <ChevronRightIcon
                sx={{
                  fontSize: 16,
                  color: componentTheme.fgSubtle,
                  flexShrink: 0,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform .12s',
                }}
              />
              <Box component='span' sx={{ fontSize: 11, color: componentTheme.fgMuted, flexShrink: 0 }} title={row.ResourceType}>
                {resourceKind(row.ResourceType)}
              </Box>
              <Box
                component='span'
                sx={{
                  fontSize: 12,
                  fontFamily: componentTheme.fontMono,
                  color: componentTheme.fgDefault,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {resourceLabel(row)}
              </Box>
            </Box>
            {isOpen &&
              (row.ResourceBody === undefined ? (
                <Alert severity='warning' sx={{ m: 1 }}>
                  The configuration of this resource could not be read.
                </Alert>
              ) : (
                <ResourceOverview yaml={row.ResourceBody} resourceType={row.ResourceType} />
              ))}
          </Box>
        );
      })}
    </Box>
  );
});

ComponentOverviewSection.displayName = 'ComponentOverviewSection';
