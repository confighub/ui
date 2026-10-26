// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popper, { type PopperProps } from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { plainKey } from '../keys/usePageShortcuts';
import { LensLine } from '../lenses/LensRow';
import { noun } from '../lenses/layer';
import { Kbd } from '../lenses/parts';
import { fieldById } from '../model/fields';
import { EMPTY_GROUP_VALUE } from '../model/grouping';
import { ShortcutMap } from '../shortcuts/ShortcutMap';
import {
  type Shortcut,
  useEscLayer,
  useExplorerContext,
  useRegisterShortcut,
  useRegisterSlot,
} from '../state/context';
import { newId } from '../state/initial';
import { useResults } from '../state/results-context';
import type { PeekRequest } from '../state/slots';
import { useTabActions, useWork } from '../state/useExplorer';
import { groupValueText, stepLens } from '../table/groups';
import { PeekCell } from './PeekCell';
import { mergeSlice, peekSlice } from './slice';

/**
 * Peeks: a click on a group count, a lane or a matrix count, or a status chip
 * shows exactly that part of the current view in a floating card, without
 * changing the view. The card shows the rows the caller names (the group's
 * own rows); from it the viewer can look one group level deeper (Back
 * returns), "Add as filter" (the view itself narrows), or "Pin as draft" (P):
 * a new temporary tab with the view's lenses plus the slice, and the group
 * levels below it. Those two act only when the slice's filters give exactly
 * the rows on the card; otherwise they say why not.
 *
 * Also mounts the "?" shortcut map, which has no other home on the page.
 */

const PEEK_ROWS = 6;
const PEEK_COLUMNS = 4;
const SUBGROUPS = 6;

/** A request, the view it was made in, and (when known) the exact rows of the part it is about. */
type Peek = PeekRequest & { viewKey: string };

/**
 * A Popper anchor that keeps the last known place of its element: a table
 * re-render can replace the element under an open peek, and the card should
 * stay put (and not warn about a detached anchor) until it closes.
 */
function stableAnchor(el: HTMLElement): NonNullable<PopperProps['anchorEl']> {
  let last = el.getBoundingClientRect();
  return {
    getBoundingClientRect: () => {
      if (el.isConnected) last = el.getBoundingClientRect();
      return last;
    },
  };
}

export function PeekHost() {
  const { state } = useExplorerContext();
  const work = useWork();
  // A peek belongs to the view it was opened in: another tab, layout or entity closes it.
  const viewKey = `${state.activeId}|${work.layout}|${work.entity}`;
  const [stack, setStack] = useState<Peek[]>([]);
  const close = useCallback(() => setStack([]), []);
  const open = useCallback(
    (request: PeekRequest) => setStack([{ ...request, viewKey }]),
    [viewKey],
  );
  useRegisterSlot('openPeek', open);
  useRegisterSlot('closePeek', close);

  // Another tab, layout or entity, or a count that is no longer on the page,
  // ends the peek (React's pattern for state that follows other values).
  const current = stack[stack.length - 1];
  const live =
    current && current.viewKey === viewKey && current.anchorEl.isConnected
      ? current
      : undefined;
  if (current && !live) setStack([]);
  useEscLayer(!!live, close);

  return (
    <>
      {live && (
        <PeekCard
          key={stack.length}
          request={live}
          canGoBack={stack.length > 1}
          onBack={() => setStack((s) => s.slice(0, -1))}
          onDeeper={(r) => setStack((s) => [...s, r])}
          onClose={close}
        />
      )}
      <ShortcutMap />
    </>
  );
}

interface PeekCardProps {
  request: Peek;
  canGoBack: boolean;
  onBack: () => void;
  onDeeper: (request: Peek) => void;
  onClose: () => void;
}

