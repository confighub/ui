// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  type KeyboardEvent,
  type Ref,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { useEscLayer } from '../state/context';
import type { TextForm } from './analyze';
import { completionEdit } from './completion';
import type { EditorSuggestions, EditorUi } from './editorState';
import { type HighlightKind, type HighlightSpan, highlightTokens, highlightWhere } from './highlight';

/**
 * The text box of text mode: a multi-line MUI textarea with transparent
 * text over a layer that draws the same text in syntax colours, so the
 * caret, selection and typing are the browser's own. The error span gets a
 * wavy underline in the colour layer. Autocomplete opens under the box.
 *
 * The box is controlled: its caret, focus and whether the suggestions were
 * dismissed live with the parent (`EditorUi` in editorState.ts), which works
 * out what is suggested and whether the list is open.
 */

export interface WhereEditorHandle {
  /** Focus the box and select [start, end). */
  select: (start: number, end: number) => void;
  /** Replace the whole text as an edit the box's own undo can take back. */
  replaceAll: (text: string) => void;
}

interface WhereEditorProps {
  value: string;
  onChange: (text: string) => void;
  form: TextForm;
  /** The span to underline, in `value`. */
  errorSpan: { start: number; end: number } | null;
  /** Where the suggestions were worked out for (`EditorUi.caret`). */
  caret: number;
  onUi: (patch: Partial<EditorUi>) => void;
  suggestions: EditorSuggestions;
  /** The id of the element that says whether the text is valid, for `aria-describedby`. */
  describedBy: string;
  editorRef?: Ref<WhereEditorHandle>;
  placeholder?: string;
  /** Why value suggestions carry no counts, shown on their "—" when live counts are off. */
  countsOffHint: string;
}

const COLOR: Record<HighlightKind, string> = {
  keyword: 'info.main',
  field: 'text.primary',
  string: 'success.main',
  number: 'warning.main',
  operator: 'text.secondary',
  punct: 'text.secondary',
  comment: 'text.disabled',
  text: 'text.primary',
};

/** The colour spans, cut where the error span starts and ends. */
function pieces(
  spans: readonly HighlightSpan[],
  err: { start: number; end: number } | null,
): Array<HighlightSpan & { error: boolean }> {
  const out: Array<HighlightSpan & { error: boolean }> = [];
  for (const s of spans) {
    if (!err || s.end <= err.start || s.start >= err.end) {
      out.push({ ...s, error: false });
      continue;
    }
    const a = Math.max(s.start, err.start);
    const b = Math.min(s.end, err.end);
    if (s.start < a) out.push({ ...s, end: a, error: false });
    out.push({ ...s, start: a, end: b, error: true });
    if (b < s.end) out.push({ ...s, start: b, error: false });
  }
  return out;
}

/**
 * Replace [from, to) of a textarea the way typing does, so the browser's undo
 * (⌘Z in the box) takes it back. `insertText` is deprecated but still the only
 * call that joins the undo stack in Chromium, Firefox and Safari; where it is
 * refused, `setRangeText` and an input event still update the value and React.
 */
