// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { DiffEditor } from '@/components/diff-editor/DiffEditor';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import { useRevisionDataMap } from '@/hooks/useUnitData';
import { getDiffStats } from '@/utility/diff-methods';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import DnsIcon from '@mui/icons-material/Dns';
import ViewListIcon from '@mui/icons-material/ViewList';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

interface DiffStatsResult {
  additions: number;
  deletions: number;
  changes: number;
}

const getDiffStatsForUnit = (
  unit: ExtendedUnitRead,
  dataFor: (revisionId?: string) => string,
): DiffStatsResult =>
  getDiffStats(dataFor(unit.LastReleasedRevision?.RevisionID), dataFor(unit.HeadRevision?.RevisionID));

/** Every Revision this view diffs, live and head for each Unit, so one request fetches all. */
const revisionIdsOf = (units: ExtendedUnitRead[]) =>
  units.flatMap((unit) => [unit.LastReleasedRevision?.RevisionID, unit.HeadRevision?.RevisionID]);

export interface IDiffCodeEditorProps {
  units: ExtendedUnitRead[];
  language?: string;
  editorOffset?: string | number;
  /**
   * Configuration for Revisions that are not stored, keyed by RevisionID. A preview of what
   * a function would do has no Revision to read from, so its caller supplies both sides here
   * and they take precedence over what would otherwise be fetched.
   */
  dataOverrides?: Map<string, string>;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const UnitListPanel = styled(Box)(({ theme }) => ({
  width: 200,
  flexShrink: 0,
  //borderRight: `1px solid ${theme.palette.divider}`,
  overflowY: 'auto',
  padding: theme.spacing(0.5),
  backgroundColor: theme.palette.background.paper,
}));

const UnitListItem = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$selected',
})<{ $selected?: boolean }>(({ theme, $selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(0.75, 1),
  borderRadius: theme.spacing(0.5),
  cursor: 'pointer',
  userSelect: 'none',
  margin: theme.spacing(0.2, 0),
  backgroundColor: $selected ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
  '&:hover': {
    backgroundColor: $selected
      ? alpha(theme.palette.primary.main, 0.16)
      : alpha(theme.palette.primary.main, 0.08),
  },
}));

const StatusDot = styled(Box)<{ $hasChanges: boolean }>(({ theme, $hasChanges }) => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
  backgroundColor: $hasChanges ? theme.palette.warning.main : theme.palette.success.main,
}));

const DiffHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(0.75, 1.5),
  borderTop: `1px solid ${theme.palette.divider}`,
  borderRight: `1px solid ${theme.palette.divider}`,
  borderLeft: `1px solid ${theme.palette.divider}`,
  borderRadius: 4,
  backgroundColor: theme.palette.background.paper,
  flexShrink: 0,
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const DiffCodeEditor = ({
  units,
  language = 'yaml',
  editorOffset = '300px',
  dataOverrides,
}: IDiffCodeEditorProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSideBySide, setIsSideBySide] = useState(true);

  // The configuration is not on the Revision, so both sides of every diff are fetched in
  // one request rather than two per Unit.
  const { dataFor: fetchedDataFor } = useRevisionDataMap(
    dataOverrides ? [] : revisionIdsOf(units),
  );
  const dataFor = (revisionId?: string) =>
    (revisionId && dataOverrides?.get(revisionId)) ?? fetchedDataFor(revisionId);

  const statsMap = useMemo(
    () => new Map(units.map((unit) => [unit.Unit?.UnitID, getDiffStatsForUnit(unit, dataFor)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units, dataFor],
  );

  if (units.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant='body2' color='text.secondary'>
          No diffs to display
        </Typography>
      </Box>
    );
  }

  const selectedUnit = units[selectedIndex];
  const selectedStats = statsMap.get(selectedUnit?.Unit?.UnitID);

  const unitPath = [
    selectedUnit?.Space?.Slug,
    selectedUnit?.Target?.Slug,
    selectedUnit?.Unit?.Slug,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <Stack
      direction='row'
      sx={{ height: `calc(100vh - ${editorOffset})`, overflow: 'hidden' }}
    >
      {/* Left unit list — TreeNav style */}
      <UnitListPanel>
        {units.map((unit, index) => {
          const unitId = unit.Unit?.UnitID || '';
          const stats = statsMap.get(unitId);
          const totalChanges = (stats?.additions ?? 0) + (stats?.deletions ?? 0);
          const isSelected = index === selectedIndex;

          return (
            <UnitListItem
              key={unitId}
              $selected={isSelected}
              onClick={() => setSelectedIndex(index)}
            >
              <DnsIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
              <Typography
                variant='caption'
                noWrap
                sx={{ flex: 1, fontWeight: isSelected ? 600 : 400, fontSize: '0.75rem' }}
              >
                {unit.Unit?.Slug || 'Unknown'}
              </Typography>
              <StatusDot $hasChanges={totalChanges > 0} />
            </UnitListItem>
          );
        })}
      </UnitListPanel>

      {/* Right diff area */}
      {selectedUnit && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* GitHub-style header */}
          <DiffHeader>
            <Stack
              direction='row'
              alignItems='center'
              spacing={1}
              sx={{ flex: 1, minWidth: 0, mr: 2 }}
            >
              <DnsIcon sx={{ fontSize: 15, color: 'text.secondary', flexShrink: 0 }} />
              <Typography
                variant='caption'
                color='text.secondary'
                noWrap
                sx={{ fontFamily: 'var(--font-mono)', minWidth: 0 }}
              >
                {unitPath}
              </Typography>
            </Stack>

            <Stack direction='row' alignItems='center' spacing={1.5}>
              {selectedStats && (
                <Stack direction='row' spacing={1} alignItems='center'>
                  {selectedStats.additions > 0 && (
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'success.main',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      +{selectedStats.additions}
                    </Typography>
                  )}
                  {selectedStats.deletions > 0 && (
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'error.main',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      -{selectedStats.deletions}
                    </Typography>
                  )}
                  {selectedStats.changes > 0 && (
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'warning.main',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      ~{selectedStats.changes}
                    </Typography>
                  )}
                </Stack>
              )}

              <Divider orientation='vertical' flexItem />

              <Tooltip title={isSideBySide ? 'Unified view' : 'Side-by-side view'}>
                <IconButton
                  size='small'
                  onClick={() => setIsSideBySide((prev) => !prev)}
                  sx={{ p: 0.5 }}
                >
                  {isSideBySide ? (
                    <ViewListIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <CallSplitIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Tooltip>
            </Stack>
          </DiffHeader>

          {/* Monaco diff editor */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <DiffEditor
              originalContent={dataFor(selectedUnit.LastReleasedRevision?.RevisionID)}
              modifiedContent={dataFor(selectedUnit.HeadRevision?.RevisionID)}
              language={language}
              height='100%'
              renderSideBySide={isSideBySide}
            />
          </Box>
        </Box>
      )}
    </Stack>
  );
};
