// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Popper, { type PopperProps } from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { pushEscLayer } from '../keys/usePageShortcuts';
import type { Lens, LensSpec } from '../model/types';
import { newId } from '../state/initial';
import { LensLine } from './LensRow';
import { lensLayerProps } from './layer';
import { Kbd } from './parts';
import {
  type Suggestion,
  commitText,
  completeWith,
  readBack,
  splitComposer,
  suggest,
} from './suggest';
import type { LensData } from './useLensData';

/**
 * The add box. At rest it is one line at the top of the column; focused it
 * grows into a 560 px composer over the table, with what it understood on one
 * line below the text ("Understood as space:payments-* is:unreleased · Use ↵").
 * Suggestions open beside the column, so the preview lenses in the column stay
 * in sight; ↑↓ or the pointer previews a suggestion on the real rows (without
 * making a draft), Enter adds, Tab completes.
 *
 * A word that is not understood stays on screen as an error and Enter adds
 * nothing until it is fixed: a typo is never dropped silently.
 */

const COMPOSER_WIDTH = 560;
const SUGGEST_WIDTH = 400;

interface AddLensBoxProps {
  /** The tab the box belongs to. */
  tabId: string;
  /**
   * The half-typed text, held by the column for each tab, so it survives a
   * switch of tab and a trip to text mode (which unmounts this box).
   */
  text: string;
  setText: (text: string) => void;
  data: LensData;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The column's element: suggestions open beside its right edge. */
  columnRef: RefObject<HTMLElement | null>;
  onAdd: (lenses: Lens[]) => void;
  setPreview: (lenses: readonly Lens[]) => void;
}

const toLens = (spec: LensSpec, id: string): Lens => ({ ...spec, id, enabled: true }) as Lens;

/**
 * What the box shows for a text: each word read, the lenses of the complete
 * words, and the suggestions for the word being typed, counted with those
 * lenses already added. One function, so the list on screen and the preview
 * of its n-th item always agree.
 */
function composerState(text: string, data: LensData) {
  const { done, current } = splitComposer(text);
  const reads = readBack(text, data.tokenCtx);
  const doneSpecs = reads.flatMap((r) =>
    r.ok && done.some((w) => w.start === r.word.start) ? [r.spec] : [],
  );
  const suggestions = suggest(current.raw, {
    ...data.tokenCtx,
    // Above the live-count limit nothing is counted: suggestions keep their text-match order.
    count: data.liveCounts ? (spec) => data.countWith([...doneSpecs, spec]) : undefined,
  });
  return { reads, doneSpecs, suggestions };
}

