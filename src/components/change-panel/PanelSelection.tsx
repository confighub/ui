// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The selected Units in the change panel, read as the Functions panel reads them (the
 * `selectedUnits` slice). On a Unit page that is the page's own Unit, shown as one compact row
 * under the head (D27). On the Units list: with no change, "Start a change on N Units" and the
 * list (D9); with a change, one line and "Add N selected".
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { changeOrderInk, changeOrderSurface, changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { useDraftBases } from '@/pages/change-orders/draft/useDraftBases';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { PanelLink, PanelNotice } from './ChangeTrackParts';
import { middleCut, monoSx } from './panelStyles';
import { StateTag } from './SelectionBlock';
import { setActiveChange } from './activeChange';
import { useJoinUnits, type PanelSelection, type SelectedUnit, type Selection } from './useSelection';
import type { useChangeStart } from './useChangeStart';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The page Unit's name is cut in the middle past this many characters (D27). */
const PAGE_UNIT_NAME_MAX = 29;

const unitIcon = <DataObjectIcon sx={{ fontSize: 15, color: tokens.t2, flex: 'none' }} />;

/** "In checkout-base-4417, the base of checkout" / "It will live in …". */
export function LivesIn({ testId, lead, space, why }: { testId: string; lead: string; space: string; why?: string }) {
  return (
    <Box data-testid={testId} sx={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: 12, color: tokens.t2, flexWrap: 'wrap' }}>
      <FolderOutlinedIcon sx={{ fontSize: 13 }} />
      <span>
        {`${lead} `}
        <Box component="span" sx={{ ...monoSx, color: tokens.t1 }}>
          {space}
        </Box>
        {why ? `, ${why}` : ''}
      </span>
    </Box>
  );
}

/** "held by <owner> · <change>", the change a link to its page (D29). */
function HeldLine({ unit, tagTestId, linkTestId, finishedLinkTestId }: { unit: SelectedUnit; tagTestId?: string; linkTestId: string; finishedLinkTestId?: string }) {
  const finished = unit.heldFinished === true;
  return (
    <>
      <StateTag state="held" owner={unit.owner} finished={finished} testId={tagTestId} />
      {unit.heldBy && finished ? (
        // Never "in your change" or Switch to it: a finished change takes no more writes (D37).
        <PanelLink testId={finishedLinkTestId ?? linkTestId} small wrap href={changeSetPath(unit.heldBy.space, unit.heldBy.slug)}>
          <Box component="span" sx={monoSx}>
            {unit.heldBy.slug}
          </Box>
        </PanelLink>
      ) : unit.heldBy ? (
        <>
          <Box component="span" sx={{ color: tokens.t3 }}>
            ·
          </Box>
          <PanelLink testId={linkTestId} small wrap href={changeSetPath(unit.heldBy.space, unit.heldBy.slug)}>
            <Box component="span" sx={monoSx}>
              {unit.heldBy.slug}
            </Box>
          </PanelLink>
        </>
      ) : null}
    </>
  );
}

/** The page's own Unit as one row under the head (D27), with its state and action. */
export function PageUnitRow({
  unit,
  changeSetId,
  start,
  closed,
}: {
  unit: SelectedUnit;
  /** The open change, or undefined with none. */
  changeSetId?: string;
  start?: ReturnType<typeof useChangeStart>;
  closed?: boolean;
}) {
  const joinUnits = useJoinUnits();
  const name = `${unit.space}/${unit.unit}`;
  let action = null;
  if (changeSetId === undefined || closed) {
    if (unit.state === 'free' && start)
      action = (
        <PanelLink testId="start-on-selection" onClick={() => void start.start({ unitIds: [unit.unitId] })}>
          Start a ChangeSet on 1 Unit
        </PanelLink>
      );
    else if (unit.state === 'held') action = <HeldLine unit={unit} linkTestId="page-unit-held-link" finishedLinkTestId="page-unit-closed-link" />;
  } else if (unit.state === 'free')
    action = (
      <>
        <StateTag state="free" />
        <PanelLink testId="add-selected" onClick={() => void joinUnits.join([unit.unitId], changeSetId)}>
          Add 1 selected
        </PanelLink>
      </>
    );
  else if (unit.state === 'mine') action = <StateTag state="mine" />;
  if (unit.state === 'own' && unit.ownChange) {
    const other = unit.ownChange;
    // D28: the Unit is in another change of yours; switching makes that one your change.
    action = (
      <>
        <StateTag state="own" change={other.slug} />
        <PanelLink testId="page-unit-switch" onClick={() => setActiveChange(other)}>
          {changeSetId === undefined ? 'Select' : 'Switch to it'}
        </PanelLink>
      </>
    );
  }
  else if (unit.state === 'held') action = <HeldLine unit={unit} linkTestId="page-unit-held-link" finishedLinkTestId="page-unit-closed-link" />;
  return (
    <Box
      data-testid="page-unit-selection"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px 8px',
        padding: '8px 16px',
        borderBottom: `1px solid ${tokens.bd0}`,
        background: tokens.surface,
        fontSize: 12,
        color: tokens.t2,
        '& > *': { whiteSpace: 'nowrap' },
      }}
    >
      <span>1 Unit selected</span>
      {unitIcon}
      <Box component="span" data-testid="page-unit-name" title={name} sx={{ ...monoSx, color: tokens.t1, fontSize: 12, flex: '0 1 auto', marginRight: 'auto' }}>
        {name.length > PAGE_UNIT_NAME_MAX ? middleCut(name, 15, 13) : name}
      </Box>
      {action}
      {joinUnits.error ? (
        <PanelNotice severity="error" sx={{ width: '100%', whiteSpace: 'normal' }}>
          {joinUnits.error}
        </PanelNotice>
      ) : null}
    </Box>
  );
}

