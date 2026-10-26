// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveAsOutlinedIcon from '@mui/icons-material/SaveAsOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, keyframes, styled } from '@mui/material/styles';

import { isDirty } from '../model/reducer';
import { ICON, LABEL, SAVE_COMPACT, iconOnlyBelow } from '../results/compact';
import { useExplorerContext } from '../state/context';
import { tabChanges, useActiveTab, useTabActions } from '../state/useExplorer';
import { ChangesPopover } from './ChangesPopover';
import { ENTITY_CHANGED_HINT, entityChangedFrom, useSaveFlow } from './useSaveFlow';

/**
 * The one place Save lives: the right end of the results toolbar, under the
 * tab whose italic name and dot it clears. It shows only when there is
 * something to save, and it does not move when the filter column collapses,
 * floats or switches to text. In a toolbar under 760px (`SAVE_COMPACT`,
 * `results/compact.ts`) its buttons show icons only, with their names in
 * tooltips, so the labelled actions never push Save out of sight.
 */

const ICON_SX = { fontSize: 16 } as const;
const ICON_ONLY = iconOnlyBelow(SAVE_COMPACT, 28);

// A short slide with no fade: the actions are usable from the first frame, and never look disabled while they arrive.
const slideIn = keyframes`
  from { transform: translateX(6px); }
  to { transform: none; }
`;

const Row = styled(Stack)(({ theme }) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  flexShrink: 0,
  '& > *': { animation: `${slideIn} 160ms ${theme.transitions.easing.easeOut}` },
  // The toolbar's actions are a step larger than the theme's small buttons, like the row count beside them.
  '& .MuiButton-root': {
    height: 28,
    whiteSpace: 'nowrap',
    fontSize: 12.5,
    fontWeight: 700,
    padding: theme.spacing(0, 1.375),
  },
  '& .MuiButton-outlined': { backgroundColor: theme.palette.background.paper },
  '@media (prefers-reduced-motion: reduce)': { '& > *': { animation: 'none' } },
}));

export const DraftDot = styled('span')(({ theme }) => ({
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
  backgroundColor: theme.palette.warning.main,
  boxShadow: `0 0 0 3px ${alpha(theme.palette.warning.main, 0.15)}`,
}));

export const TempDot = styled('span')(({ theme }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  border: `1.5px dashed ${theme.palette.text.disabled}`,
}));