function PeekCard({ request, canGoBack, onBack, onDeeper, onClose }: PeekCardProps) {
  const { dispatch, slots, toast } = useExplorerContext();
  const { newTemp } = useTabActions();
  const { derived } = useResults();
  const work = useWork();
  const entity = work.entity;
  const anchor = useMemo(() => stableAnchor(request.anchorEl), [request.anchorEl]);

  // The rows on the card, and whether the slice's filters can stand for them.
  const { rows, blocked } = useMemo(
    () => peekSlice(entity, derived.rows, derived.rowId, request.lenses, request.rowIds),
    [entity, derived, request.lenses, request.rowIds],
  );

  const columns = useMemo(
    () =>
      work.columns
        .map((c) => c.name)
        .filter((n) => !!fieldById(entity, n))
        .slice(0, PEEK_COLUMNS),
    [work.columns, entity],
  );

  // The next group level, as the parts one more click would peek at, with their exact rows.
  const next = request.groupBy[0];
  const nextField = next ? fieldById(entity, next) : undefined;
  const subgroups = useMemo(() => {
    if (!nextField) return [];
    const byValue = new Map<string, string[]>();
    for (const r of rows) {
      const v = nextField.value(r);
      const key = v === null || v === '' ? EMPTY_GROUP_VALUE : String(v);
      const list = byValue.get(key);
      if (list) list.push(derived.rowId(r));
      else byValue.set(key, [derived.rowId(r)]);
    }
    return [...byValue].sort((a, b) => b[1].length - a[1].length).slice(0, SUBGROUPS);
  }, [nextField, rows, derived]);

  const pin = useCallback(() => {
    if (blocked) return;
    const { lenses } = mergeSlice(work.lenses, request.lenses, () => newId('lens'));
    onClose();
    newTemp({ ...work, lenses, groupBy: [...request.groupBy] });
    toast({ message: `Pinned “${request.title}” as a temporary view.`, severity: 'success' });
  }, [blocked, work, request, onClose, newTemp, toast]);

  const addAsFilter = useCallback(() => {
    if (blocked) return;
    const { lenses, touched } = mergeSlice(work.lenses, request.lenses, () => newId('lens'));
    const from = request.anchorEl.isConnected
      ? request.anchorEl.getBoundingClientRect()
      : null;
    onClose();
    // One action, so the whole change is one undo step (and one fork on "All units").
    dispatch({
      type: 'batch',
      actions: [
        {
          type: 'replaceFilter',
          lenses,
          resourceType: work.resourceType,
          whereData: work.whereData,
        },
        ...(request.groupBy.join('|') !== work.groupBy.join('|')
          ? [{ type: 'setGroupBy' as const, groupBy: [...request.groupBy] }]
          : []),
      ],
    });
    const last = touched[touched.length - 1];
    if (from && last) slots.current.flyIn({ from, label: request.title, lensId: last });
  }, [blocked, work, request, onClose, dispatch, slots]);

  const pinShortcut = useMemo<Shortcut>(
    () => ({
      id: 'peek-pin',
      keys: 'P',
      label: 'Pin the open peek as a temporary view',
      matches: plainKey('p'),
      run: pin,
    }),
    [pin],
  );
  useRegisterShortcut(pinShortcut);

  const actionButton = (button: JSX.Element) =>
    blocked ? (
      <Tooltip title={blocked}>
        <span>{button}</span>
      </Tooltip>
    ) : (
      button
    );

  return (
    <Popper
      open
      anchorEl={anchor}
      placement='bottom-start'
      modifiers={[
        { name: 'offset', options: { offset: [0, 6] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.modal }}
    >
      <ClickAwayListener
        onClickAway={(e) => !request.anchorEl.contains(e.target as Node) && onClose()}
      >
        <Paper
          elevation={8}
          role='dialog'
          aria-label={`Peek: ${request.title}`}
          data-testid='vx-peek'
          sx={{
            width: 440,
            maxWidth: 'calc(100vw - 16px)',
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction='row'
            alignItems='flex-start'
            spacing={1.5}
            sx={{ px: 1.75, pt: 1.5, pb: 1.25 }}
          >
            {canGoBack && (
              <Tooltip title='Back'>
                <IconButton
                  size='small'
                  aria-label='Back'
                  onClick={onBack}
                  data-testid='vx-peek-back'
                  sx={{ mt: -0.25 }}
                >
                  <ArrowBackIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction='row'
                alignItems='center'
                spacing={0.75}
                sx={{ color: 'text.disabled' }}
              >
                <VisibilityOutlinedIcon sx={{ fontSize: 13 }} />
                <Typography
                  variant='caption'
                  sx={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'inherit',
                  }}
                >
                  Peek · inside this view
                </Typography>
              </Stack>
              <Stack
                direction='row'
                flexWrap='wrap'
                useFlexGap
                spacing={0.5}
                sx={{ mt: 0.75 }}
                data-testid='vx-peek-conditions'
              >
                {request.lenses.map((l, i) => (
                  <Box
                    key={i}
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.75,
                      bgcolor: 'action.hover',
                      maxWidth: '100%',
                    }}
                  >
                    <LensLine entity={entity} lens={l} />
                  </Box>
                ))}
                {!request.lenses.length && (
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {request.title}
                  </Typography>
                )}
              </Stack>
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography
                sx={{
                  fontSize: 22,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid='vx-peek-count'
              >
                {rows.length}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                {noun(entity, rows.length)}
              </Typography>
            </Box>
          </Stack>

          {subgroups.length > 1 && nextField && (
            <Stack
              direction='row'
              flexWrap='wrap'
              useFlexGap
              spacing={0.5}
              sx={{ px: 1.75, pb: 1.25 }}
              data-testid='vx-peek-subgroups'
            >
              <Typography
                sx={{ fontSize: 11.5, color: 'text.disabled', mr: 0.25, alignSelf: 'center' }}
              >
                By {nextField.label}
              </Typography>
              {subgroups.map(([value, ids]) => {
                const spec = stepLens(entity, { field: nextField.id, value });
                return (
                  <ButtonBase
                    key={value}
                    data-testid='vx-peek-subgroup'
                    onClick={() =>
                      onDeeper({
                        anchorEl: request.anchorEl,
                        title: `${nextField.label} ${groupValueText(value) || 'none'}`,
                        // A level with no filter form still peeks at its rows; Pin then says why it cannot.
                        lenses: spec ? [...request.lenses, spec] : request.lenses,
                        groupBy: request.groupBy.slice(1),
                        rowIds: ids,
                        viewKey: request.viewKey,
                      })
                    }
                    sx={{
                      px: 0.75,
                      height: 22,
                      borderRadius: 999,
                      border: 1,
                      borderColor: 'divider',
                      fontSize: 12,
                      gap: 0.5,
                      '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
                    }}
                  >
                    {groupValueText(value) || 'none'}
                    <Box
                      component='b'
                      sx={{ color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {ids.length}
                    </Box>
                  </ButtonBase>
                );
              })}
            </Stack>
          )}

          <Table
            size='small'
            sx={{ tableLayout: 'fixed', width: '100%', borderTop: 1, borderColor: 'divider' }}
            data-testid='vx-peek-table'
          >
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell
                    key={c}
                    sx={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'none',
                      letterSpacing: 0,
                      color: 'text.secondary',
                      py: 0.75,
                      px: 1.75,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {fieldById(entity, c)?.label ?? c}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.slice(0, PEEK_ROWS).map((r) => {
                const id = derived.rowId(r);
                return (
                  <TableRow key={id} data-testid='vx-peek-row'>
                    {columns.map((c, i) => (
                      <TableCell
                        key={c}
                        sx={{ py: 0.75, px: 1.75, overflow: 'hidden', maxWidth: 0 }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            minWidth: 0,
                            fontSize: 13,
                          }}
                        >
                          <PeekCell entity={entity} name={c} row={r} primary={i === 0} />
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length > PEEK_ROWS && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', px: 1.75, pt: 0.75 }}>
              and {rows.length - PEEK_ROWS} more
            </Typography>
          )}

          <Stack
            direction='row'
            alignItems='center'
            spacing={1}
            sx={{ px: 1.75, py: 1.25, mt: 0.5, borderTop: 1, borderColor: 'divider' }}
          >
            <Typography sx={{ fontSize: 12, color: 'text.disabled', flex: 1 }}>
              <Kbd>Esc</Kbd> close
            </Typography>
            {actionButton(
              <Button
                size='small'
                variant='outlined'
                disabled={!!blocked}
                startIcon={<FilterAltOutlinedIcon sx={{ fontSize: '14px !important' }} />}
                onClick={addAsFilter}
                data-testid='vx-peek-add'
              >
                Add as filter
              </Button>,
            )}
            {actionButton(
              <Button
                size='small'
                variant='contained'
                disabled={!!blocked}
                startIcon={<PushPinOutlinedIcon sx={{ fontSize: '14px !important' }} />}
                onClick={pin}
                data-testid='vx-peek-pin'
              >
                Pin as draft
                <Box
                  component='kbd'
                  aria-hidden
                  sx={{
                    ml: 0.75,
                    fontFamily: 'inherit',
                    fontSize: 10.5,
                    fontWeight: 600,
                    lineHeight: 1,
                    px: 0.5,
                    py: 0.25,
                    border: 1,
                    borderColor: 'currentColor',
                    borderRadius: 0.5,
                    opacity: 0.85,
                  }}
                >
                  P
                </Box>
              </Button>,
            )}
          </Stack>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
