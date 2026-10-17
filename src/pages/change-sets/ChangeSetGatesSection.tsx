// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The close gates of a ChangeSet a ChangeWorkflow governs: which workflow, each
 * prerequisite of its Final and where it does not hold, and, once closed, whether
 * the close was forced past them. And the dialog that forces one, which records why.
 *
 * The gate rows are the ChangeOrder page's (`ChangeOrderGateList`), so a gate reads
 * the same wherever one is shown.
 */

import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

import { useListAllChangeWorkflowsQuery, type ChangeSetRead } from '@confighub/rtk-query';

import { changeOrderFontMono, changeOrderInk, changeOrderStatus, changeOrderType } from '../change-orders/changeOrdersTokens';
import type { ReviewPerson } from '../change-orders/reviews/changeOrderReviewTypes';
import { ChangeOrderGateList, type ChangeOrderGateExtra } from '../x/apps/change-order/ChangeOrderGateList';
import { closeGateRows, type ChangeSetCloseGates, type CloseGate } from './changeSetCloseGates';

/** The gate list's key for the close gates: there is one set, not one per stage. */
const CLOSE_STAGE_ID = 'close';

/** Matches the server's bound on the reason a ChangeOrder or ChangeSet records for an override. */
export const FORCE_REASON_MAX = 1024;

/** The workflow's slug, for naming and linking it. */
function useChangeWorkflowSlug(changeWorkflowId: string | undefined): string | undefined {
  const read = useListAllChangeWorkflowsQuery(
    { where: `ChangeWorkflowID = '${changeWorkflowId ?? ''}'`, select: 'ChangeWorkflowID,Slug,SpaceID', include: 'SpaceID' },
    { skip: changeWorkflowId === undefined },
  );
  const entry = read.data?.[0];
  if (entry?.ChangeWorkflow === undefined) return undefined;
  return entry.Space?.Slug ? `${entry.Space.Slug}/${entry.ChangeWorkflow.Slug}` : entry.ChangeWorkflow.Slug;
}

function FailureList({ gate }: { gate: CloseGate }) {
  return (
    <Box component="ul" sx={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
      {gate.failures.map((failure) => (
        <li key={`${failure.spaceSlug}/${gate.prerequisite}`} data-testid={`change-set-gate-failure-${gate.prerequisite}-${failure.spaceSlug}`}>
          {failure.message}
        </li>
      ))}
    </Box>
  );
}

function GateRows({ gates, spaceCount }: { gates: readonly CloseGate[]; spaceCount: number }) {
  const rows = useMemo(() => closeGateRows(gates, spaceCount), [gates, spaceCount]);
  const extras = useMemo(() => {
    const byId: Record<string, ChangeOrderGateExtra> = {};
    for (const gate of gates) if (gate.failures.length > 0) byId[gate.prerequisite] = { below: <FailureList gate={gate} /> };
    return byId;
  }, [gates]);
  if (rows.length === 0) {
    return <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>Its ChangeWorkflow names no close gates, so closing it is not held.</Box>;
  }
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <ChangeOrderGateList stageId={CLOSE_STAGE_ID} gates={rows} isSource={false} extras={extras} />
    </Box>
  );
}

