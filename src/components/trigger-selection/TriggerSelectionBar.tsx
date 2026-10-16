// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import RefreshIcon from '@mui/icons-material/Cached';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type { useTriggerSelection } from './useTriggerSelection';

export interface TriggerSelectionBarProps {
  entityName: 'Space' | 'Target';
  whereTrigger?: string;
  /** The Trigger Filter, named as <space>/<filter> */
  triggerFilterName?: string;
  selection: ReturnType<typeof useTriggerSelection>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshError?: string;
  /** True while an edited selector is unsaved: saving it, not refreshing, applies what it selects */
  selectorChanged?: boolean;
}

/**
 * Says how a Space or Target selects its Triggers and how many it applies, and offers to refresh
 * the list it applies, which it otherwise re-lists only when its selector changes.
 */
export const TriggerSelectionBar = ({
  entityName,
  whereTrigger,
  triggerFilterName,
  selection,
  onRefresh,
  isRefreshing = false,
  refreshError,
  selectorChanged = false,
}: TriggerSelectionBarProps) => {
  const { hasSelector, selectsOwnSpace, appliedCount, notAppliedCount, noLongerSelectedCount, isStale } = selection;

  const counts = [`${appliedCount} applied`];
  if (notAppliedCount > 0) counts.push(`${notAppliedCount} not yet applied`);
  if (noLongerSelectedCount > 0) counts.push(`${noLongerSelectedCount} no longer selected`);

  return (
    <Stack spacing={1} sx={{ mb: 1 }} data-testid='trigger-selection-bar'>
      <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
        <Typography variant='body2' color='text.secondary'>
          Selected by
        </Typography>
        {whereTrigger && (
          <Tooltip title='Where Trigger' arrow>
            <Chip
              size='small'
              variant='outlined'
              label={whereTrigger}
              sx={{ fontFamily: 'monospace', maxWidth: 480 }}
            />
          </Tooltip>
        )}
        {whereTrigger && triggerFilterName && (
          <Typography variant='body2' color='text.secondary'>
            and
          </Typography>
        )}
        {triggerFilterName && (
          <Tooltip title='Trigger Filter' arrow>
            <Chip size='small' variant='outlined' label={`Filter ${triggerFilterName}`} />
          </Tooltip>
        )}
        {!hasSelector && (
          <Typography variant='body2'>
            {selectsOwnSpace
              ? 'nothing: the Triggers in this Space apply'
              : `nothing: no Triggers apply to this ${entityName}`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant='body2' color={isStale ? 'warning.main' : 'text.secondary'}>
          {counts.join(' · ')}
        </Typography>
        {selectorChanged && (
          <Typography variant='body2' color='text.secondary'>
            Saving applies what the selector selects
          </Typography>
        )}
        {onRefresh && !selectorChanged && (
          <Tooltip
            arrow
            title={`Re-list the Triggers this ${entityName} selects, and re-run them on its Units. A ${entityName} lists them only when its selector changes, so Triggers created or changed in other Spaces since then are not yet applied.`}
          >
            <span>
              <Button
                size='small'
                variant={isStale ? 'contained' : 'outlined'}
                color={isStale ? 'warning' : 'primary'}
                startIcon={isRefreshing ? <CircularProgress size={14} color='inherit' /> : <RefreshIcon />}
                disabled={isRefreshing}
                onClick={onRefresh}
                data-testid='refresh-triggers-button'
              >
                Refresh Triggers
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>
      {selection.errorMessage && <Alert severity='warning'>{selection.errorMessage}</Alert>}
      {refreshError && <Alert severity='error'>{refreshError}</Alert>}
    </Stack>
  );
};
