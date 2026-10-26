// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';

import { CompareColumnDnd } from '@/pages/x/apps/compare/CompareColumnDnd';
import { ComponentCompareSection } from '@/pages/x/apps/compare/ComponentCompareSection';
import { CompareLayout, PAGE_LAYOUT } from '@/pages/x/apps/compare/compareLayout';
import { CompareVocabulary, UNIT_VOCABULARY } from '@/pages/x/apps/compare/compareVocabulary';

import { MAX_COMPARE_SLOTS } from '../model/compare';
import { useEscLayer, useExplorerContext } from '../state/context';
import { useResults } from '../state/results-context';
import { useActiveTab } from '../state/useExplorer';
import { useCopyLink } from '../tabs/useCopyLink';
import { useCompare } from './compare-context';
import { CompareRail } from './CompareRail';
import { suggestForEmptySlot } from './suggest';
import { idOf } from './unit-row';
import { type SlotRequest, UnitSlots } from './UnitSlots';
import { usePickerSuggestions } from './usePickerSections';
import { useCompareUnits } from './useCompareUnits';

/**
 * Compare mode: the results area shows the compared Units side by side, in
 * the grid the Components view uses, with the slots above it and the view's
 * rows as a rail of names beside it. The table stays mounted and hidden
 * behind (ResultsPane), so "Back to table" and Esc return to the same
 * scroll, folds, selection and open row.
 *
 * Read-only: nothing here changes a Unit.
 *
 * The grid shows only while two Units or more can be read; one Unit gets the
 * state that offers a second, and a Unit that could not be read gets its
 * error, never a verdict ("0 differences") over the Units that are left.
 *
 * A window narrower than 1100px has no rail; the slots alone hold the
 * comparison there.
 */

const WIDE_QUERY = '(min-width:1100px)';
/** Below this the rail gives the grid 40px more. */
const ROOMY_QUERY = '(min-width:1600px)';
const RAIL_WIDTH = { roomy: 272, narrow: 232 } as const;

/** "alpha in prod", for a Unit the button and the empty slot name. */
const unitName = (row: ExtendedUnitRead) => `${row.Unit?.Slug ?? ''} in ${row.Space?.Slug ?? ''}`;


/** "temporal-frontend in 2 Spaces", "3 Units in checkout-prod", "2 slugs in 2 Spaces". */
function crumbFor(rows: readonly ExtendedUnitRead[]): string {
  const slugs = new Set(rows.map((r) => r.Unit?.Slug ?? ''));
  const spaces = new Set(rows.map((r) => r.Space?.Slug ?? ''));
  const spaceCount = `${spaces.size} ${spaces.size === 1 ? 'Space' : 'Spaces'}`;
  if (rows.length === 1) return `${rows[0].Unit?.Slug ?? ''} in ${rows[0].Space?.Slug ?? ''}`;
  if (slugs.size === 1) return `${[...slugs][0]} in ${spaceCount}`;
  if (spaces.size === 1) return `${rows.length} Units in ${[...spaces][0]}`;
  return `${slugs.size} slugs in ${spaceCount}`;
}