export function AddLensBox({
  tabId,
  text,
  setText,
  data,
  inputRef,
  columnRef,
  onAdd,
  setPreview,
}: AddLensBoxProps) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;
  const lastPreview = useRef('');

  // A tab change keeps the input element (so a focus given in the same event
  // that opened the tab keeps the keys typed next) and starts with no highlight.
  const [seenTab, setSeenTab] = useState(tabId);
  if (seenTab !== tabId) {
    setSeenTab(tabId);
    setHl(-1);
  }

  // The composer state of a text, worked out once: rendering, the arrow keys
  // and the preview all ask for it, and each answer counts rows.
  const stateOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof composerState>>();
    return (t: string) => {
      let v = cache.get(t);
      if (!v) {
        v = composerState(t, data);
        cache.set(t, v);
      }
      return v;
    };
  }, [data]);

  const { current } = splitComposer(text);
  const state = stateOf(text);
  const { reads, doneSpecs, suggestions } = state;
  const from = useMemo(
    () => (data.liveCounts ? data.countWith(doneSpecs) : null),
    [data, doneSpecs],
  );

  /** Show `specs` as preview lenses; skipped when nothing changed, so a re-render does not loop. */
  const preview = useCallback(
    (specs: LensSpec[]) => {
      // The tab is part of the key: the page clears the preview when the tab changes.
      const key = `${tabId}:${JSON.stringify(specs)}`;
      if (key === lastPreview.current) return;
      lastPreview.current = key;
      setPreview(specs.map((s, i) => toLens(s, `preview:${i}`)));
    },
    [setPreview, tabId],
  );

  const previewFor = useCallback(
    (nextText: string, index: number) => {
      const next = stateOf(nextText);
      const s = next.suggestions[index];
      preview(s?.kind === 'lens' ? [...next.doneSpecs, s.spec] : next.doneSpecs);
    },
    [stateOf, preview],
  );

  const close = useCallback(() => {
    setOpen(false);
    setHl(-1);
    preview([]);
  }, [preview]);

  // While the composer is open, Esc closes it first (before any page layer).
  useEffect(
    () =>
      open
        ? pushEscLayer(() => {
            close();
            inputRef.current?.blur();
          })
        : undefined,
    [open, close, inputRef],
  );

  const change = (value: string) => {
    setText(value);
    setOpen(true);
    // A new word highlights its first useful suggestion, so Enter takes it; a bare key list highlights nothing.
    const next = stateOf(value);
    const first = splitComposer(value).current.raw
      ? next.suggestions.findIndex((s) => s.kind === 'lens' && (s.to === null || s.to > 0))
      : -1;
    setHl(first);
    previewFor(value, first);
  };

  const add = (specs: LensSpec[]) => {
    if (!specs.length) return;
    preview([]);
    onAdd(specs.map((s) => toLens(s, newId('lens'))));
    setText('');
    setHl(-1);
  };

  const pick = (s: Suggestion | undefined) => {
    if (!s || s.kind === 'error') return;
    if (s.kind === 'key') {
      const next = completeWith(text, s);
      setText(next);
      setHl(0);
      previewFor(next, 0);
      inputRef.current?.focus();
      return;
    }
    const whole = commitText(text.slice(0, current.start), data.tokenCtx);
    if (!whole.ok) return;
    add([...whole.specs, s.spec]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestions.length) return;
      const n = suggestions.length;
      const next = e.key === 'ArrowDown' ? (hl + 1) % n : (hl - 1 + n) % n;
      setHl(next);
      previewFor(text, next);
    } else if (e.key === 'Tab' && current.raw) {
      const s = suggestions[hl >= 0 ? hl : 0];
      if (!s || s.kind === 'error') return;
      e.preventDefault();
      const next = completeWith(text, s);
      setText(next);
      setHl(-1);
      previewFor(next, -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = hl >= 0 ? suggestions[hl] : undefined;
      if (s && s.kind !== 'error') return pick(s);
      const all = commitText(text, data.tokenCtx);
      if (all.ok) add(all.specs);
    }
  };

  // The suggestions sit beside the column, level with the bottom of the composer.
  const anchor = useMemo<PopperProps['anchorEl']>(
    () => ({
      getBoundingClientRect: () => {
        const col = columnRef.current?.getBoundingClientRect();
        const box = boxRef.current?.getBoundingClientRect();
        const left = Math.min((col?.right ?? 0) + 8, window.innerWidth - SUGGEST_WIDTH - 8);
        const top = (box?.bottom ?? 0) + 6;
        return new DOMRect(left, top, 0, 0);
      },
    }),
    [columnRef],
  );

  const errors = reads.filter((r) => !r.ok);
  const canUse = reads.length > 0 && errors.length === 0;

  return (
    <Box sx={{ position: 'relative', height: 34, flex: 1, minWidth: 0 }}>
      <Box
        ref={boxRef}
        data-testid='vx-composer'
        data-open={open}
        sx={{
          position: open ? 'absolute' : 'relative',
          left: 0,
          top: 0,
          width: open ? `min(${COMPOSER_WIDTH}px, calc(100vw - 120px))` : '100%',
          zIndex: open ? (t) => t.zIndex.modal - 1 : 'auto',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: open ? 'primary.main' : 'divider',
          borderRadius: open ? 1.25 : 1,
          boxShadow: open ? 'var(--sh-md), 0 0 0 3px var(--rust-ring)' : 'none',
          transition: 'border-color .15s, box-shadow .15s',
          '&:hover': { borderColor: open ? 'primary.main' : 'text.disabled' },
        }}
      >
        <Stack
          direction='row'
          alignItems='center'
          spacing={0.875}
          sx={{ height: open ? 40 : 32, pl: 1.25, pr: 1 }}
        >
          <FilterAltOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
          <InputBase
            inputRef={inputRef}
            value={text}
            onChange={(e) => change(e.target.value)}
            onFocus={() => {
              setOpen(true);
              previewFor(text, hl);
            }}
            onBlur={(e) => {
              if (e.relatedTarget instanceof Node && boxRef.current?.contains(e.relatedTarget))
                return;
              close();
            }}
            onKeyDown={onKeyDown}
            placeholder='Filter… space:payments-*'
            inputProps={{
              'aria-label': 'Add a filter',
              'data-testid': 'vx-add-lens',
              spellCheck: false,
              autoComplete: 'off',
              role: 'combobox',
              'aria-expanded': open && suggestions.length > 0,
              'aria-controls': listId,
              'aria-autocomplete': 'list',
              'aria-activedescendant':
                open && hl >= 0 && suggestions[hl] ? optionId(hl) : undefined,
            }}
            sx={{ flex: 1, fontSize: open ? 14 : 13 }}
          />
          {!open && <Kbd aria-hidden>/</Kbd>}
        </Stack>
        {open && reads.length > 0 && (
          <Stack
            direction='row'
            alignItems='center'
            spacing={0.75}
            sx={{ px: 1.25, pb: 0.875, minWidth: 0 }}
            data-testid='vx-readback'
          >
            <Typography
              component='div'
              noWrap
              sx={{ fontSize: 12, color: 'text.disabled', minWidth: 0, flex: 1 }}
            >
              Understood as{' '}
              {reads.map((r) =>
                r.ok ? (
                  <Box
                    key={r.word.start}
                    component='code'
                    sx={{
                      fontFamily: 'inherit',
                      fontWeight: 700,
                      fontSize: 11.5,
                      color:
                        r.spec.kind === 'field' &&
                        (r.spec.op === 'isNot' || r.spec.op === 'notEmpty')
                          ? 'error.main'
                          : 'text.primary',
                      bgcolor: 'action.hover',
                      borderRadius: 0.5,
                      px: 0.625,
                      py: 0.125,
                      mr: 0.375,
                    }}
                  >
                    {r.token}
                  </Box>
                ) : (
                  <Tooltip key={r.word.start} title={r.error}>
                    <Box
                      component='span'
                      data-testid='vx-readback-error'
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.375,
                        fontWeight: 700,
                        fontSize: 11.5,
                        color: 'error.main',
                        bgcolor: 'var(--red-bg)',
                        border: 1,
                        borderColor: 'var(--red-bd)',
                        borderRadius: 0.5,
                        px: 0.625,
                        mr: 0.375,
                      }}
                    >
                      <ErrorOutlineIcon sx={{ fontSize: 12 }} />
                      {r.word.raw}
                      <Box component='span' sx={{ fontWeight: 500 }}>
                        · {r.error}
                      </Box>
                    </Box>
                  </Tooltip>
                ),
              )}
            </Typography>
            {canUse && (
              <ButtonBase
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const all = commitText(text, data.tokenCtx);
                  if (all.ok) add(all.specs);
                }}
                sx={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'primary.main',
                  px: 0.5,
                  borderRadius: 0.5,
                  flexShrink: 0,
                  '&:hover': { bgcolor: 'primary.light' },
                }}
              >
                Use ↵
              </ButtonBase>
            )}
          </Stack>
        )}
        {open && errors.length > 0 && (
          <Typography
            data-testid='vx-readback-blocked'
            sx={{ px: 1.25, pb: 0.875, mt: -0.5, fontSize: 12, color: 'error.main' }}
          >
            {reads.length > errors.length
              ? `Enter adds nothing while ${errors.map((e) => e.word.raw).join(', ')} ${errors.length > 1 ? 'are' : 'is'} here. Remove ${errors.length > 1 ? 'them' : 'it'} to add the rest.`
              : `Enter adds nothing: fix or remove ${errors.map((e) => e.word.raw).join(', ')}.`}
          </Typography>
        )}
      </Box>
      <Popper
        open={open && suggestions.length > 0}
        anchorEl={anchor}
        placement='bottom-start'
        sx={{ zIndex: (t) => t.zIndex.modal }}
        {...lensLayerProps}
      >
        <Paper
          elevation={4}
          onMouseDown={(e) => e.preventDefault()}
          sx={{
            width: SUGGEST_WIDTH,
            maxHeight: 420,
            overflow: 'auto',
            p: 0.5,
            border: 1,
            borderColor: 'divider',
          }}
          data-testid='vx-suggestions'
          role='listbox'
          id={listId}
          aria-label='Filter suggestions'
        >
          <Typography
            variant='caption'
            component='div'
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.disabled',
              px: 1,
              pt: 0.75,
              pb: 0.5,
            }}
          >
            {current.raw
              ? data.liveCounts
                ? 'Suggestions · live counts'
                : 'Suggestions'
              : 'Filter by'}
          </Typography>
          {suggestions.map((s, i) => (
            <SuggestionRow
              key={`${i}:${s.kind}`}
              id={optionId(i)}
              s={s}
              from={from}
              active={i === hl}
              onHover={() => {
                if (s.kind === 'error' || i === hl) return;
                setHl(i);
                previewFor(text, i);
              }}
              onPick={() => pick(s)}
              entity={data.entity}
            />
          ))}
          <Stack
            direction='row'
            spacing={1.5}
            sx={{
              px: 1,
              pt: 0.75,
              pb: 0.5,
              mt: 0.5,
              borderTop: 1,
              borderColor: 'divider',
              color: 'text.disabled',
              fontSize: 11.5,
            }}
          >
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> preview
            </span>
            <span>
              <Kbd>Enter</Kbd> add
            </span>
            <span>
              <Kbd>Tab</Kbd> complete
            </span>
            <span>
              <Kbd>-</Kbd> exclude
            </span>
          </Stack>
        </Paper>
      </Popper>
    </Box>
  );
}

