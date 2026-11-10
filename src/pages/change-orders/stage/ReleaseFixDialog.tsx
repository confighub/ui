// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * "Release the fix": the offer on the release line, and the confirm it opens.
 *
 * The confirm states what the release adopts before anything moves: each Unit's diff from
 * the Revision the release Tag marks to the head, who saved the head, that the edit was
 * made outside the ChangeOrder, and that an approval of the old Revision may not count for
 * the new one. It stays open with what went wrong when either step fails.
 *
 * The confirm is drawn by the stage card, not by the release line: the line gives way to
 * "Releasing…" while the release runs, and the confirm has to outlive it.
 */

import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import { ConfigDiffView } from '@/components/config-diff/ConfigDiffView';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useGetUnitDiffQuery, useListExtendedRevisionsQuery } from '@confighub/rtk-query';

import { fullTime } from '../changeOrderHistory';
import { changeOrderBorder, changeOrderFontSans, changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { reviewPromoteButtonSx, reviewQuietButtonSx } from '../reviews/reviewButtons';
import { releaseFixCopy, unitName } from './releaseFixCopy';
import type { FixUnit, ReleaseFix } from './stageFix';
import { LogSub } from './StageLogLine';
import type { ReleaseFixControl } from './useReleaseFix';

const copy = releaseFixCopy;

/**
 * The note and button that offer the fix: next to the problem line it answers (`problem`),
 * which says what a release would publish, or on the release line (`release`).
 */
export function ReleaseFixOffer({
  offer,
  place,
  nameOfSpace,
  onOpen,
}: {
  offer: ReleaseFix;
  place: 'problem' | 'release';
  nameOfSpace: (spaceId: string) => string;
  onOpen: () => void;
}) {
  const named = (reason: 'gate' | 'problem') =>
    offer.spaces.flatMap((space) =>
      space.units
        .filter((u) => u.reason === reason)
        .map((u) => ({ name: unitName(nameOfSpace(space.spaceId), u.slug), from: u.fromRevisionNum, to: u.toRevisionNum })),
    );
  const problemUnits = named('problem');
  const gateUnits = named('gate');
  const text = [problemUnits.length > 0 ? copy.offerProblem(problemUnits) : '', gateUnits.length > 0 ? copy.offerGate(gateUnits) : '']
    .filter((t) => t !== '')
    .join(' ');
  return (
    <LogSub testId={place === 'problem' ? 'release-fix-offer-problem' : 'release-fix-offer'}>
      {text}{' '}
      <Button
        size="small"
        variant="outlined"
        onClick={onOpen}
        data-testid="act-release-fix"
        sx={{ ...reviewQuietButtonSx, ml: '4px', py: 0, minHeight: 0, fontSize: 'inherit' }}
      >
        {copy.action}
      </Button>
    </LogSub>
  );
}

/** One Unit of the fix: its Revisions, who saved the head, and what the head changes. */
function FixUnitDetails({ spaceId, spaceName, unit }: { spaceId: string; spaceName: string; unit: FixUnit }) {
  const diff = useGetUnitDiffQuery({ spaceId, unitId: unit.unitId, from: String(unit.fromRevisionNum), to: String(unit.toRevisionNum) });
  const head = useListExtendedRevisionsQuery({ spaceId, unitId: unit.unitId, where: `RevisionNum = ${unit.toRevisionNum}`, include: 'UserID' });
  const entry = head.currentData?.[0];
  const who = entry?.User?.DisplayName || entry?.User?.Username || undefined;
  const createdAt = entry?.Revision?.CreatedAt === undefined ? undefined : Date.parse(entry.Revision.CreatedAt);
  const saved = copy.savedBy(who, createdAt === undefined || Number.isNaN(createdAt) ? undefined : fullTime(createdAt));
  const resources = diff.currentData?.Diff?.Resources ?? [];
  return (
    <Box component="section" data-testid="release-fix-unit" data-unit-id={unit.unitId} sx={{ mt: '14px' }}>
      <Box component="h3" sx={{ m: 0, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.strong }}>
        {copy.unit(unitName(spaceName, unit.slug), unit.fromRevisionNum, unit.toRevisionNum)}
      </Box>
      {saved !== undefined ? (
        <Box component="p" data-testid="release-fix-saved-by" sx={{ m: '4px 0 0', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
          {saved}
          {entry?.Revision?.Description ? ` ${entry.Revision.Description}` : ''}
        </Box>
      ) : null}
      <Box sx={{ mt: '8px', border: `1px solid ${changeOrderBorder.default}`, borderRadius: '6px', overflow: 'auto', maxHeight: '320px' }}>
        {diff.currentData !== undefined ? (
          resources.length > 0 ? (
            <ConfigDiffView diff={diff.currentData.Diff ?? {}} />
          ) : (
            <Box sx={{ p: '8px 10px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>{copy.noDiff}</Box>
          )
        ) : diff.error !== undefined ? (
          <Alert severity="error" data-testid="release-fix-diff-error">
            {getApiErrorMessage(diff.error, copy.diffFailed)}
          </Alert>
        ) : (
          <Box sx={{ p: '8px 10px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>{copy.diffLoading}</Box>
        )}
      </Box>
    </Box>
  );
}

/** The Units whose diff is drawn at first; a fix of 50 Units would otherwise read 50 diffs. */
const UNIT_BLOCKS_SHOWN = 3;

export function ReleaseFixDialog({ fix, stageName, nameOfSpace }: { fix: ReleaseFixControl; stageName: string; nameOfSpace: (spaceId: string) => string }) {
  const shown = fix.shown;
  const units = useMemo(() => (shown?.spaces ?? []).flatMap((space) => space.units.map((unit) => ({ spaceId: space.spaceId, unit }))), [shown]);
  const unitCount = units.length;
  const [allUnits, setAllUnits] = useState(false);
  // Each block is a Unit's diff, so "more" shows the rest in place; a name-only list would open the shared Space list.
  return (
    <Dialog
      open={shown !== undefined}
      onClose={fix.working ? undefined : fix.close}
      aria-labelledby="release-fix-title"
      data-testid="release-fix-confirm"
      // The offer it was opened from is gone once the fix is released: focus goes to the stage heading instead.
      disableRestoreFocus
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { fontFamily: changeOrderFontSans, color: changeOrderInk.default, margin: '16px', width: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle id="release-fix-title" sx={{ fontFamily: 'inherit', fontSize: changeOrderType.size.lead, fontWeight: changeOrderType.weight.strong }}>
        {copy.title(stageName)}
      </DialogTitle>
      <DialogContent sx={{ fontFamily: 'inherit' }}>
        <Box component="p" data-testid="release-fix-outside" sx={{ m: '0 0 6px', fontSize: changeOrderType.size.body, lineHeight: 1.5 }}>
          {copy.outside(unitCount)}
        </Box>
        <Alert severity="warning" data-testid="release-fix-approval" sx={{ fontSize: changeOrderType.size.body }}>
          {copy.approval(unitCount)}
        </Alert>
        {(allUnits ? units : units.slice(0, UNIT_BLOCKS_SHOWN)).map(({ spaceId, unit }) => (
          <FixUnitDetails key={`${spaceId}/${unit.unitId}`} spaceId={spaceId} spaceName={nameOfSpace(spaceId)} unit={unit} />
        ))}
        {allUnits || units.length <= UNIT_BLOCKS_SHOWN ? null : (
          // Each block reads a diff, so the rest are read only when the person asks for them.
          <Button size="small" onClick={() => setAllUnits(true)} aria-label={copy.showAllUnits(units.length)} data-testid="release-fix-more" sx={{ mt: '14px', ...reviewQuietButtonSx }}>
            {copy.moreUnits(units.length - UNIT_BLOCKS_SHOWN)}
          </Button>
        )}
        {fix.stale ? (
          <Alert
            severity="info"
            data-testid="release-fix-stale"
            sx={{ mt: '14px' }}
            action={
              <Button size="small" onClick={fix.reviewAgain} sx={reviewQuietButtonSx}>
                {copy.reviewAgain}
              </Button>
            }
          >
            {copy.stale}
          </Alert>
        ) : null}
        {fix.outcome?.released !== undefined ? (
          <Alert severity="success" data-testid="release-fix-released" sx={{ mt: '14px' }}>
            {fix.outcome.released}
          </Alert>
        ) : null}
        {fix.outcome !== undefined ? (
          <Alert severity="error" data-testid="release-fix-error" sx={{ mt: '14px' }}>
            {fix.outcome.failed.map((line) => (
              <Box key={line} component="span" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                {line}
              </Box>
            ))}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ gap: '8px' }}>
        <Button variant="outlined" onClick={fix.close} disabled={fix.working} sx={reviewQuietButtonSx}>
          {fix.outcome === undefined ? copy.cancel : copy.close}
        </Button>
        {fix.outcome === undefined ? (
          <Button
            variant="contained"
            disableElevation
            onClick={() => void fix.confirm()}
            disabled={fix.working || fix.stale}
            data-testid="release-fix-submit"
            startIcon={fix.working ? <CircularProgress size={12} color="inherit" /> : undefined}
            sx={reviewPromoteButtonSx}
          >
            {fix.working ? copy.working : copy.confirm}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
