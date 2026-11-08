// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { guardedChanges, withheldSummary } from '@/components/guarded-write/guardedWrite';
import { useGuardedWrite } from '@/components/guarded-write/useGuardedWrite';
import { chunkInClause } from '@/hooks/inClauseChunks';
import { useAppDispatch } from '@/hooks/useApp';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { setAlert } from '@/state/slices/alert';
import { IUnitMutationModalProps } from '@/types';
import { unitHasGuards } from '@/utility/clearance-functions';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type UnitCreateOrUpdateResponseRead,
  useBulkPatchUnitsMutation,
  useLazyListAllUnitsQuery,
} from '@confighub/rtk-query';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export const BulkUpgradeModal = ({
  onClose,
  unitsToEdit = [],
  isOpen = false,
  refresh,
}: IUnitMutationModalProps) => {
  const [errorMessage, setErrorMessage] = useState<string[]>([]);
  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();
  // A dry run of its own, so a failed one is not reported as a failed upgrade.
  const [previewBulkPatchUnits] = useBulkPatchUnitsMutation();
  const [listUnits] = useLazyListAllUnitsQuery();
  const guardedUpgrade = useGuardedWrite('Upgrade');
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setErrorMessage([]);
    onClose();
  };

  useBulkApiErrorMessage(error, isSuccess, data, setErrorMessage, {
    onSuccess: () => {
      refresh?.();
      handleClose();
    },
  });

  const handleUpgrade = async () => {
    setIsSubmitting(true);
    let dryRunFailed = false;
    try {
      const unitIds = unitsToEdit
        .map((unit) => unit.UnitID)
        .filter((id): id is string => !!id);
      const where = `UnitID IN (${unitIds.map((id) => `'${id}'`).join(',')})`;
      const upgrade = (
        whereClause: string,
        options: { dryRun: boolean; clearance?: string },
      ) =>
        (options.dryRun ? previewBulkPatchUnits : bulkPatchUnits)({
          upgrade: true,
          where: whereClause,
          dryRun: options.dryRun || undefined,
          clearance: options.clearance,
          // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
          body: JSON.stringify({}),
        }).unwrap();

      // Which of the Units have guards, each named with its Space: only those are run as a dry
      // run first, since a write to the others is never withheld by a guard.
      dryRunFailed = true;
      const selected = (
        await Promise.all(
          chunkInClause('UnitID', unitIds).map((ids) =>
            listUnits({
              where: ids,
              include: 'SpaceID',
              select: 'UnitID,Slug,SpaceID,PathAnnotations',
            }).unwrap(),
          ),
        )
      ).flat();
      dryRunFailed = false;
      const labelByUnitId = new Map(
        selected.map((item) => [
          item.Unit?.UnitID ?? '',
          item.Space?.Slug ? `${item.Space.Slug}/${item.Unit?.Slug}` : (item.Unit?.Slug ?? ''),
        ]),
      );
      const guarded = selected
        .filter((item) => unitHasGuards(item.Unit?.PathAnnotations))
        .map((item) => item.Unit?.UnitID ?? '');
      const withheldIn = (items: UnitCreateOrUpdateResponseRead[]) =>
        items.flatMap((item) =>
          guardedChanges(
            item.Conflicts,
            labelByUnitId.get(item.Unit?.UnitID ?? '') ?? item.Unit?.Slug ?? '',
            item.Unit?.SpaceID && item.Unit?.UnitID
              ? { spaceId: item.Unit.SpaceID, unitId: item.Unit.UnitID }
              : undefined,
          ),
        );

      const result = await guardedUpgrade.start({
        guarded: guarded.length > 0,
        run: async ({ dryRun, clearance }) => {
          if (dryRun) {
            dryRunFailed = true;
            const pages = await Promise.all(
              chunkInClause('UnitID', guarded).map((ids) => upgrade(ids, { dryRun: true })),
            );
            dryRunFailed = false;
            return withheldIn(pages.flat());
          }
          return withheldIn(
            await upgrade(where, {
              dryRun: false,
              clearance: clearance ? JSON.stringify(clearance) : undefined,
            }),
          );
        },
      });
      // Upgraded without what guards withheld, which stays on each Unit as a conflict. The
      // modal closes on success, so the page's alert says so.
      if (result.status === 'written' && result.withheld.length > 0) {
        const withheldFrom = [...new Set(result.withheld.map((change) => change.unitLabel))];
        dispatch(
          setAlert({
            message: `Units upgraded. ${withheldSummary(result.withheld)} in ${withheldFrom.join(', ')}; apply them from the Blame tab of each.`,
            type: 'warning',
            isOpen: true,
          }),
        );
      }
    } catch (err) {
      // A failed upgrade is reported through useBulkApiErrorMessage; a failed dry run is not.
      if (dryRunFailed)
        setErrorMessage([getApiErrorMessage(err, 'Failed to check the guards')]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Stack direction='row' alignItems='center'>
          <Typography variant='h6' component='span' sx={{ fontWeight: 600 }}>
            Confirm Bulk Upgrade
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />

        <Stack spacing={2}>
          <Typography variant='body2' color='text.secondary'>
            This operation will synchronize the selected units to match their upstream units'
            latest configurations. Each unit will be updated to reflect the current state of
            its upstream source.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting} color='inherit'>
          Cancel
        </Button>
        <Button
          onClick={handleUpgrade}
          variant='contained'
          disabled={isSubmitting || unitsToEdit.length === 0}
        >
          {isSubmitting ? 'Upgrading...' : 'Upgrade'}
        </Button>
      </DialogActions>
      {guardedUpgrade.dialog}
    </Dialog>
  );
};
