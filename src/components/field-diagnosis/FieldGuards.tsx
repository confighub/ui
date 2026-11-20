// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// One line per guard: `Override  edits ✓  merges ✗  · inherited  Remove`. The meaning is in the
// key's tooltip.
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Sep } from './FieldSetByLine';
import type { FieldView } from './fieldDiagnosis.types';
import { type FieldActions, actionButtonProps } from './fieldLinks';

function Mark({ ok }: { ok: boolean }) {
  return (
    <Box component="span" sx={{ color: ok ? 'success.main' : 'text.disabled', fontWeight: 600, ml: '4px' }}>
      {ok ? '✓' : '✗'}
    </Box>
  );
}

export function FieldGuards({ view, actions }: { view: FieldView; actions: FieldActions }) {
  if (view.guards.length === 0) return null;
  return (
    <Box data-testid="fd-guards" sx={{ mt: 1.5 }}>
      {view.guards.map((guard) => {
        const remove = actions.removeGuard?.(guard);
        return (
        <Box key={guard.key} data-testid={`fd-guard-${guard.key}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 28 }}>
          <Tooltip title={guard.meaning}>
            <Typography variant="body2" sx={{ fontWeight: 600, width: 96, flexShrink: 0, color: 'text.primary' }}>
              {guard.key}
            </Typography>
          </Tooltip>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            edits
            <Mark ok={guard.edits} />
            <Box component="span" sx={{ ml: 2 }}>
              merges
            </Box>
            <Mark ok={guard.merges} />
            {guard.inherited && (
              <>
                <Sep />
                inherited
              </>
            )}
          </Typography>
          {remove && (
            <Tooltip title={remove.disabled ?? ''}>
              <span>
                <Button
                  size="small"
                  variant="text"
                  disabled={Boolean(remove.disabled)}
                  {...actionButtonProps(remove)}
                  data-testid={`fd-guard-remove-${guard.key}`}
                >
                  Remove
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
        );
      })}
    </Box>
  );
}
