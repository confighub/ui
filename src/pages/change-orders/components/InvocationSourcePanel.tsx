// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The source panel of an Invoke ChangeOrder (`InvocationSourceDetails`), with the clearance and
 * guards of the Invocation it runs, and a form to change them.
 *
 * Each promotion reads the Invocation afresh, so what is saved here takes effect in every stage
 * promoted after it. A Space the ChangeOrder has run in counts as done, whatever its guards
 * withheld, so editing is offered only while a Space in scope is still to be promoted; what a
 * guard withheld in a Space already promoted is applied from that Unit's Blame tab.
 *
 * Where the source's dry run says guards would withhold the change in a Space not yet promoted,
 * the panel names them and offers the clearance covering them, as the Link drawer offers the
 * clearance covering its own guards.
 */
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ClearanceFieldSection } from '@/components/clearance-field/ClearanceFieldSection';
import { type ClearanceRow, clearanceToRows, rowsToClearance } from '@/components/clearance-field/clearanceRows';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { type MapRow, mapToRows, rowsToMap } from '@/components/map-field-editor/map-rows';
import { clearanceCovering, guardText, guardsNotCleared } from '@/utility/clearance-functions';
import { getApiErrorMessage } from '@/utility/error-functions';
import { type InvocationRead, type WithheldGuard, useUpdateInvocationMutation } from '@confighub/rtk-query';

import type { InvocationSource } from '../../x/apps/change-order/useInvocationSource';
import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { guardStampTexts, requirementText } from '../invocationClearance';
import { InvocationSourceDetails, InvocationSourceRow } from './InvocationSourceDetails';

interface ClearanceForm {
  Guards: MapRow[];
  Clearance: ClearanceRow[];
}

const mono = { fontFamily: changeOrderFontMono } as const;

function Listed({ texts }: { texts: string[] }) {
  if (texts.length === 0) return <Box component="span" sx={{ color: changeOrderInk.muted }}>None</Box>;
  return (
    <>
      {texts.map((text) => (
        <Box key={text} sx={mono}>
          {text}
        </Box>
      ))}
    </>
  );
}

export interface InvocationSourcePanelProps {
  source: InvocationSource;
  /** The Invocation as stored; `undefined` until it is read. */
  invocation: InvocationRead | undefined;
  /** A change to the Invocation can still take effect: a Space in scope is still to be promoted. */
  editable: boolean;
  /** Guards that would withhold the change in a Space not yet promoted, which the Invocation is not cleared for. */
  withheld: readonly WithheldGuard[];
}