interface SuggestionRowProps {
  id: string;
  s: Suggestion;
  from: number | null;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  entity: LensData['entity'];
}

function SuggestionRow({ id, s, from, active, onHover, onPick, entity }: SuggestionRowProps) {
  if (s.kind === 'error') {
    return (
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        sx={{ height: 32, px: 1, color: 'error.main', fontSize: 13 }}
        data-testid='vx-suggestion-error'
        id={id}
        role='option'
        aria-disabled
        aria-selected={false}
      >
        <ErrorOutlineIcon sx={{ fontSize: 15 }} />
        <span>{s.message}</span>
      </Stack>
    );
  }
  return (
    <ButtonBase
      role='option'
      id={id}
      aria-selected={active}
      tabIndex={-1}
      data-testid='vx-suggestion'
      onMouseMove={onHover}
      onClick={onPick}
      sx={{
        width: '100%',
        height: 32,
        px: 1,
        gap: 1,
        borderRadius: 0.75,
        justifyContent: 'flex-start',
        fontSize: 13,
        bgcolor: active ? 'primary.light' : 'transparent',
      }}
    >
      {s.kind === 'key' ? (
        <>
          <Typography component='span' sx={{ fontWeight: 700, fontSize: 13 }}>
            {s.key}:
          </Typography>
          <Typography
            component='span'
            noWrap
            sx={{
              fontSize: 12.5,
              color: 'text.disabled',
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            {s.field ? s.field.label : 'Status'}
          </Typography>
          <Typography
            component='span'
            sx={{ fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap' }}
          >
            {s.valueCount} values
          </Typography>
        </>
      ) : (
        <>
          <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            {s.freeText && s.spec.kind === 'field' ? (
              <Typography
                noWrap
                component='span'
                sx={{ fontSize: 13, color: 'text.secondary' }}
              >
                name {s.spec.op === 'isNot' ? 'does not contain' : 'contains'}{' '}
                <Box component='b' sx={{ color: 'text.primary' }}>
                  {s.spec.values[0]?.replace(/^\*|\*$/g, '')}
                </Box>
              </Typography>
            ) : (
              <LensLine entity={entity} lens={s.spec} />
            )}
          </Box>
          {s.to !== null && from !== null && (
            <Typography
              component='span'
              sx={{
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                // A suggestion that would leave no rows is a warning, not a quiet grey.
                color: s.to ? (active ? 'primary.main' : 'text.disabled') : 'warning.main',
              }}
            >
              {from} → {s.to}
            </Typography>
          )}
        </>
      )}
    </ButtonBase>
  );
}
