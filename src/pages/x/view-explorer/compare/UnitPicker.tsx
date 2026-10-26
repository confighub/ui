// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { LiveRegion } from '@/components/live-region/LiveRegion';
import { LETTER_SX, letterFor } from '@/pages/x/apps/compare/slotLetter';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Skeleton from '@mui/material/Skeleton';
import { styled } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';

import { Kbd } from '../lenses/parts';
import { MAX_COMPARE_SLOTS, addSlot, replaceSlot } from '../model/compare';
import { useExplorerContext } from '../state/context';
import { useResults } from '../state/results-context';
import { type PickerRequest, useCompare } from './compare-context';
import {
  type PickerOption,
  type PickerSection,
  type PickerSectionId,
  upstreamAhead,
} from './suggest';
import { idOf } from './unit-row';
import { SEARCH_LIMIT, usePickerSections } from './usePickerSections';

/**
 * The Unit picker: a search field over a list of Units, in a popover under
 * the control that opened it. With nothing typed it suggests the Units to
 * compare with (the same slug in other Spaces, the upstream, the group in
 * the table); typing searches every Unit the page has loaded.
 *
 * It is a combobox: focus stays in the field, ↑/↓ (and Home/End) move the
 * highlight across the sections, ↵ takes the highlighted Unit and closes,
 * ⇧↵ takes it and stays open for the next slot, whose letter the field
 * shows. Filling slot E closes it. Esc closes it; a comparison it was
 * building is then dropped. Focus goes back to what had it before the picker
 * opened (a row, the rail, the control that opened it).
 *
 * The list follows the field a render late while React catches up; ↵ in
 * that moment takes from what the field says now, never from the old list.
 *
 * A Unit already in a slot is listed with its letter and cannot be taken
 * again, except when replacing a slot, where taking it swaps the two.
 *
 * Opened from a slot, it sits under the slot with its right edge on the
 * slot's, and inside the comparison with 16px to spare.
 */

type Mode = { kind: 'start' } | { kind: 'add' } | { kind: 'replace'; index: number };

export interface UnitPickerProps {
  request: PickerRequest;
  /** What had focus when the picker opened; it takes focus back when nothing is taken. */
  returnTo: HTMLElement | null;
  onClose: () => void;
}

const spaceOf = (row: ExtendedUnitRead | undefined) => row?.Space?.Slug ?? '';

const PICKER_WIDTH = 420;
/** How far inside the comparison a picker opened from a slot keeps. */
const FRAME_INSET = 16;

/**
 * Where a picker opened from a slot goes: its right edge on the slot's, moved
 * left or right only as far as it takes to stay inside the comparison. Null
 * for an opener outside the comparison, which the picker sits under as usual.
 */
function placeInFrame(anchor: HTMLElement | null): { top: number; left: number } | null {
  const frame = anchor?.closest<HTMLElement>('[data-testid="vx-compare-region"]');
  if (!anchor || !frame) return null;
  const at = anchor.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  const width = Math.min(PICKER_WIDTH, window.innerWidth - 2 * FRAME_INSET);
  const left = Math.max(box.left + FRAME_INSET, Math.min(at.right - width, box.right - FRAME_INSET - width));
  return { top: at.bottom, left };
}

const SearchRow = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  color: componentTheme.fgSubtle,
});

const SearchInput = styled('input')({
  flex: 1,
  minWidth: 0,
  border: 'none',
  outline: 'none',
  padding: 0,
  font: `14px ${componentTheme.fontSans}`,
  color: componentTheme.fgDefault,
  background: 'none',
  '&::placeholder': { color: componentTheme.fgSubtle, opacity: 1 },
  '&:disabled': { background: 'none' },
});

const GroupHead = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px 4px',
  fontSize: 12,
  fontWeight: 600,
  color: componentTheme.fgMuted,
});

const GroupHint = styled('span')({
  marginLeft: 'auto',
  fontWeight: 400,
  fontSize: 11.5,
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
});