function ForcedClose({ changeSet, closedBy }: { changeSet: ChangeSetRead; closedBy?: ReviewPerson }) {
  const override = changeSet.CloseOverride;
  if (override === undefined) {
    return (
      <Box data-testid="change-set-gates-closed" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
        It closed with every gate holding.
      </Box>
    );
  }
  const when = override.OverriddenAt ? new Date(override.OverriddenAt).toLocaleString() : undefined;
  const failed = override.FailedGates ?? [];
  return (
    <Box data-testid="change-set-close-override" sx={{ fontSize: changeOrderType.size.body }}>
      <Box sx={{ color: changeOrderStatus.warn, fontWeight: changeOrderType.weight.semibold }}>
        Closed past {failed.length === 1 ? 'a gate' : `${failed.length} gates`} that did not hold, by {closedBy?.name ?? override.UserID}
        {when ? ` on ${when}` : ''}.
      </Box>
      <Box data-testid="change-set-close-override-reason" sx={{ marginTop: '4px', color: changeOrderInk.default, overflowWrap: 'anywhere' }}>
        Reason: {override.Reason}
      </Box>
      {failed.length > 0 ? (
        <Box component="ul" sx={{ margin: '6px 0 0', paddingLeft: '18px', color: changeOrderInk.muted, fontSize: changeOrderType.size.small }}>
          {failed.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** The body of the Close gates section, for a ChangeSet a ChangeWorkflow governs. */
export function ChangeSetGatesSection({
  changeSet,
  open,
  gates,
  closedBy,
}: {
  changeSet: ChangeSetRead;
  open: boolean;
  gates: ChangeSetCloseGates;
  closedBy?: ReviewPerson;
}) {
  const workflowId = changeSet.ChangeWorkflowID;
  const workflowSlug = useChangeWorkflowSlug(workflowId);
  return (
    <Box data-testid="change-set-gates">
      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '10px' }}>
        Closing it is gated by ChangeWorkflow{' '}
        <Box
          component={RouterLink}
          to={`/x/workflow-builder/${workflowId ?? ''}`}
          data-testid="change-set-gates-workflow"
          sx={{ fontFamily: changeOrderFontMono, color: changeOrderStatus.accent }}
        >
          {workflowSlug ?? workflowId}
        </Box>
        : every prerequisite of its Final, in every Space the ChangeSet was opened in.
      </Box>
      <GatesBody changeSet={changeSet} open={open} gates={gates} closedBy={closedBy} />
    </Box>
  );
}

function GatesBody({ changeSet, open, gates, closedBy }: { changeSet: ChangeSetRead; open: boolean; gates: ChangeSetCloseGates; closedBy?: ReviewPerson }) {
  if (!open) return <ForcedClose changeSet={changeSet} closedBy={closedBy} />;
  if (gates.status === 'loading' || gates.status === 'ungoverned') {
    return <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>Checking the gates…</Box>;
  }
  if (gates.status === 'unknown') {
    return (
      <Box data-testid="change-set-gates-unknown" sx={{ fontSize: changeOrderType.size.body, color: changeOrderStatus.warn }}>
        {gates.message}
      </Box>
    );
  }
  return <GateRows gates={gates.gates} spaceCount={gates.spaceCount} />;
}

interface ForceCloseValues {
  reason: string;
}

/** Closes the ChangeSet although some gates do not hold, recording why on it. */
export function ForceCloseChangeSetDialog({
  slug,
  gates,
  error,
  closing,
  onCancel,
  onConfirm,
}: {
  slug: string;
  gates: readonly CloseGate[];
  error?: string;
  closing: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { control, handleSubmit, formState } = useForm<ForceCloseValues>({ defaultValues: { reason: '' }, shouldFocusError: true });
  const failing = gates.filter((gate) => gate.failures.length > 0);
  const reasonError = formState.errors.reason?.message;
  return (
    <Dialog open onClose={closing ? undefined : onCancel} maxWidth="sm" fullWidth data-testid="change-set-force-close-dialog">
      <Box component="form" noValidate onSubmit={handleSubmit((values) => onConfirm(values.reason.trim()))}>
        <DialogTitle sx={{ fontSize: 16 }}>Force ChangeSet {slug} closed?</DialogTitle>
        <DialogContent>
          <Box sx={{ fontSize: changeOrderType.size.prose, marginBottom: '8px' }}>
            {failing.length === 1 ? 'A gate of its ChangeWorkflow does not hold' : `${failing.length} gates of its ChangeWorkflow do not hold`}. Closing it anyway
            records who did, when, why, and which gates did not hold on the ChangeSet. It needs Edit permission on the ChangeSet.
          </Box>
          <Box component="ul" sx={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
            {failing.map((gate) =>
              gate.failures.map((failure) => <li key={`${failure.spaceSlug}/${gate.prerequisite}`}>{failure.message}</li>),
            )}
          </Box>
          <Controller
            name="reason"
            control={control}
            rules={{
              validate: (value) => value.trim() !== '' || 'Say why the gates are overridden.',
              maxLength: { value: FORCE_REASON_MAX, message: `At most ${FORCE_REASON_MAX} characters.` },
            }}
            render={({ field: { ref, ...field } }) => (
              <TextField
                {...field}
                inputRef={ref}
                label="Reason"
                size="small"
                fullWidth
                autoFocus
                error={reasonError !== undefined}
                helperText={reasonError ?? 'Recorded on the ChangeSet with the gates that did not hold.'}
                slotProps={{ htmlInput: { maxLength: FORCE_REASON_MAX, 'data-testid': 'change-set-force-close-reason' } }}
              />
            )}
          />
          {error !== undefined ? (
            <Box role="alert" sx={{ marginTop: '10px', fontSize: changeOrderType.size.body, color: changeOrderStatus.danger }}>
              {error}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" onClick={onCancel} disabled={closing}>
            Cancel
          </Button>
          <Button size="small" variant="contained" color="error" type="submit" disabled={closing} data-testid="change-set-force-close-confirm">
            {closing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Force close'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