const Kbd = styled('kbd')(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  fontSize: 10.5,
  fontWeight: 600,
  lineHeight: 1,
  padding: '2px 4px',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${alpha(theme.palette.common.white, 0.4)}`,
  color: alpha(theme.palette.common.white, 0.9),
}));

const modKey =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl+';

export function SaveActions() {
  const tab = useActiveTab();
  const { closeTab, discard } = useTabActions();
  const { busy, save, overwrite, saveAsNew } = useSaveFlow();
  const { namingTabId, conflictTabId, setConflictTabId } = useExplorerContext();
  const [changesAnchor, setChangesAnchor] = useState<HTMLElement | null>(null);

  if (tab.kind === 'builtin') return null;
  const dirty = isDirty(tab);
  if (tab.kind === 'saved' && !dirty) return null;
  const changes = tabChanges(tab);
  const temporary = tab.kind === 'temp';
  const entityChanged = !!entityChangedFrom(tab);
  const label = temporary
    ? 'Temporary'
    : `${changes.length} change${changes.length === 1 ? '' : 's'}`;

  if (conflictTabId === tab.id && !temporary) {
    return (
      <Row key={`${tab.id}:conflict`} data-testid='vx-save-conflict' role='alert'>
        <Typography
          variant='body2'
          color='warning.dark'
          fontWeight={600}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Changed by someone else since you opened it
        </Typography>
        <Button
          size='small'
          variant='text'
          color='inherit'
          sx={{ color: 'text.secondary' }}
          onClick={() => setConflictTabId(null)}
        >
          Cancel
        </Button>
        <Button
          size='small'
          variant='outlined'
          color='inherit'
          onClick={saveAsNew}
          disabled={busy}
        >
          Save as new
        </Button>
        {!entityChanged && (
          <Button
            size='small'
            variant='contained'
            color='warning'
            onClick={overwrite}
            disabled={busy}
          >
            Overwrite
          </Button>
        )}
      </Row>
    );
  }

  const saveLabel = temporary ? 'Save view…' : 'Save';
  return (
    <Row key={`${tab.id}:${tab.kind}`} data-testid='vx-save-actions'>
      <Tooltip title={label} disableInteractive>
        <Button
          size='small'
          variant='text'
          color='inherit'
          onClick={(e) => setChangesAnchor(e.currentTarget)}
          aria-label={label}
          startIcon={
            <Box sx={{ display: 'inline-flex', px: 0.25 }}>
              {temporary ? <TempDot /> : <DraftDot />}
            </Box>
          }
          endIcon={temporary ? undefined : <ExpandMoreIcon fontSize='small' />}
          sx={[
            {
              color: 'text.secondary',
              fontWeight: 600,
              borderRadius: 999,
              bgcolor: 'action.hover',
              '&:hover': { bgcolor: 'action.selected' },
            },
            ICON_ONLY,
            // The dot stands for the label; the button has no other icon.
            { [SAVE_COMPACT]: { '& .MuiButton-startIcon': { m: 0 } } },
          ]}
        >
          <span className={LABEL}>{label}</span>
        </Button>
      </Tooltip>
      {temporary ? (
        <Tooltip title='Close' disableInteractive>
          <Button
            size='small'
            variant='text'
            color='inherit'
            aria-label='Close'
            sx={[{ color: 'text.secondary' }, ICON_ONLY]}
            onClick={() => closeTab(tab.id)}
          >
            <CloseIcon className={ICON} sx={ICON_SX} />
            <span className={LABEL}>Close</span>
          </Button>
        </Tooltip>
      ) : (
        <Tooltip title='Discard' disableInteractive>
          <Button
            size='small'
            variant='text'
            color='inherit'
            aria-label='Discard'
            sx={[{ color: 'text.secondary' }, ICON_ONLY]}
            onClick={discard}
          >
            <UndoOutlinedIcon className={ICON} sx={ICON_SX} />
            <span className={LABEL}>Discard</span>
          </Button>
        </Tooltip>
      )}
      {!temporary && (
        <Tooltip title='Save as new' disableInteractive>
          {/* A disabled button gets no pointer events; the span carries the tooltip. */}
          <span>
            <Button
              size='small'
              variant='outlined'
              color='inherit'
              aria-label='Save as new'
              sx={ICON_ONLY}
              onClick={saveAsNew}
              disabled={busy}
            >
              <SaveAsOutlinedIcon className={ICON} sx={ICON_SX} />
              <span className={LABEL}>Save as new</span>
            </Button>
          </span>
        </Tooltip>
      )}
      <Tooltip title={entityChanged ? ENTITY_CHANGED_HINT : `${saveLabel} · ${modKey}S`} disableInteractive>
        <span data-testid='vx-save-button-wrap'>
          <Button
            size='small'
            variant='contained'
            onClick={save}
            aria-label={saveLabel}
            disabled={busy || namingTabId === tab.id || entityChanged}
            sx={[{ gap: 0.75 }, ICON_ONLY]}
          >
            <SaveOutlinedIcon className={ICON} sx={ICON_SX} />
            <span className={LABEL}>{saveLabel}</span>
            <Kbd aria-hidden>{modKey}S</Kbd>
          </Button>
        </span>
      </Tooltip>
      <ChangesPopover
        anchor={changesAnchor}
        onClose={() => setChangesAnchor(null)}
        changes={changes}
        temporary={temporary}
      />
    </Row>
  );
}