export function CompareView() {
  const { universe } = useResults();
  const { toast } = useExplorerContext();
  const tab = useActiveTab();
  const copyLink = useCopyLink();
  const { ids, setIds, add, exit, openPicker, pickerSource, pickerSlot } = useCompare();
  const wide = useMediaQuery(WIDE_QUERY, { noSsr: true });
  const railWidth = useMediaQuery(ROOMY_QUERY, { noSsr: true }) ? RAIL_WIDTH.roomy : RAIL_WIDTH.narrow;
  const compared = useCompareUnits(ids);
  const { rows, resolvedIds, units, labels, mismatch, unresolved, loading, failed, unread, retryUnread } = compared;

  useEscLayer(true, exit);

  // A Unit deleted, or no longer visible, leaves the comparison once the Units have loaded: one change, one message.
  const unresolvedKey = unresolved.join(',');
  useEffect(() => {
    if (!unresolvedKey) return;
    const gone = unresolvedKey.split(',');
    setIds(ids.filter((id) => !gone.includes(id)));
    toast({
      message:
        gone.length === 1
          ? '1 Unit is no longer available and was removed from the comparison.'
          : `${gone.length} Units are no longer available and were removed from the comparison.`,
      severity: 'warning',
    });
    // Run once per set of missing Units; ids is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolvedKey]);

  const rowsById = useMemo(() => new Map(rows.map((r) => [idOf(r), r])), [rows]);

  // What the empty slot suggests: the first free Unit the picker offers for slot A, from the same sections.
  const slotA = rows[0];
  const sections = usePickerSuggestions(slotA, ids);
  const suggestion = useMemo(() => {
    if (!slotA || ids.length >= MAX_COMPARE_SLOTS) return undefined;
    const option = suggestForEmptySlot(sections);
    if (!option) return undefined;
    const { Unit: unit, Space: space } = option.row;
    const label = unit?.Slug === slotA.Unit?.Slug ? (space?.Slug ?? '') : `${unit?.Slug ?? ''} · ${space?.Slug ?? ''}`;
    return { row: option.row, label };
  }, [slotA, ids.length, sections]);

  const onRequestPicker = useCallback(
    ({ slot, anchor }: SlotRequest) => openPicker(slot === 'add' ? { kind: 'add', anchor } : { kind: 'replace', index: slot, anchor }),
    [openPicker],
  );

  const onReorder = useCallback((next: string[]) => setIds(next), [setIds]);
  const onRemove = useCallback((id: string) => setIds(ids.filter((x) => x !== id)), [ids, setIds]);

  // Focus moves to the comparison when it opens, so Tab and the screen reader start there.
  const focusOnOpen = useCallback((el: HTMLElement | null) => el?.focus({ preventScroll: true }), []);

  // The Units the grid can show: read, or still being read.
  const readable = units[0]?.columns.length ?? 0;
  const count = ids.length;
  return (
    <Box
      data-testid='vx-compare'
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: wide ? `${railWidth}px minmax(0, 1fr)` : 'minmax(0, 1fr)',
        bgcolor: 'background.paper',
      }}
    >
      {wide && <CompareRail width={railWidth} ids={ids} onAdd={add} onRemove={onRemove} onBack={exit} />}
      <Box
        component='section'
        ref={focusOnOpen}
        tabIndex={-1}
        aria-label='Compare Units'
        data-testid='vx-compare-region'
        sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', outline: 'none' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, minHeight: 48, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant='h3' component='h2' sx={{ whiteSpace: 'nowrap' }} data-testid='vx-compare-title'>
            {count >= 2 ? `Compare ${count} Units` : 'Compare Units'}
          </Typography>
          {rows.length > 0 && (
            <Typography variant='body2' color='text.secondary' noWrap sx={{ minWidth: 0 }} data-testid='vx-compare-crumb'>
              · {crumbFor(rows)}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size='small'
            color='inherit'
            onClick={() => void copyLink(tab)}
            // Filled on hover and keyboard focus only: a click leaves focus here, and a fill would stay with it.
            sx={{ color: 'text.secondary', flexShrink: 0, bgcolor: 'transparent', '&:hover, &.Mui-focusVisible': { bgcolor: 'grey.100' } }}
            data-testid='vx-compare-copy-link'
          >
            Copy link
          </Button>
          <Button size='small' variant='outlined' color='inherit' startIcon={<ArrowBackIcon />} onClick={exit} sx={{ flexShrink: 0 }} data-testid='vx-compare-back'>
            Back to table
          </Button>
        </Box>

        {failed && (
          <Alert severity='error' sx={{ mx: 2, mt: 1.5 }} action={<Button size='small' onClick={universe.refetch}>Retry</Button>}>
            {rows.length
              ? 'The Units could not be refreshed. The comparison shows them as they were last read.'
              : 'The Units could not be loaded, so the comparison cannot be shown.'}
          </Alert>
        )}

        <CompareColumnDnd order={resolvedIds} labels={labels} onReorder={onReorder}>
          <UnitSlots
            ids={ids}
            rowsById={rowsById}
            loading={loading}
            suggestion={suggestion?.label}
            onChange={setIds}
            onRequestPicker={onRequestPicker}
            openSlot={pickerSlot}
          />
          {unread.length > 0 && (
            <Alert
              severity='error'
              sx={{ mx: 2, mt: 1.5, flexShrink: 0 }}
              data-testid='vx-compare-unread'
              action={
                <Button size='small' onClick={retryUnread}>
                  Retry
                </Button>
              }
            >
              {unread.length === 1
                ? `The configuration of ${unitName(unread[0])} could not be read, so it is left out of the grid.`
                : `The configuration of ${unread.length} Units could not be read, so they are left out of the grid.`}
            </Alert>
          )}
          {mismatch && (
            <Alert severity='warning' sx={{ mx: 2, mt: 1.5, mb: 0.5, py: 0, flexShrink: 0 }} data-testid='vx-compare-mismatch'>
              These Units have different resources. Only matching documents line up.
            </Alert>
          )}
          {loading ? (
            <Box sx={{ px: 2, py: 1.5 }} aria-busy='true' data-testid='vx-compare-loading'>
              {[62, 48, 70, 40].map((w) => (
                <Skeleton key={w} variant='text' width={`${w}%`} />
              ))}
            </Box>
          ) : readable >= 2 ? (
            <CompareVocabulary.Provider value={UNIT_VOCABULARY}>
              <CompareLayout.Provider value={PAGE_LAYOUT}>
                <ComponentCompareSection units={units} deploymentCount={readable} showUnitHeader={false} />
              </CompareLayout.Provider>
            </CompareVocabulary.Provider>
          ) : rows.length === 1 ? (
            <Box sx={{ px: 2, py: 6, textAlign: 'center' }} data-testid='vx-compare-one'>
              <Typography variant='h3'>Pick a second Unit to compare with {rows[0].Unit?.Slug}</Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                {wide
                  ? 'Choose one from the list of Units on the left, or from the empty slot above.'
                  : 'Choose one from the empty slot above, or widen the window to see the list of Units.'}
              </Typography>
              <Stack direction='row' spacing={1} justifyContent='center' sx={{ mt: 1.5 }}>
                {suggestion && (
                  <Button
                    variant='contained'
                    size='small'
                    onClick={() => add(idOf(suggestion.row), suggestion.row.Unit?.Slug ?? '')}
                    data-testid='vx-compare-suggested'
                  >
                    Compare with {unitName(suggestion.row)}
                  </Button>
                )}
                <Button
                  variant='outlined'
                  color='inherit'
                  size='small'
                  aria-haspopup='dialog'
                  aria-expanded={pickerSource === 'one-unit'}
                  onClick={(e) => openPicker({ kind: 'add', anchor: e.currentTarget, source: 'one-unit' })}
                  data-testid='vx-compare-choose'
                  sx={{
                    // Pressed while its picker is open.
                    '&[aria-expanded="true"], &[aria-expanded="true"]:hover': {
                      bgcolor: 'primary.light',
                      color: 'primary.dark',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  Choose another Unit…
                </Button>
              </Stack>
            </Box>
          ) : null}
        </CompareColumnDnd>
      </Box>
    </Box>
  );
}
