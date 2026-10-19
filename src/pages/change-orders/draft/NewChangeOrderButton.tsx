// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type KeyboardEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

import { controlSx } from '../consoleStyle';
import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderType } from '../changeOrdersTokens';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import { draftHref } from './draftDecisions';
import { OPTION_SX } from './draftLook';
import { DraftPopover } from './DraftPopover';
import { agoText, baseForFilter, pickerGroups, type DraftBase, type PickerGroup, type PickerRow } from './newChangeOrderModel';
import { useDraftBases, usePickerRows } from './useDraftBases';

const copy = draftCopy.page;
const pickerCopy = draftCopy.page.picker;

/** Rows drawn while the picker reads. */
const SKELETON_ROWS = 4;
/** How tall the list grows before it scrolls under the pinned search. */
const LIST_MAX_HEIGHT = 'min(420px, calc(100vh - 220px))';

const baseHref = (base: DraftBase) => draftHref({ space: base.spaceSlug });

interface PickerOptionProps {
  row: PickerRow;
  now: number;
  onPick: () => void;
}

/** A Component, at its base: its name, the base's slug, and its last ChangeOrder. */
function PickerOption({ row, now, onPick }: PickerOptionProps) {
  const { base, last } = row;
  return (
    <Box
      component={RouterLink}
      to={baseHref(base)}
      role="menuitem"
      data-draft-option
      data-base={base.spaceSlug}
      onClick={onPick}
      sx={{ ...OPTION_SX, color: 'inherit', textDecoration: 'none' }}
    >
      <AccountTreeOutlinedIcon aria-hidden />
      <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
          <Box
            component="span"
            sx={{ fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {base.componentName}
          </Box>
          <Box
            component="span"
            translate="no"
            sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, whiteSpace: 'nowrap' }}
          >
            {base.spaceSlug}
          </Box>
        </Box>
        {last === undefined ? null : (
          <Box component="span" sx={{ display: 'block', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pickerCopy.last(last.slug, agoText(last.createdAt, now))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface GroupLabelProps {
  group: PickerGroup;
}

/** A group's small heading: "Changes waiting", "Nothing waiting". */
function GroupLabel({ group }: GroupLabelProps) {
  if (group.key === 'all') return null;
  return (
    <Box
      role="presentation"
      sx={{ padding: '8px 8px 4px', fontSize: changeOrderType.size.small, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.subtle }}
    >
      {pickerCopy.groups[group.key]}
    </Box>
  );
}

interface PickerProps {
  bases: readonly DraftBase[];
  basesStatus: 'loading' | 'failed' | 'resolved';
  retryBases: () => void;
  open: boolean;
  onPick: () => void;
}

/**
 * The picker's body: a search, pinned, then one row per Component, those with changes waiting
 * first. Arrow keys move from the search into the list, between rows, and from the first row
 * back to the search; Enter in the search opens the first row it kept, once rows are drawn.
 */
function Picker({ bases, basesStatus, retryBases, open, onPick }: PickerProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const picker = usePickerRows(bases, open);
  // Read when the picker draws, so every row's age is from one moment.
  const [now] = useState(() => Date.now());
  const failed = basesStatus === 'failed' || picker.status === 'failed';
  const loading = !failed && (basesStatus === 'loading' || picker.status === 'loading');
  const groups = failed || loading ? [] : pickerGroups(picker.rows, query);
  const first = groups[0]?.rows[0];
  const retryAll = () => {
    retryBases();
    picker.retry();
  };

  /** From the first row, ArrowUp goes back to the search rather than round to the last row. */
  const onListKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowUp' || !(event.target instanceof HTMLElement)) return;
    const firstOption = event.currentTarget.querySelector<HTMLElement>('[data-draft-option]');
    if (event.target !== firstOption) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.currentTarget.closest('[role="dialog"]')?.querySelector<HTMLElement>('[data-draft-option]')?.focus();
    } else if (event.key === 'Enter' && first !== undefined) {
      event.preventDefault();
      onPick();
      navigate(baseHref(first.base));
    }
  };

  let body;
  if (failed) {
    body = (
      <Box sx={{ padding: '6px 8px' }}>
        <CouldNotEstablish onRetry={retryAll} retryWhat={pickerCopy.retryWhat} />
      </Box>
    );
  } else if (loading) {
    body = (
      <Box aria-busy="true" sx={{ padding: '4px 8px' }}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Box key={index} sx={{ display: 'flex', gap: '10px', padding: '7px 0' }}>
            <Skeleton variant="rounded" width={17} height={17} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="55%" />
              <Skeleton variant="text" width="80%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else if (groups.length === 0) {
    body = <Box sx={{ padding: '8px', fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>{pickerCopy.noMatch}</Box>;
  } else {
    body = (
      <>
        {/* Without the Units the rows go ungrouped: say so once, with the way to ask again. */}
        {picker.unitsFailed ? (
          <Box sx={{ padding: '4px 8px' }}>
            <CouldNotEstablish subject={pickerCopy.groups.waiting} onRetry={picker.retry} retryWhat={pickerCopy.retryWaiting} />
          </Box>
        ) : null}
        {groups.map((group) => (
          <Box key={group.key} role="group" aria-label={group.key === 'all' ? undefined : pickerCopy.groups[group.key]}>
            <GroupLabel group={group} />
            {group.rows.map((row) => (
              <PickerOption key={row.base.spaceId} row={row} now={now} onPick={onPick} />
            ))}
          </Box>
        ))}
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '2px 4px 6px',
          padding: '0 8px',
          height: 30,
          border: `1px solid ${changeOrderBorder.default}`,
          borderRadius: `${changeOrderShape.radius.md}px`,
          '&:focus-within': { borderColor: changeOrderStatus.accent },
        }}
      >
        <SearchIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
        <InputBase
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder={pickerCopy.search}
          inputProps={{ 'aria-label': pickerCopy.search, type: 'search', autoComplete: 'off', spellCheck: false }}
          sx={{ flex: 1, fontSize: changeOrderType.size.body }}
        />
      </Box>
      <Box role="menu" aria-label={copy.newChangeOrder} onKeyDown={onListKey} sx={{ maxHeight: LIST_MAX_HEIGHT, overflow: 'auto', overscrollBehavior: 'contain' }}>
        {body}
      </Box>
    </>
  );
}

export interface NewChangeOrderButtonProps {
  /** The console's Component filter, by slug: with one base, the button opens its draft. */
  componentSlug?: string;
  /** The console's Space filter, by slug: a base Space's draft opens directly. */
  spaceSlug?: string;
}

/**
 * "New ChangeOrder" on the ChangeOrders console. A draft is made in a Component's base, so
 * where the console is already narrowed to one (or there is only one), it opens that draft;
 * otherwise it asks which Component.
 */
export function NewChangeOrderButton({ componentSlug, spaceSlug }: NewChangeOrderButtonProps) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Each opening starts with an empty search; the list stays drawn while the popover closes.
  const [openings, setOpenings] = useState(0);
  const { bases, status, retry } = useDraftBases();
  const content = (
    <>
      <AddIcon aria-hidden="true" sx={{ fontSize: 15 }} />
      {copy.newChangeOrder}
    </>
  );
  const direct = baseForFilter(bases, { componentSlug, spaceSlug }) ?? (bases.length === 1 ? bases[0] : undefined);
  const opensDraft = status === 'resolved' && direct !== undefined;
  const disabled = status === 'resolved' && bases.length === 0;
  // One button whatever the reads say, so it never swaps under the pointer or the keyboard:
  // with one base to go to it opens that draft, else it asks which.
  const button = (
    <Box
      component="button"
      type="button"
      data-testid="new-change-order"
      aria-haspopup={opensDraft ? undefined : 'dialog'}
      aria-expanded={opensDraft ? undefined : anchor !== null}
      aria-disabled={disabled}
      onClick={(event) => {
        if (disabled) return;
        if (opensDraft) {
          navigate(baseHref(direct));
          return;
        }
        setOpenings((count) => count + 1);
        setAnchor(event.currentTarget);
      }}
      sx={{
        ...controlSx('primary', !disabled),
        // The page's one primary action takes the brand's action colour, as the theme's contained primary does.
        ...(disabled
          ? {}
          : { backgroundColor: 'primary.main', borderColor: 'primary.dark', '&:hover': { backgroundColor: 'primary.dark' } }),
        gap: '6px',
      }}
    >
      {content}
    </Box>
  );
  return (
    <>
      <Tooltip title={disabled ? copy.noBaseSpace : ''}>{button}</Tooltip>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.newChangeOrder} wide align="right" height={480}>
        <Picker key={openings} bases={bases} basesStatus={status} retryBases={retry} open={openings > 0} onPick={() => setAnchor(null)} />
      </DraftPopover>
    </>
  );
}
