// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { DiffEditor } from '@/components/diff-editor/DiffEditor';
import { getDiffStats } from '@/utility/diff-methods';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ViewListIcon from '@mui/icons-material/ViewList';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export interface IUnitCompareViewProps {
  /** Decoded config content for the left (original) pane */
  fromData: string;
  /** Decoded config content for the right (modified) pane */
  toData: string;
  /** Display label for the left pane — shown in the header */
  fromLabel: string;
  /** Display label for the right pane — shown in the header */
  toLabel: string;
  /** Called when the user closes the compare view */
  onClose: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const DiffHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(0.75, 1.5),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  flexShrink: 0,
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const UnitCompareView = ({
  fromData,
  toData,
  fromLabel,
  toLabel,
  onClose,
}: IUnitCompareViewProps) => {
  const stats = useMemo(() => getDiffStats(fromData, toData), [fromData, toData]);
  const hasChanges = stats.additions > 0 || stats.deletions > 0 || stats.changes > 0;
  const [isSideBySide, setIsSideBySide] = useState(true);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <DiffHeader>
        {/* Left: unit labels */}
        <Stack direction='row' alignItems='center' spacing={1} sx={{ flex: 1, minWidth: 0, mr: 2 }}>
          <CompareArrowsIcon sx={{ fontSize: 15, color: 'text.secondary', flexShrink: 0 }} />
          <Typography
            variant='caption'
            color='text.secondary'
            noWrap
            sx={{ fontFamily: '"Roboto Mono", monospace', minWidth: 0 }}
          >
            {fromLabel}
          </Typography>
          <Typography variant='caption' color='text.disabled' sx={{ flexShrink: 0 }}>
            vs
          </Typography>
          <Typography
            variant='caption'
            color='primary.main'
            noWrap
            sx={{ fontFamily: '"Roboto Mono", monospace', minWidth: 0 }}
          >
            {toLabel}
          </Typography>
        </Stack>

        {/* Right: diff stats + toggle + close */}
        <Stack direction='row' alignItems='center' spacing={1.5}>
          {hasChanges && (
            <Stack direction='row' spacing={1} alignItems='center'>
              {stats.additions > 0 && (
                <Typography
                  variant='caption'
                  sx={{ color: 'success.main', fontWeight: 700, fontFamily: '"Roboto Mono", monospace' }}
                >
                  +{stats.additions}
                </Typography>
              )}
              {stats.deletions > 0 && (
                <Typography
                  variant='caption'
                  sx={{ color: 'error.main', fontWeight: 700, fontFamily: '"Roboto Mono", monospace' }}
                >
                  -{stats.deletions}
                </Typography>
              )}
              {stats.changes > 0 && (
                <Typography
                  variant='caption'
                  sx={{ color: 'warning.main', fontWeight: 700, fontFamily: '"Roboto Mono", monospace' }}
                >
                  ~{stats.changes}
                </Typography>
              )}
            </Stack>
          )}

          {!hasChanges && (
            <Typography variant='caption' color='success.main' fontWeight={600}>
              Identical
            </Typography>
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

          <Divider orientation='vertical' flexItem />

          <Tooltip title='Close comparison'>
            <IconButton size='small' onClick={onClose} sx={{ p: 0.5 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </DiffHeader>

      {/* ── Diff editor ─────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <DiffEditor
          originalContent={fromData}
          modifiedContent={toData}
          renderSideBySide={isSideBySide}
          height='100%'
        />
      </Box>
    </Box>
  );
};
