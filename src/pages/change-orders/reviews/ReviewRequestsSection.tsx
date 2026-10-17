// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The review requests of a change (`ChangeOrder.ReviewRequests` for one gate, or
 * `ChangeSet.ReviewRequests`): who was asked, by whom and when, whether they
 * reviewed, and — for a viewer who may edit the entity — "Request review from…"
 * and "Withdraw".
 *
 * A request is stored with a merge PATCH of the whole list (the caller sends
 * `Version`). When the server refuses that PATCH (403), the caller sets
 * `canRequest` to false and this section stops offering the actions: a viewer
 * is never shown a control that cannot work.
 */

import { useState } from 'react';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { reviewQuietButtonSx, reviewTextButtonSx } from './reviewButtons';
import { agoText, reviewCopy } from './reviewCopy';
import { Monogram, ReviewTag, SectionLabel } from './reviewParts';
import type { ReviewPerson, ReviewRequestOutcome, ReviewRequestView } from './changeOrderReviewTypes';

const copy = reviewCopy.requests;

interface ReviewRequestsSectionProps {
  requests: readonly Pick<ReviewRequestView, 'stage' | 'user' | 'requestedAt' | 'requestedBy' | 'reviewed'>[];
  /** Who may be asked. The people already asked, and the viewer, are left out here. */
  candidates: readonly ReviewPerson[];
  /** False once the server refused a request PATCH (403): no request actions. */
  canRequest: boolean;
  now: number;
  onRequest: (userIds: string[]) => Promise<ReviewRequestOutcome>;
  onWithdraw: (userId: string) => Promise<ReviewRequestOutcome>;
  /** A short message for the page's toast. */
  onNotice: (message: string) => void;
  /** The section's header is drawn by the panel (a collapsible section). */
  hideLabel?: boolean;
}

export function ReviewRequestsSection({
  requests,
  candidates,
  canRequest,
  now,
  onRequest,
  onWithdraw,
  onNotice,
  hideLabel = false,
}: ReviewRequestsSectionProps) {
  const [chosen, setChosen] = useState<ReviewPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const requested = new Set(requests.map((r) => r.user.userId));
  // Less the people already asked: the server refuses a duplicate request.
  const options = candidates.filter((p) => !requested.has(p.userId) && !p.isYou);

  const say = (outcome: ReviewRequestOutcome, ok: string) => {
    if (outcome.ok) onNotice(ok);
    else onNotice(outcome.conflict === true ? copy.conflict : (outcome.message ?? copy.failed));
  };

  const request = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    const outcome = await onRequest(chosen.map((p) => p.userId));
    setBusy(false);
    say(outcome, copy.requested(chosen.map((p) => p.name).join(', ')));
    if (outcome.ok) setChosen([]);
  };

  const withdraw = async (person: ReviewPerson) => {
    setBusy(true);
    const outcome = await onWithdraw(person.userId);
    setBusy(false);
    say(outcome, copy.withdrawn(person.name));
  };

  if (requests.length === 0 && (!canRequest || options.length === 0)) return null;

  return (
    <Box data-testid="review-requests">
      {hideLabel ? null : <SectionLabel>{copy.label}</SectionLabel>}
      {requests.length === 0 ? (
        <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>{copy.none}</Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {requests.map((r) => (
            <Box
              component="li"
              key={`${r.stage}:${r.user.userId}`}
              data-testid="review-request"
              data-reviewed={r.reviewed ? 'true' : 'false'}
              sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: '8px', alignItems: 'start' }}
            >
              <Monogram initials={r.user.initials} tone={r.reviewed ? 'ok' : 'idle'} />
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: changeOrderType.size.body }}>
                  {r.user.name}
                  {r.user.isYou ? reviewCopy.decision.you : ''}
                  <ReviewTag tone={r.reviewed ? 'ok' : 'warn'}>{r.reviewed ? copy.reviewed : copy.waiting}</ReviewTag>
                </Box>
                <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
                  {r.requestedBy === undefined
                    ? copy.requestedAt(agoText(r.requestedAt, now))
                    : copy.requestedBy(r.requestedBy.name, agoText(r.requestedAt, now))}
                </Box>
              </Box>
              {canRequest ? (
                <Box
                  component="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void withdraw(r.user)}
                  data-testid="review-request-withdraw"
                  sx={{ ...reviewTextButtonSx, fontSize: changeOrderType.size.small }}
                >
                  {copy.withdraw}
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
      {canRequest && options.length > 0 ? (
        <Box sx={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Autocomplete
            multiple
            size="small"
            options={options}
            value={chosen}
            onChange={(_event, value) => setChosen(value)}
            getOptionLabel={(p) => p.name}
            isOptionEqualToValue={(a, b) => a.userId === b.userId}
            disabled={busy}
            sx={{ flex: 1, minWidth: 0 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={copy.requestFrom}
                placeholder={chosen.length === 0 ? copy.requestPlaceholder : undefined}
                slotProps={{ htmlInput: { ...params.inputProps, 'data-testid': 'review-request-input' } }}
              />
            )}
          />
          <Button
            variant="outlined"
            size="small"
            disabled={busy || chosen.length === 0}
            onClick={() => void request()}
            data-testid="review-request-submit"
            sx={{ ...reviewQuietButtonSx, height: 34 }}
          >
            {copy.request}
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