const Option = styled('div')({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '2px 10px',
  alignItems: 'center',
  padding: '7px 12px',
  cursor: 'pointer',
  '&[aria-selected="true"]': {
    background: componentTheme.bgSubtle,
    boxShadow: `inset 2px 0 0 ${componentTheme.accent}`,
  },
  '&[aria-disabled="true"]': { cursor: 'default', opacity: 0.55 },
});

const OptionTitle = styled('span')({
  fontSize: 13,
  fontWeight: 500,
  color: componentTheme.fgDefault,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

const OptionPlace = styled('span')({ fontWeight: 400, color: componentTheme.fgSubtle });

const OptionMeta = styled('span')({
  gridColumn: 1,
  fontSize: 12,
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

const OptionSide = styled('span')({
  gridRow: '1 / 3',
  gridColumn: 2,
  justifySelf: 'end',
  font: `400 12px ${componentTheme.fontMono}`,
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
});

const Note = styled('div')({
  padding: '14px 12px',
  fontSize: 12.5,
  color: componentTheme.fgMuted,
});

const Footer = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 14px',
  padding: '8px 12px',
  borderTop: `1px solid ${componentTheme.borderDefault}`,
  fontSize: 11.5,
  color: componentTheme.fgSubtle,
  background: componentTheme.bgSubtle,
});

function revisionsAhead(n: number | null, toolchain: string): string {
  if (n === null) return toolchain;
  if (n === 0) return 'Has nothing this Unit has not merged';
  return `${n} ${n === 1 ? 'revision' : 'revisions'} ahead of what this Unit merged`;
}

/**
 * The second line of an option: where the Unit is released to, or for the
 * upstream how far it is ahead. The page holds no release times, so a
 * Target is named without one.
 */
function metaFor(
  section: PickerSectionId,
  row: ExtendedUnitRead,
  base: ExtendedUnitRead | undefined,
): string {
  const toolchain = row.Unit?.ToolchainType ?? '';
  if (section === 'upstream') return base ? revisionsAhead(upstreamAhead(base, row), toolchain) : toolchain;
  return row.Target?.Slug ? `Target ${row.Target.Slug}` : `${toolchain} · No Target`;
}

interface OptionRowProps {
  option: PickerOption;
  section: PickerSectionId;
  base: ExtendedUnitRead | undefined;
  domId: string;
  active: boolean;
  disabled: boolean;
  /** The letter of the slot being replaced; null when the picker fills a slot. */
  replacing: string | null;
  onHover: (id: string) => void;
  onPick: (id: string, keepOpen: boolean) => void;
}

function OptionRow({
  option,
  section,
  base,
  domId,
  active,
  disabled,
  replacing,
  onHover,
  onPick,
}: OptionRowProps) {
  const { row, slot } = option;
  const space = spaceOf(row);
  // The Space is said when it is not the base's (a group of one Space lists slugs alone).
  const place = space && space !== spaceOf(base) ? ` · ${space}` : '';
  const meta = !slot
    ? metaFor(section, row, base)
    : replacing && replacing !== slot
      ? `In slot ${slot} · choosing it swaps ${slot} and ${replacing}`
      : 'Already in the compare';
  return (
    <Option
      id={domId}
      role='option'
      aria-selected={active}
      aria-disabled={disabled || undefined}
      data-testid='vx-picker-option'
      data-unit-id={option.id}
      data-slot={slot}
      onMouseMove={() => {
        if (!active && !disabled) onHover(option.id);
      }}
      // The field keeps focus, so the keys keep working after a click.
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
      onClick={(e: MouseEvent) => {
        if (!disabled) onPick(option.id, e.shiftKey);
      }}
    >
      <OptionTitle>
        {row.Unit?.Slug}
        {place && <OptionPlace>{place}</OptionPlace>}
      </OptionTitle>
      <OptionSide data-testid='vx-picker-option-side'>
        {slot ? (
          <Box
            component='span'
            data-testid='vx-picker-option-slot'
            sx={disabled ? { ...LETTER_SX, background: componentTheme.fgSubtle } : LETTER_SX}
          >
            <Box component='span' sx={visuallyHidden}>
              in slot{' '}
            </Box>
            {slot}
          </Box>
        ) : (
          `rev ${row.Unit?.HeadRevisionNum ?? 0}`
        )}
      </OptionSide>
      <OptionMeta>{meta}</OptionMeta>
    </Option>
  );
}

export function UnitPicker({ request, returnTo, onClose }: UnitPickerProps) {
  const { ids, start, setIds } = useCompare();
  const { universe } = useResults();
  const { toast } = useExplorerContext();
  const uid = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<Mode>(() =>
    request.kind === 'replace'
      ? { kind: 'replace', index: request.index }
      : { kind: request.kind },
  );
  // The comparison being built from the drawer or one picked row; it is only made on ↵.
  const [pending, setPending] = useState<readonly string[]>(() =>
    request.kind === 'start' ? [request.base] : [],
  );
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);

  const taken = mode.kind === 'start' ? pending : ids;
  const baseId = mode.kind === 'replace' ? ids[mode.index] : taken[0];
  const universeRows = universe.rows as ExtendedUnitRead[];
  const base = useMemo(
    () =>
      baseId && universe.entity === 'Unit'
        ? universeRows.find((r) => idOf(r) === baseId)
        : undefined,
    [baseId, universe.entity, universeRows],
  );
  const letter = letterFor(mode.kind === 'replace' ? mode.index : taken.length);
  const replacing = mode.kind === 'replace';

  const data = usePickerSections(base, taken, query);
  const { status, sections, searching, total, universeCount, stale } = data;

  const flat = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  // A Unit in a slot cannot be taken twice; replacing a slot, taking it swaps the two.
  const isDisabled = (o: PickerOption) => !!o.slot && !replacing;
  const enabled = flat.filter((o) => !isDisabled(o));
  const active = enabled.find((o) => o.id === highlight) ?? enabled[0];
  const domId = (id: string) => `${uid}-option-${id}`;

  // The base left the page's Units (deleted, or no longer visible): nothing is left to compare with.
  const gone = status === 'ready' && universeRows.length > 0 && !!baseId && !base;
  useEffect(() => {
    if (!gone) return;
    toast({
      message: 'The Unit to compare with is no longer available.',
      severity: 'warning',
    });
    cancel();
    // Once, when the base goes; cancel is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  // The field is disabled while the Units load; it takes focus once it can.
  useEffect(() => {
    if (status === 'ready') inputRef.current?.focus();
  }, [status]);

  // The highlighted option stays in sight as the keys move it.
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-unit-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const anchor = request.anchor;
  const [framed] = useState(() => (request.kind === 'start' ? null : placeInFrame(anchor)));
  /**
   * Give focus back: with nothing taken, to what had it before the picker
   * opened, else the opener. After a pick in compare mode, to the opener, or
   * the slot that was filled when the opener is gone (the empty slot, once E
   * is filled); after a replace to that slot first, since a swap moves the
   * opener's card to the other slot.
   */
  const refocus = (filled?: { letter: string; first: boolean }) =>
    requestAnimationFrame(() => {
      const slot = () =>
        filled
          ? document.querySelector<HTMLElement>(
              `[data-testid="unit-slot-${filled.letter.toLowerCase()}"]`,
            )
          : null;
      const order = !filled ? [returnTo, anchor] : filled.first ? [slot(), anchor] : [anchor, slot()];
      for (const el of order) {
        if (!el?.isConnected) continue;
        el.focus();
        if (document.activeElement === el) return;
      }
    });

  const cancel = () => {
    onClose();
    refocus();
  };

  const pick = (id: string, keepOpen: boolean, from: readonly PickerOption[] = enabled) => {
    // The next free option after this one takes the highlight, for the next ⇧↵.
    const at = from.findIndex((o) => o.id === id);
    const after = from[at + 1] ?? from[at - 1];
    if (mode.kind === 'start') {
      const next = addSlot(pending, id);
      if (!keepOpen || next.length >= MAX_COMPARE_SLOTS) {
        onClose();
        // Compare mode takes focus; when it ends, focus comes back to where it was before the picker.
        start(next, returnTo ?? anchor);
        return;
      }
      setPending(next);
    } else if (mode.kind === 'add') {
      const next = addSlot(ids, id);
      setIds(next);
      if (!keepOpen || next.length >= MAX_COMPARE_SLOTS) {
        onClose();
        refocus({ letter: letterFor(next.length - 1), first: false });
        return;
      }
    } else {
      setIds(replaceSlot(ids, mode.index, id));
      if (!keepOpen || ids.length >= MAX_COMPARE_SLOTS) {
        onClose();
        refocus({ letter: letterFor(mode.index), first: true });
        return;
      }
      setMode({ kind: 'add' });
    }
    setHighlight(after?.id ?? null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Safari ends a composition with a keydown whose keyCode is 229 and isComposing already false.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const at = active ? enabled.indexOf(active) : -1;
    const moveTo = (i: number) => {
      e.preventDefault();
      const next = enabled[i];
      if (next) setHighlight(next.id);
    };
    switch (e.key) {
      case 'ArrowDown':
        return moveTo(enabled.length ? (at + 1) % enabled.length : 0);
      case 'ArrowUp':
        return moveTo(enabled.length ? (at - 1 + enabled.length) % enabled.length : 0);
      case 'Home':
        return moveTo(0);
      case 'End':
        return moveTo(enabled.length - 1);
      case 'Enter': {
        e.preventDefault();
        if (!stale) {
          if (active) pick(active.id, e.shiftKey);
          return;
        }
        // The list has not caught up with the field: take from what the field says now.
        const now = data.sectionsFor(query).flatMap((s) => s.options).filter((o) => !isDisabled(o));
        const chosen = now.find((o) => o.id === highlight) ?? now[0];
        if (chosen) pick(chosen.id, e.shiftKey, now);
        return;
      }
    }
  };

  const baseSlug = base?.Unit?.Slug ?? '';
  const label = replacing
    ? `Choose a Unit for slot ${letter}`
    : `Choose a Unit to compare with ${baseSlug}`.trimEnd();
  const listboxId = `${uid}-listbox`;
  const ready = status === 'ready';
  const announcement = !ready
    ? ''
    : searching
      ? total === 1
        ? '1 result'
        : `${total} results`
      : `${flat.length} ${flat.length === 1 ? 'suggestion' : 'suggestions'}`;
  const enterLabel =
    mode.kind === 'replace' ? 'replace' : mode.kind === 'add' ? 'add' : 'compare';

  return (
    <Popover
      open
      anchorEl={anchor}
      anchorReference={framed ? 'anchorPosition' : anchor ? 'anchorEl' : 'none'}
      anchorPosition={framed ?? undefined}
      onClose={cancel}
      // Focus goes back by hand: to the opener, or to the slot that was filled when the opener went.
      disableRestoreFocus
      transitionDuration={0}
      anchorOrigin={
        request.kind === 'start'
          ? { vertical: 'bottom', horizontal: 'right' }
          : { vertical: 'bottom', horizontal: 'left' }
      }
      transformOrigin={
        request.kind === 'start'
          ? { vertical: 'top', horizontal: 'right' }
          : { vertical: 'top', horizontal: 'left' }
      }
      slotProps={{
        // Modal for the keys (Tab and the page's shortcuts stay out), but the page is not dimmed.
        backdrop: { invisible: true },
        paper: {
          sx: {
            mt: 0.75,
            boxSizing: 'border-box',
            width: PICKER_WIDTH,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'min(560px, calc(100vh - 96px))',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '10px',
            border: `1px solid ${componentTheme.borderDefault}`,
            boxShadow: componentTheme.shadowMd,
          },
        },
      }}
    >
      <Box
        role='dialog'
        aria-label={label}
        data-testid='vx-picker'
        data-mode={mode.kind}
        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <SearchRow>
          <Box component='span' sx={LETTER_SX} data-testid='vx-picker-letter' aria-hidden>
            {letter}
          </Box>
          <SearchInput
            ref={inputRef}
            autoFocus
            role='combobox'
            aria-label={`Filter Units for slot ${letter}`}
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete='list'
            aria-activedescendant={active ? domId(active.id) : undefined}
            placeholder='Filter Units by slug, Space or Target'
            value={query}
            disabled={!ready}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete='off'
            data-testid='vx-picker-input'
          />
          <Kbd aria-hidden>esc</Kbd>
        </SearchRow>
        <LiveRegion message={announcement} data-testid='vx-picker-status' />

        <Box
          ref={listRef}
          id={listboxId}
          role='listbox'
          aria-label='Units'
          aria-busy={status === 'loading' || stale || undefined}
          data-testid='vx-picker-list'
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            pb: 0.5,
            opacity: stale ? 0.6 : 1,
            transition: 'opacity 120ms',
          }}
        >
          {status === 'loading' && (
            <Box
              sx={{ px: 1.5, py: 1 }}
              data-testid='vx-picker-loading'
              aria-label='Loading Units'
            >
              {[68, 52, 74, 46].map((w) => (
                <Box key={w} sx={{ py: 0.5 }}>
                  <Skeleton variant='text' width={`${w}%`} sx={{ fontSize: 13 }} />
                  <Skeleton variant='text' width={`${w - 18}%`} sx={{ fontSize: 11 }} />
                </Box>
              ))}
            </Box>
          )}
          {status === 'error' && (
            <Alert
              severity='error'
              sx={{ m: 1.5 }}
              data-testid='vx-picker-error'
              action={
                <Button size='small' color='inherit' onClick={data.retry}>
                  Retry
                </Button>
              }
            >
              The Units could not be loaded.
            </Alert>
          )}
          {ready && sections.length === 0 && (
            <Note data-testid='vx-picker-empty' role='presentation'>
              {searching
                ? `No Units match ‘${data.query}’.`
                : universeCount <= taken.length
                  ? 'No other Units to compare with.'
                  : `No suggestions for this Unit. Type to search all ${universeCount} ${universeCount === 1 ? 'Unit' : 'Units'}.`}
            </Note>
          )}
          {ready &&
            sections.map((section: PickerSection) => {
              const headId = `${uid}-group-${section.id}`;
              return (
                <div
                  key={section.id}
                  role='group'
                  aria-labelledby={headId}
                  data-testid='vx-picker-section'
                  data-section={section.id}
                >
                  <GroupHead id={headId} role='presentation'>
                    {section.title}
                    <GroupHint>{section.hint}</GroupHint>
                  </GroupHead>
                  {section.options.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      section={section.id}
                      base={base}
                      domId={domId(option.id)}
                      active={option.id === active?.id}
                      disabled={isDisabled(option)}
                      replacing={replacing ? letter : null}
                      onHover={setHighlight}
                      onPick={pick}
                    />
                  ))}
                </div>
              );
            })}
          {ready && searching && total > SEARCH_LIMIT && (
            <Note
              role='presentation'
              data-testid='vx-picker-cap'
              sx={{ pt: 1, color: componentTheme.fgSubtle }}
            >
              Showing the first {SEARCH_LIMIT} of {total}. Type more to narrow.
            </Note>
          )}
        </Box>

        <Footer aria-hidden data-testid='vx-picker-hints'>
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>↵</Kbd> {enterLabel}
          </span>
          <span>
            <Kbd>⇧↵</Kbd> add and keep the picker open
          </span>
        </Footer>
      </Box>
    </Popover>
  );
}