function insertAsTyping(el: HTMLTextAreaElement, from: number, to: number, text: string) {
  el.focus();
  el.setSelectionRange(from, to);
  const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  if (!done) {
    el.setRangeText(text, from, to, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// One font, size, padding and wrapping for the textarea and the colour layer, so they line up.
const TEXT_SX = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  lineHeight: '20px',
  letterSpacing: 0,
  padding: '10px 12px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'normal',
  tabSize: 2,
} as const;

export function WhereEditor({
  value,
  onChange,
  form,
  errorSpan,
  caret,
  onUi,
  suggestions,
  describedBy,
  editorRef,
  placeholder,
  countsOffHint,
}: WhereEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;
  const { ctx, result, open, index } = suggestions;

  useImperativeHandle(
    editorRef,
    () => ({
      select: (start, end) => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
        onUi({ caret: end, dismissed: true, focused: true });
      },
      replaceAll: (text) => {
        const el = inputRef.current;
        if (!el) return;
        insertAsTyping(el, 0, el.value.length, text);
        onUi({ caret: text.length, dismissed: true });
      },
    }),
    [onUi],
  );

  // Put the caret after an inserted suggestion once React has written the new value.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !inputRef.current) return;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(at, at);
  });

  const close = useCallback(() => onUi({ dismissed: true }), [onUi]);
  useEscLayer(open, close);

  const pick = (i: number) => {
    const item = result.items[i];
    const el = inputRef.current;
    if (!item || ctx.kind === 'none' || !el) return;
    const change = completionEdit(value, ctx, item);
    pendingCaret.current = change.caret;
    insertAsTyping(el, change.from, change.to, change.insert);
    onUi({ caret: change.caret, active: 0 });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Keys that finish an IME composition belong to the IME, not to the list.
    if (e.nativeEvent.isComposing) return;
    // A caret moved by code (a selection set from outside) is not in the state yet: the
    // suggestions are for the old place, so let this key do what it does and catch up.
    const el = e.currentTarget;
    if ((el.selectionStart ?? 0) !== caret) {
      onUi({ caret: el.selectionStart ?? el.value.length });
      return;
    }
    if (!open || result.items.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = result.items.length;
      onUi({ active: (index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
    } else if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      pick(index);
    }
  };

  const readCaret = () => {
    const el = inputRef.current;
    if (el) onUi({ caret: el.selectionStart ?? el.value.length });
  };

  const spans = useMemo(
    () => pieces(form === 'tokens' ? highlightTokens(value) : highlightWhere(value), errorSpan),
    [form, value, errorSpan],
  );
  const listOpen = open && result.items.length > 0;

  return (
    <>
      <Box
        ref={boxRef}
        sx={{
          position: 'relative',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: errorSpan ? 'error.main' : 'divider',
          borderRadius: 1,
          '&:focus-within': {
            borderColor: errorSpan ? 'error.main' : 'primary.main',
            boxShadow: 'var(--sh-sel)',
          },
        }}
        data-testid='vx-text-editor'
      >
        <Box
          component='pre'
          aria-hidden
          data-testid='vx-text-highlight'
          sx={{
            ...TEXT_SX,
            m: 0,
            position: 'absolute',
            inset: 0,
            boxSizing: 'border-box',
            overflow: 'hidden',
            pointerEvents: 'none',
            color: 'text.primary',
          }}
        >
          {spans.map((s) => (
            <Box
              key={`${s.start}-${s.kind}-${s.error ? 'e' : ''}`}
              component='span'
              data-kind={s.kind}
              data-error={s.error || undefined}
              sx={{
                color: COLOR[s.kind],
                ...(s.error && {
                  textDecorationLine: 'underline',
                  textDecorationStyle: 'wavy',
                  textDecorationColor: 'var(--red)',
                  textDecorationThickness: '1.5px',
                  textUnderlineOffset: '3px',
                }),
              }}
            >
              {value.slice(s.start, s.end)}
            </Box>
          ))}
          {/* A trailing line break needs a character after it to take up a line. */}
          {value.endsWith('\n') ? ' ' : null}
        </Box>
        <InputBase
          multiline
          minRows={5}
          fullWidth
          value={value}
          placeholder={placeholder}
          inputRef={inputRef}
          onChange={(e) => {
            onUi({ dismissed: false, active: 0, caret: e.target.selectionStart ?? e.target.value.length });
            onChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || (!open && e.key.startsWith('Arrow')))
              readCaret();
          }}
          onClick={() => {
            readCaret();
            onUi({ dismissed: false });
          }}
          onFocus={(e) => onUi({ focused: true, caret: e.target.selectionStart ?? e.target.value.length })}
          onBlur={() => onUi({ focused: false })}
          inputProps={{
            spellCheck: false,
            autoCapitalize: 'off',
            autoCorrect: 'off',
            'aria-label': 'The filter as text',
            'aria-invalid': !!errorSpan,
            'aria-describedby': describedBy,
            'aria-autocomplete': 'list',
            'aria-expanded': listOpen,
            'aria-controls': listOpen ? listId : undefined,
            'aria-activedescendant': listOpen ? optionId(index) : undefined,
            'data-testid': 'vx-text-input',
          }}
          sx={{
            p: 0,
            display: 'block',
            '& textarea': {
              ...TEXT_SX,
              // MUI's textarea is content-box: with padding it would be wider than the colour layer and wrap elsewhere.
              boxSizing: 'border-box',
              width: '100%',
              display: 'block',
              color: 'transparent',
              caretColor: 'var(--t1)',
              background: 'transparent',
              position: 'relative',
              '&::placeholder': { color: 'text.disabled', opacity: 1, fontFamily: 'var(--font-mono)' },
              '&::selection': { color: 'transparent', bgcolor: 'primary.light' },
            },
          }}
        />
      </Box>
      <Popper
        open={open}
        anchorEl={boxRef.current}
        placement='bottom-start'
        sx={{ zIndex: (t) => t.zIndex.modal, width: boxRef.current?.offsetWidth ?? 320 }}
      >
        <Paper elevation={8} sx={{ mt: 0.5, py: 0.5, maxHeight: 280, overflow: 'auto' }} data-testid='vx-text-suggestions'>
          {result.error ? (
            <Stack direction='row' spacing={0.75} alignItems='flex-start' sx={{ px: 1.25, py: 0.75 }} role='alert'>
              <ErrorOutlineIcon sx={{ fontSize: 15, color: 'error.main', mt: '1px' }} />
              <Typography sx={{ fontSize: 12.5, color: 'error.main', fontWeight: 600 }} data-testid='vx-text-suggest-error'>
                {result.error}
              </Typography>
            </Stack>
          ) : (
            <List dense disablePadding role='listbox' id={listId} aria-label='Suggestions'>
              {result.items.map((item, i) => (
                <ListItemButton
                  key={`${item.kind}-${item.label}`}
                  id={optionId(i)}
                  role='option'
                  aria-selected={i === index}
                  selected={i === index}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(i);
                  }}
                  data-testid='vx-text-suggestion'
                  sx={{ py: 0.375, px: 1.25, gap: 1, minHeight: 0 }}
                >
                  <Typography
                    sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0 }}
                    noWrap
                  >
                    {item.label}
                  </Typography>
                  {item.hint && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }} noWrap>
                      {item.hint}
                    </Typography>
                  )}
                  {item.count !== undefined && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
                      {item.count}
                    </Typography>
                  )}
                  {result.countsOff && item.kind === 'value' && (
                    <Tooltip title={countsOffHint} placement='right'>
                      <Typography
                        component='span'
                        aria-label={countsOffHint}
                        sx={{ fontSize: 11.5, color: 'text.disabled' }}
                        data-testid='vx-text-suggestion-no-count'
                      >
                        —
                      </Typography>
                    </Tooltip>
                  )}
                </ListItemButton>
              ))}
            </List>
          )}
          {!result.error && (
            <Typography
              aria-hidden
              sx={{ fontSize: 11, color: 'text.disabled', px: 1.25, pt: 0.5, borderTop: 1, borderColor: 'divider', mt: 0.5 }}
            >
              Tab or ↵ inserts · ↑↓ chooses · Esc closes
            </Typography>
          )}
        </Paper>
      </Popper>
    </>
  );
}