export function InvocationSourcePanel({ source, invocation, editable, withheld }: InvocationSourcePanelProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [updateInvocation, { isLoading: saving }] = useUpdateInvocationMutation();
  const { control, handleSubmit, reset, getValues, setValue } = useForm<ClearanceForm>({ defaultValues: { Guards: [], Clearance: [] } });
  const guards = useWatch({ control, name: 'Guards' });
  const clearance = useWatch({ control, name: 'Clearance' });
  const notCleared = editing ? guardsNotCleared(rowsToMap(guards), rowsToClearance(clearance)) : [];

  const startEditing = (adding: readonly WithheldGuard[] = []) => {
    if (invocation === undefined) return;
    setError(undefined);
    reset({
      Guards: mapToRows(invocation.Guards),
      Clearance: [...clearanceToRows(invocation.Clearance), ...clearanceToRows(clearanceCovering(adding))],
    });
    setEditing(true);
  };

  const clearForGuards = () => {
    const forbidden = new Set(notCleared.filter((g) => g.Precondition).map((g) => g.Key));
    const kept = getValues('Clearance').filter((row) => !(row.Operator === 'DoesNotExist' && forbidden.has(row.Key.trim())));
    setValue('Clearance', [...kept, ...clearanceToRows(clearanceCovering(notCleared))], { shouldDirty: true });
  };

  // The server decides whether the clearance covers the guards, and its refusal names the clearance to add.
  const save = async (values: ClearanceForm) => {
    if (invocation?.SpaceID === undefined || invocation.InvocationID === undefined) return;
    const nextClearance = rowsToClearance(values.Clearance);
    const nextGuards = rowsToMap(values.Guards);
    setError(undefined);
    try {
      await updateInvocation({
        spaceId: invocation.SpaceID,
        invocationId: invocation.InvocationID,
        invocation: {
          ...invocation,
          Clearance: nextClearance.length > 0 ? nextClearance : undefined,
          Guards: Object.keys(nextGuards).length > 0 ? nextGuards : undefined,
        },
      }).unwrap();
      setEditing(false);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  const rows =
    invocation === undefined ? null : (
      <>
        <InvocationSourceRow term="Clearance">
          <Box data-testid="change-order-invocation-clearance">
            <Listed texts={(invocation.Clearance ?? []).map(requirementText)} />
          </Box>
        </InvocationSourceRow>
        <InvocationSourceRow term="Guards">
          <Box data-testid="change-order-invocation-guards">
            <Listed texts={guardStampTexts(invocation.Guards)} />
          </Box>
        </InvocationSourceRow>
      </>
    );

  return (
    <Stack spacing="10px">
      <InvocationSourceDetails source={source} extraRows={rows} />
      {editable && invocation !== undefined && withheld.length > 0 && !editing ? (
        <Box
          role="alert"
          data-testid="change-order-invocation-withheld"
          sx={{
            padding: '10px 12px',
            borderRadius: `${changeOrderShape.radius.md}px`,
            border: `1px solid ${changeOrderStatus.warn}`,
            fontSize: changeOrderType.size.body,
            color: changeOrderInk.default,
          }}
        >
          {withheld.length === 1 ? 'Guard ' : 'Guards '}
          <Box component="span" sx={{ ...mono, fontWeight: 600 }}>
            {withheld.map(guardText).join(', ')}
          </Box>
          {` would withhold this change in Spaces not yet promoted.`}
          <Box sx={{ mt: '6px' }}>
            <Button size="small" variant="outlined" onClick={() => startEditing(withheld)}>
              Clear the Invocation for {withheld.length === 1 ? 'it' : 'them'}
            </Button>
          </Box>
        </Box>
      ) : null}
      {editable && invocation !== undefined && !editing ? (
        <Box>
          <Button size="small" onClick={() => startEditing()}>
            Edit clearance and guards
          </Button>
        </Box>
      ) : null}
      {editing && invocation !== undefined ? (
        <Box
          component="form"
          aria-label="Invocation clearance and guards"
          onSubmit={(e) => void handleSubmit(save)(e)}
          sx={{
            padding: '12px',
            borderRadius: `${changeOrderShape.radius.md}px`,
            border: `1px solid ${changeOrderBorder.default}`,
            background: changeOrderSurface.card,
          }}
        >
          <Stack spacing={2}>
            <MapFieldSection
              control={control}
              name="Guards"
              title="Guards"
              description="Reasons to record on the paths this Invocation writes, so a later change has to be cleared for them before overwriting."
              itemLabel="guard"
              validation="label"
              keyPlaceholder="Scale"
              valuePlaceholder="RegionSpecific"
              disabled={saving}
              testId="invocation-guards"
            />
            <ClearanceFieldSection
              control={control}
              name="Clearance"
              description="The guards this Invocation may write over. A path whose guards it is not cleared for is left as it is, and the change is recorded as a conflict."
              disabled={saving}
              testId="invocation-clearance"
            />
            {notCleared.length > 0 ? (
              <Box role="alert" sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 1, p: 1.5 }} data-testid="invocation-guards-not-cleared">
                <Typography variant="body2">
                  The Invocation records guards its clearance does not cover: {notCleared.map(guardText).join(', ')}. Its own next run would be withheld
                  by them, so the server refuses to save it this way.
                </Typography>
                <Button size="small" onClick={clearForGuards} sx={{ mt: 1 }}>
                  Clear the Invocation for its guards
                </Button>
              </Box>
            ) : null}
            <Typography variant="body2" color="text.secondary">
              Stages promoted after you save run with these. So does every Trigger and ChangeOrder that runs {invocation.Slug}.
            </Typography>
            {error !== undefined ? (
              <Alert severity="error" data-testid="invocation-clearance-error">
                {error}
              </Alert>
            ) : null}
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" size="small" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="small" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
