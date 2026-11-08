// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { useSearchGuardedFieldsChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { clearanceCovering } from '@/utility/clearance-functions';
import type { Clearance } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';

import {
  type GuardInheritance,
  type GuardedChange,
  type GuardedFieldState,
  fieldKey,
  guardGroups,
  guardInheritance,
} from './guardedWrite';

const monoSx = { fontFamily: 'monospace', fontSize: '0.8125rem' } as const;

/** A value as one line: the first line of it. */
const firstLine = (value: string | undefined) => (value ?? '').split('\n')[0];

/** What the change does to the path: from what it holds now, where that is known, to the new value. */
const changeLine = (change: GuardedChange, state: GuardedFieldState | undefined) => {
  if (change.guardChange) return ': its guards';
  const next = firstLine(change.value);
  if (!state) return next === '' ? '' : ` → ${next}`;
  const current = state.value === undefined ? '(not set)' : firstLine(state.value) || '""';
  return `: ${current} → ${next || '(removed)'}`;
};

const inheritanceText: Record<GuardInheritance, string> = {
  inherited: 'inherited',
  local: 'not inherited',
  mixed: 'inherited in some places',
  unknown: '',
};

/**
 * Asks before a write that guards would partly withhold. Each guard is acknowledged on its own,
 * and the write is cleared for exactly the guards acknowledged; a change under a guard that is
 * not acknowledged is withheld, as it would be with no clearance at all.
 */
export const GuardedChangesDialog = ({
  open,
  busy,
  action,
  changes,
  onCancel,
  onWithout,
  onWithClearance,
}: {
  open: boolean;
  busy: boolean;
  /** The verb of the write, as its button says it: Save, Run. */
  action: string;
  changes: GuardedChange[];
  onCancel: () => void;
  onWithout: () => void;
  onWithClearance: (clearance: Clearance) => void;
}) => {
  const groups = useMemo(() => guardGroups(changes), [changes]);
  // A change names its Unit only where the write reaches more than one.
  const severalUnits = new Set(changes.map((change) => change.unitLabel)).size > 1;
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!open) setAcknowledged(new Set());
  }, [open]);
  const acknowledgedGuards = groups
    .filter((group) => acknowledged.has(group.text))
    .map((group) => group.guard);

  // What each guarded path holds now and which of its guards are inherited, as each Unit records
  // them. Read once the dialog opens; the dialog asks without them if they cannot be read.
  const unitIds = useMemo(
    () => [...new Set(changes.flatMap((change) => (change.unit ? [change.unit.unitId] : [])))],
    [changes],
  );
  const fields = useSearchGuardedFieldsChunkedQuery(
    open && unitIds.length > 0 ? { unitIds } : skipToken,
  );
  const stateByField = useMemo(() => {
    const states = new Map<string, GuardedFieldState>();
    for (const blame of fields.data ?? []) {
      for (const field of blame.Fields ?? []) {
        states.set(
          `${blame.UnitID}\u0000${fieldKey(field.ResourceType ?? '', field.ResourceName ?? '', field.Path ?? '')}`,
          { value: field.Value, inheritedGuardKeys: new Set(field.InheritedGuards ?? []) },
        );
      }
    }
    return states;
  }, [fields.data]);
  const stateOf = (change: GuardedChange) =>
    change.unit
      ? stateByField.get(
          `${change.unit.unitId}\u0000${fieldKey(change.resourceType, change.resourceName, change.path)}`,
        )
      : undefined;

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth='md'>
      <DialogTitle>Guards withhold some of these changes</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>
          A guard records why a value is what it is. Confirm you understand why each guard is
          there to overwrite what it guards. What you do not confirm is not written.
        </Typography>
        {fields.isFetching && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mb: 1 }}
          >
            Reading the current values…
          </Typography>
        )}
        {fields.isError && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mb: 1 }}
          >
            Could not read the current values or which guards are inherited.
          </Typography>
        )}
        <Stack spacing={1.5} data-testid='guarded-changes'>
          {groups.map((group) => (
            <Box key={group.text}>
              <Stack direction='row' alignItems='center' spacing={1} data-testid='guard-row'>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={acknowledged.has(group.text)}
                      onChange={(e) =>
                        setAcknowledged((previous) => {
                          const next = new Set(previous);
                          if (e.target.checked) next.add(group.text);
                          else next.delete(group.text);
                          return next;
                        })
                      }
                    />
                  }
                  label={<Typography sx={monoSx}>{group.text}</Typography>}
                />
                {/* Beside the label rather than in it, so the checkbox is named by the guard. */}
                {inheritanceText[guardInheritance(group, stateOf)] && (
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    data-testid='guard-inheritance'
                  >
                    {inheritanceText[guardInheritance(group, stateOf)]}
                  </Typography>
                )}
              </Stack>
              <Stack sx={{ pl: 4 }}>
                {group.changes.map((change) => (
                  <Typography
                    key={[
                      change.unitLabel,
                      change.resourceType,
                      change.resourceName,
                      change.path,
                    ].join('\u0000')}
                    variant='body2'
                    color='text.secondary'
                    sx={{ ...monoSx, wordBreak: 'break-all' }}
                  >
                    {`${severalUnits ? `${change.unitLabel}  ` : ''}${change.resourceType} ${change.resourceName}  ${
                      change.path || '(whole resource)'
                    }${changeLine(change, stateOf(change))}`}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button disabled={busy} onClick={onWithout}>
          {action} without them
        </Button>
        <Button
          variant='contained'
          disabled={busy || acknowledgedGuards.length === 0}
          onClick={() => onWithClearance(clearanceCovering(acknowledgedGuards))}
        >
          {action} with clearance
        </Button>
      </DialogActions>
    </Dialog>
  );
};
