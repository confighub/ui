// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field details (PLAN.md R1, contract D1). Order: path label, value (hero) with Edit, the
// unsaved edit, the set-by line, the chain strip only when the value came from another Unit, the
// "needs you" lines only when something waits or blocks, one line per guard, then the on-demand
// links. Each fact once; meanings in tooltips.
// Layout and tokens are the approved spike's (951538b, FieldDetails.tsx).
import { Fragment, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';

import { FieldGuards } from './FieldGuards';
import { FieldMore, type FieldMoreProps } from './FieldMore';
import { FieldNeeds } from './FieldNeeds';
import { FieldRefLink } from './FieldRefLink';
import { FieldSetByLine } from './FieldSetByLine';
import { ToneIcon } from './ToneIcon';
import type { FieldView } from './fieldDiagnosis.types';
import { editControl } from './fieldDetailsControls';
import { type FieldActions, FieldPathContext } from './fieldLinks';

const MONO = 'var(--font-mono)';

/** A value longer than this draws at the smaller hero size (D14). */
const LONG_VALUE = 28;

export interface FieldDetailsProps extends Pick<FieldMoreProps, 'history' | 'onOpenHistory' | 'variants' | 'onOpenVariants'> {
  view: FieldView;
  actions: FieldActions;
  onClose?: () => void;
  /** The incoming upgrade of this field is staged in the pane (D9). */
  upgradeStaged?: boolean;
}

export function FieldDetails({ view, actions, onClose, upgradeStaged, ...more }: FieldDetailsProps) {
  const long = view.value.length > LONG_VALUE;
  const fieldPathValue = useMemo(() => ({ path: view.path, resourceName: view.resourceName }), [view.path, view.resourceName]);
  const edit = editControl(view, Boolean(actions.edit));

  return (
    <FieldPathContext.Provider value={fieldPathValue}>
    <Box
      data-testid="fd-details"
      sx={{
        px: 2,
        py: 1.5,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderBottom: 1,
        borderColor: 'divider',
        opacity: view.stale ? 0.6 : 1,
        transition: 'opacity .12s',
      }}
    >
      {/* Path label */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Typography data-testid="fd-path" sx={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11.5, color: 'text.disabled', wordBreak: 'break-all' }}>
          {view.path}
        </Typography>
        {onClose && (
          <IconButton size="small" aria-label="Close" onClick={onClose} data-testid="fd-close" sx={{ mt: '-4px', mr: '-6px' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>

      {/* Value (hero) + Edit */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: '2px' }}>
        <Typography
          data-testid="fd-value"
          sx={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: long ? 17 : 22, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-all' }}
        >
          {view.value}
        </Typography>
        {edit.shown && (
          <Tooltip title={edit.reason ?? ''}>
            <span>
              <Button size="small" variant="text" disabled={edit.disabled} onClick={actions.edit} data-testid="fd-edit">
                Edit
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {view.pending !== undefined && (
        <Box data-testid="fd-pending" sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '2px' }}>
          <ToneIcon tone="pending" />
          <Tooltip title="Your edit in this pane. It is not saved yet; it applies on the next promote.">
            <Typography variant="body2" sx={{ color: 'secondary.main', minWidth: 0, wordBreak: 'break-all' }}>
              Unsaved:{' '}
              <Box component="span" sx={{ fontFamily: MONO, fontWeight: 600 }}>
                {view.pending}
              </Box>
            </Typography>
          </Tooltip>
          {actions.discard && (
            <Button size="small" variant="text" sx={{ ml: 'auto' }} onClick={actions.discard} data-testid="fd-discard">
              Discard
            </Button>
          )}
        </Box>
      )}

      {view.setBy && (
        <Box sx={{ mt: '4px' }}>
          <FieldSetByLine setBy={view.setBy} />
        </Box>
      )}

      {view.chain && (
        <Typography data-testid="fd-chain" variant="body2" color="text.secondary" sx={{ mt: '2px', wordBreak: 'break-word' }}>
          {view.chain.map((hop, i) => (
            <Fragment key={`${hop.label}-${i}`}>
              {i > 0 && (
                <Box component="span" sx={{ color: 'text.disabled', mx: '6px' }}>
                  →
                </Box>
              )}
              {hop.ref ? (
                <FieldRefLink refValue={hop.ref} testId={`fd-hop-${i}`} />
              ) : (
                <Box component="span" sx={hop.this ? { color: 'text.primary' } : undefined}>
                  {hop.label}
                </Box>
              )}
            </Fragment>
          ))}
        </Typography>
      )}

      <FieldNeeds view={view} actions={actions} upgradeStaged={upgradeStaged} />
      <FieldGuards view={view} actions={actions} />

      <Divider sx={{ mt: 1.5, mb: 1 }} />
      <FieldMore view={view} actions={actions} {...more} />
    </Box>
    </FieldPathContext.Provider>
  );
}
