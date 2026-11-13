// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a list console does to the rows checked in it: ask Users to review them all, and update
 * their labels and delete gates, as the other list pages update theirs.
 */

import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import { useListUsersQuery } from '@confighub/rtk-query';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { isBotUser } from '@/utility/bot-users';

import { reviewPersonOf } from '../../change-sets/changeSetReviewModel';
import { controlSx } from '../consoleStyle';
import { RequestReviewPicker } from '../stage/RequestReviewPicker';

/** The console's Request review and Update buttons, for the rows checked in it. */
export function ConsoleBulkButtons({
  count,
  plural,
  onRequestReview,
  onUpdate,
}: {
  /** How many rows are checked */
  count: number;
  /** The rows' entity, plural, as "ChangeSets" */
  plural: string;
  onRequestReview: () => void;
  onUpdate: () => void;
}) {
  const none = count === 0;
  const title = none ? `Check the ${plural} to act on` : undefined;
  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={onRequestReview}
        disabled={none}
        title={title}
        data-testid="console-bulk-request-review"
        sx={controlSx('quiet', !none)}
      >
        Request review
      </Box>
      <Box
        component="button"
        type="button"
        onClick={onUpdate}
        disabled={none}
        title={title ?? `Labels and delete gates of the ${count} checked`}
        data-testid="console-bulk-update"
        sx={controlSx('quiet', !none)}
      >
        Update
      </Box>
    </>
  );
}

/**
 * Picks the Users to ask, then asks them to review each checked row. `request` asks for one row
 * after another and answers with what it could not ask for, one line each, which the dialog shows
 * instead of closing.
 */
export function BulkRequestReviewDialog({
  open,
  count,
  plural,
  onClose,
  request,
  note,
}: {
  open: boolean;
  count: number;
  plural: string;
  onClose: () => void;
  request: (userIds: string[]) => Promise<string[]>;
  /** What else the dialog says, such as which rows the request skips */
  note?: string;
}) {
  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;
  const users = useListUsersQuery({}, { skip: !open });
  // Every person, as the ChangeSet page offers: a person can be asked to review a change they did
  // not write. Bots are left out, as they outnumber people and do not review.
  const candidates = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of users.data ?? []) {
      if (isBotUser(entry.User)) continue;
      const name = entry.User?.DisplayName || entry.User?.Username;
      if (entry.User?.UserID && name) names.set(entry.User.UserID, name);
    }
    return [...names.keys()]
      .map((userId) => reviewPersonOf(userId, names, viewerUserId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users.data, viewerUserId]);

  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const close = () => {
    if (submitting) return;
    setFailures([]);
    onClose();
  };
  const send = async (userIds: string[]) => {
    setSubmitting(true);
    setFailures([]);
    try {
      const failed = await request(userIds);
      if (failed.length === 0) onClose();
      else setFailures(failed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth data-testid="bulk-request-review-dialog">
      <DialogTitle>
        Request review of {count} {count === 1 ? plural.replace(/s$/, '') : plural}
      </DialogTitle>
      <DialogContent>
        {note ? <Alert severity="info" sx={{ mb: 1 }}>{note}</Alert> : null}
        {failures.length > 0 ? (
          <Alert severity="error" sx={{ mb: 1, whiteSpace: 'pre-line' }} data-testid="bulk-request-review-failures">
            {`Not every review could be requested:\n${failures.join('\n')}`}
          </Alert>
        ) : null}
        {users.isError ? (
          <Alert severity="error">The Users could not be read.</Alert>
        ) : users.data === undefined ? (
          <Box sx={{ py: 2 }}>Loading Users…</Box>
        ) : (
          <RequestReviewPicker candidates={candidates} submitting={submitting} onRequest={(ids) => void send(ids)} onCancel={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
