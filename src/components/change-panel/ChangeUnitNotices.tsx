// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the Unit page's Config tab says about the person's change: the quiet caption
 * beside Save (D5), the held notice when another person's change holds the Unit (D14),
 * and the note on a Unit of a finished change.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useBulkPatchUnitsMutation, useGetUnitQuery, type UnitRead } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { FactLink } from '@/pages/change-orders/components/SummaryFacts';
import { useActiveChange } from './ActiveChangeProvider';
import { PanelNotice } from './ChangeTrackParts';
import { monoSx } from './panelStyles';
import { useFinishedHold, useHeld, useOwnOtherChange, type HeldUnit } from './useHeldUnit';

/** Where a save goes (D7): "Saves into your change <name>.", "Saved into …" after a save, else a new Revision. */
export function SaveCaption({ unit }: { unit: UnitRead }) {
  const ac = useActiveChange();
  const changeSet = ac?.detail.changeSet;
  const open = changeSet?.State === 'Open' || changeSet?.State === 'New';
  // While the change is read, its name is known from storage already.
  const slug = open ? changeSet?.Slug : changeSet === undefined && ac?.detail.status === 'loading' ? ac.ref?.slug : ac?.pending ?? undefined;
  const saved = slug !== undefined && ac?.lastSave?.unitId === unit.UnitID;
  const other = useOwnOtherChange(unit);
  const finishedHold = useFinishedHold(unit);
  if (finishedHold)
    return (
      <Box data-testid="save-target" sx={{ fontSize: 12, color: tokens.t2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        Free this Unit to save here.
      </Box>
    );
  if (other)
    return (
      <Box data-testid="save-target" sx={{ fontSize: 12, color: tokens.t2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        This Unit is in your ChangeSet{' '}
        <Box component="span" sx={{ ...monoSx, color: tokens.t1 }}>
          {other.changeSetSlug}
        </Box>
        {ac?.ref ? '. Switch to it to save here.' : '. Select it to save here.'}
      </Box>
    );
  return (
    <Box data-testid="save-target" sx={{ fontSize: 12, color: tokens.t2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
      {slug === undefined ? (
        'Saves as a new Revision.'
      ) : (
        <>
          {saved ? 'Saved into your ChangeSet ' : 'Saves into your ChangeSet '}
          <Box component="span" sx={{ ...monoSx, color: tokens.t1 }}>
            {slug}
          </Box>
          .
        </>
      )}
    </Box>
  );
}

/** Held by a finished change (D37): it refuses every write until this Unit is freed from it. */
function FinishedHoldBar({ unit, held }: { unit: UnitRead; held: HeldUnit }) {
  const [bulkPatchUnits, { isLoading }] = useBulkPatchUnitsMutation();
  // The Unit read the held state comes from: read again once the Unit is freed.
  const unitRead = useGetUnitQuery({ spaceId: unit.SpaceID ?? '', unitId: unit.UnitID ?? '' }, { skip: !unit.SpaceID || !unit.UnitID });
  const [error, setError] = useState<string>();
  const free = async () => {
    setError(undefined);
    try {
      // Taking a Unit out of a change that is already closed changes nothing else.
      const answer = await bulkPatchUnits({
        where: `UnitID = '${unit.UnitID}'`,
        // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
        body: JSON.stringify({ ChangeSetID: null }),
      }).unwrap();
      const failed = (Array.isArray(answer) ? answer : []).find((item) => (item as { Error?: unknown }).Error);
      if (failed) setError(getApiErrorMessage((failed as { Error?: unknown }).Error));
      else void unitRead.refetch();
    } catch (failure) {
      setError(getApiErrorMessage(failure));
    }
  };
  return (
    <PanelNotice
      severity="warning"
      icon={<LockOutlinedIcon fontSize="inherit" />}
      data-testid="closed-hold-bar"
      sx={{ marginBottom: 1.5, alignItems: 'center' }}
      action={
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          data-testid="free-unit"
          disabled={isLoading}
          onClick={() => void free()}
          sx={{ whiteSpace: 'nowrap', borderColor: tokens.bd0, color: tokens.t1, background: tokens.surface }}
        >
          Free this Unit
        </Button>
      }
    >
      <span data-testid="closed-hold-text">
        Held by the finished ChangeSet{' '}
        <Box component="span" data-testid="closed-change-link" sx={{ ...monoSx, fontWeight: 600, overflowWrap: 'anywhere' }}>
          <FactLink href={changeSetPath(held.changeSetSpace, held.changeSetSlug)}>
            {held.changeSetSlug}
          </FactLink>
        </Box>
        . Writes are refused until it lets go of this Unit.
      </span>
      {error ? <Box sx={{ marginTop: '4px', color: tokens.red }}>{error}</Box> : null}
    </PanelNotice>
  );
}

export function ChangeUnitNotices({ unit }: { unit: UnitRead }) {
  const held = useHeld(unit);
  if (held !== null && held.finished) return <FinishedHoldBar unit={unit} held={held} />;
  return (
    <>
      {held !== null ? (
        <PanelNotice
          severity="warning"
          icon={<LockOutlinedIcon fontSize="inherit" />}
          data-testid="held-bar"
          sx={{ marginBottom: 1.5, alignItems: 'center' }}
          action={
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              data-testid="held-open-change"
              href={changeSetPath(held.changeSetSpace, held.changeSetSlug)}
              endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
              sx={{ whiteSpace: 'nowrap', borderColor: tokens.bd0, color: tokens.t1, background: tokens.surface }}
            >
              Open ChangeSet
            </Button>
          }
        >
          <span data-testid="held-bar-text">
            Held by <b>{held.owner}</b>&apos;s ChangeSet{' '}
            <Box component="span" data-testid="held-change-link" sx={{ ...monoSx, fontWeight: 600, overflowWrap: 'anywhere' }}>
              <FactLink href={changeSetPath(held.changeSetSpace, held.changeSetSlug)}>
                {held.changeSetSlug}
              </FactLink>
            </Box>
            . Read only until it finishes.
          </span>
        </PanelNotice>
      ) : null}
    </>
  );
}