const blockSx = { padding: '14px 16px' } as const;

/** No change yet, Units ticked on a list (D9): start a change on them, and the list. */
export function StartOnSelection({ ps, start }: { ps: PanelSelection; start: ReturnType<typeof useChangeStart> }) {
  const free = ps.selection.units.filter((u) => u.state === 'free');
  const first = free[0];
  const held = ps.selection.units.filter((u) => u.state === 'held').length;
  const { bases } = useDraftBases();
  // D4: the change lives in the base Space of the first free Unit's Component, else that Unit's Space.
  const firstBase = first?.componentId ? bases.find((b) => b.componentId === first.componentId) : undefined;
  const home = firstBase ? { id: firstBase.spaceId, slug: firstBase.spaceSlug } : first ? { id: first.spaceId, slug: first.space } : undefined;
  let row = 0;
  return (
    <Box data-testid="selection-block">
      <Box sx={blockSx}>
        <Box sx={{ fontWeight: 600, fontSize: changeOrderType.size.lead }}>{`${plural(ps.selection.units.length, 'Unit')} selected`}</Box>
        <Box component="p" sx={{ color: tokens.t2, fontSize: changeOrderType.size.body, margin: '6px 0 12px' }}>
          {held === 0
            ? 'Start a ChangeSet with them. Each one joins it now, before you edit.'
            : 'Start a ChangeSet with them. Each free one joins it now, before you edit. A held Unit cannot join until its ChangeSet finishes.'}
        </Box>
        <Button
          variant="contained"
          fullWidth
          data-testid="start-on-selection"
          disabled={start.busy || free.length === 0}
          onClick={() => home && void start.start({ unitIds: free.map((u) => u.unitId), space: home })}
          sx={{ height: 36 }}
        >
          {`Start a ChangeSet on ${plural(free.length, 'Unit')}`}
        </Button>
        {home ? (
          <LivesIn testId="change-pending-lives-in" lead="It will live in" space={home.slug} why={firstBase ? `the base of ${firstBase.componentSlug}` : 'the Space of the first selected Unit'} />
        ) : null}
        {start.error ? (
          <PanelNotice severity="error" sx={{ marginTop: 1.5 }}>
            {start.error}
          </PanelNotice>
        ) : null}
      </Box>
      <Box
        sx={{
          padding: '9px 16px',
          background: changeOrderSurface.sunk,
          borderTop: `1px solid ${tokens.bd0}`,
          borderBottom: `1px solid ${tokens.bd0}`,
          fontSize: changeOrderType.size.body,
          fontWeight: 600,
          color: changeOrderInk.default,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Selected</span>
        {held > 0 ? (
          <Box component="span" sx={{ fontWeight: changeOrderType.weight.regular, color: tokens.t2, fontSize: 12 }}>
            {[...(free.length > 0 ? [`${free.length} can join`] : []), `${held} held`].join(', ')}
          </Box>
        ) : null}
      </Box>
      {ps.selection.units.map((u) => {
        const isHeld = u.state === 'held';
        if (!isHeld) row += 1;
        return (
          <Box
            key={u.unitId}
            data-testid={isHeld ? 'selected-unit-held' : `selected-unit-${row}`}
            sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', padding: '5px 16px', fontSize: 12, borderBottom: `1px solid ${tokens.bd2}` }}
          >
            {unitIcon}
            <Box component="span" sx={{ ...monoSx, fontSize: 12, overflowWrap: 'anywhere', minWidth: 0 }}>{`${u.space}/${u.unit}`}</Box>
            {isHeld ? (
              <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', paddingLeft: '23px' }}>
                <HeldLine unit={u} tagTestId="selected-unit-held-tag" linkTestId="selection-held-link" />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

/** A change is open, Units ticked on a list (D9): one line and "Add N selected". */
export function AddSelection({ selection, changeSetId }: { selection: Selection; changeSetId: string }) {
  const joinUnits = useJoinUnits();
  const free = selection.units.filter((u) => u.state === 'free');
  const mine = selection.counts.mine;
  // The button counts only free Units: say what the others are, so the line and the button agree.
  const { own, held } = selection.counts;
  const cannotJoin = [
    ...(held > 0 ? [`${held} held`] : []),
    ...(own > 0 ? [`${own} in your other ${own === 1 ? 'ChangeSet' : 'ChangeSets'}`] : []),
  ];
  return (
    <Box data-testid="selection-block" sx={{ ...blockSx, background: changeOrderSurface.sunk, borderBottom: `1px solid ${tokens.bd0}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Box component="span" sx={{ flex: 1, fontSize: changeOrderType.size.body }}>
          <b>{`${plural(selection.units.length, 'Unit')} selected`}</b>
          {` on this page, ${mine === 0 ? 'none' : mine} in your ChangeSet${mine === 0 ? ' yet' : ''}`}
          {cannotJoin.length > 0 ? (
            <span data-testid="selection-cannot-join">{`; ${[...(free.length > 0 ? [`${free.length} can join`] : []), ...cannotJoin].join(', ')}`}</span>
          ) : null}
        </Box>
        {free.length > 0 ? (
          <Button size="small" variant="contained" data-testid="add-selected" disabled={joinUnits.busy} onClick={() => void joinUnits.join(free.map((u) => u.unitId), changeSetId)}>
            {`Add ${free.length} selected`}
          </Button>
        ) : null}
      </Box>
      {joinUnits.error ? (
        <PanelNotice severity="error" sx={{ marginTop: 1 }}>
          {joinUnits.error}
        </PanelNotice>
      ) : null}
    </Box>
  );
}
