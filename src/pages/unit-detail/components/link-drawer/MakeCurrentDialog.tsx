// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Make current, as `cub link update --make-current` does it: the Link's two merged-revision
// pointers are set to its Units' head revisions, declaring it caught up without merging anything.
import { useState } from 'react';

import { getApiErrorMessage } from '@/utility/error-functions';
import { type Link, useGetUnitQuery, usePatchLinkMutation } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ListTable } from './LinkTables';

export interface MakeCurrentDialogProps {
  link: Link;
  fromName: string;
  toName: string;
  onClose: () => void;
  /** After the Link was written; the dialog closes itself. */
  onDone: () => void;
}

export const MakeCurrentDialog = ({ link, fromName, toName, onClose, onDone }: MakeCurrentDialogProps) => {
  // The heads are read when the dialog opens rather than taken from the Links list, which can be
  // behind them.
  const fromQuery = useGetUnitQuery(
    { spaceId: link.SpaceID ?? '', unitId: link.FromUnitID ?? '' },
    { refetchOnMountOrArgChange: true },
  );
  const toQuery = useGetUnitQuery(
    { spaceId: link.ToSpaceID ?? '', unitId: link.ToUnitID ?? '' },
    { refetchOnMountOrArgChange: true },
  );
  const [patchLink, { isLoading: isSaving }] = usePatchLinkMutation();
  const [error, setError] = useState('');

  const loading = fromQuery.isFetching || toQuery.isFetching;
  const readError = fromQuery.error ?? toQuery.error;
  const upstreamHead = toQuery.data?.Unit?.HeadRevisionNum;
  const downstreamHead = fromQuery.data?.Unit?.HeadRevisionNum;
  const upstreamNow = link.UpstreamLastMergedRevisionNum ?? 0;
  const downstreamNow = link.DownstreamLastMergedRevisionNum ?? 0;
  const ready = !loading && !readError && upstreamHead !== undefined && downstreamHead !== undefined;
  const alreadyCurrent = ready && upstreamHead === upstreamNow && downstreamHead === downstreamNow;
  const skipsUpstream = ready && (upstreamHead ?? 0) > upstreamNow;

  const confirm = async () => {
    setError('');
    try {
      await patchLink({
        spaceId: link.SpaceID ?? '',
        linkId: link.LinkID ?? '',
        // @ts-expect-error https://stackoverflow.com/questions/68283492/rtk-query-merge-patchjson-content-type-ruins-request-body
        body: JSON.stringify({
          UpstreamLastMergedRevisionNum: upstreamHead,
          DownstreamLastMergedRevisionNum: downstreamHead,
          Version: link.Version,
        }),
      }).unwrap();
      onDone();
      onClose();
    } catch (e) {
      setError(`The Link was not made current. ${getApiErrorMessage(e, '')}`);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth data-testid='link-make-current-dialog'>
      <DialogTitle>Make {link.Slug} current</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant='body2'>
            Sets the Link&apos;s last merged revisions to the head revisions of its Units, declaring it caught up
            without merging anything. Use it when a merged revision names a revision that no longer exists, which
            fails every write to the Link, or to have the Link skip upstream changes.
          </Typography>
          {loading && <CircularProgress size={20} />}
          {readError !== undefined && (
            <Alert severity='error'>{`The Units' head revisions could not be read. ${getApiErrorMessage(readError, '')}`}</Alert>
          )}
          {ready && (
            <ListTable
              columns={['', 'Now', 'Made current']}
              rows={[
                [`Upstream last merged revision (${toName})`, String(upstreamNow), String(upstreamHead)],
                [`Downstream last merged revision (${fromName})`, String(downstreamNow), String(downstreamHead)],
              ]}
              testId='link-make-current-revisions'
            />
          )}
          {alreadyCurrent && <Alert severity='info'>The Link is already current.</Alert>}
          {skipsUpstream && (
            <Alert severity='warning' data-testid='link-make-current-skips'>
              {`${
                upstreamNow > 0 ? `The changes to ${toName} after revision ${upstreamNow}` : `The changes to ${toName} so far`
              } are not merged into ${fromName}, and later merges treat them as already taken.`}
            </Alert>
          )}
          {error && <Alert severity='error'>{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant='outlined'>
          Cancel
        </Button>
        <Button
          onClick={confirm}
          variant='contained'
          disabled={!ready || alreadyCurrent || isSaving}
          data-testid='link-make-current-confirm'
        >
          Make current
        </Button>
      </DialogActions>
    </Dialog>
  );
};
