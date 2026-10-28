// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The image function's tag, typed inline in its Run row as the other functions' arguments are:
 * the repository, quiet and fixed, then the tag as the one input, then what to know about the tag
 * typed. It reads as the image reference it makes: `ghcr.io/acme/payments-api:1.15.1`.
 *
 * The input is a combobox. On focus and as one types it suggests the next patch, minor and major of
 * the tag the variants run (and of the base's, when the base runs another), and the tags in use in
 * scope; the arrows move through them without moving the caret, Enter takes one, Escape closes
 * the list. A whole image reference pasted in is taken for its tag.
 *
 * The warnings sit beside the tag as compact chips in the warn tone, at most two, so the row stays
 * one line: they give way (truncate) before anything else in the row does.
 */

import { useState } from 'react';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';

import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import type { DraftAddressPatch } from './draftDecisions';
import { draftProblemId } from './draftFocus';
import { type DraftImageWarning, type DraftInvoke, type DraftTagSuggestion, INVOKE_IDS, tagOfPasted } from './draftInvoke';
import { BARE_BUTTON, DRAFT_TRANSITION, POPOVER_PAPER_SX, REDUCED_MOTION } from './draftLook';

const copy = draftCopy.invoke;

/** Where the tag's warnings are said in words, for the input to be described by. */
const WARNINGS_ID = 'draft-invoke-tag-warnings';

/** The problems on the tag that say what the reader must fix: the box turns red for these alone. */
const INVALID_CODES: ReadonlySet<string> = new Set(['tag-format']);

const GROUP_ORDER: Readonly<Record<DraftTagSuggestion['group'], number>> = { variants: 0, base: 1, inUse: 2 };

/**
 * The tag box: the arguments' bordered input, the one thing in the row a reader decides, so its
 * text is set a weight up. As wide as the tag, within bounds.
 */
const TAG_BOX_SX = {
  flex: 'none',
  height: 28,
  boxSizing: 'border-box',
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.md}px`,
  background: changeOrderSurface.card,
  padding: '0 2px 0 8px',
  gap: '2px',
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.body,
  fontWeight: changeOrderType.weight.semibold,
  color: changeOrderInk.default,
  transition: DRAFT_TRANSITION,
  '& input': {
    padding: 0,
    height: 26,
    fieldSizing: 'content',
    minWidth: '9ch',
    maxWidth: '24ch',
    textOverflow: 'ellipsis',
    fontVariantNumeric: 'tabular-nums',
  },
  '& input::placeholder': { color: changeOrderInk.subtle, opacity: 1, fontWeight: changeOrderType.weight.regular },
  '&:hover': { borderColor: changeOrderBorder.strong },
  '&.Mui-focused': { borderColor: changeOrderAction.focus, outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 1 },
  '&[data-invalid]': { borderColor: changeOrderStatus.danger },
  [`@media ${REDUCED_MOTION}`]: { transition: 'none' },
} as const;

/** The chevron inside the box: it opens the suggestions without taking the keyboard from the tag. */
const CHEVRON_SX = {
  ...BARE_BUTTON,
  display: 'inline-grid',
  placeItems: 'center',
  width: 20,
  height: 22,
  borderRadius: '4px',
  color: changeOrderInk.subtle,
  transition: DRAFT_TRANSITION,
  '& .MuiSvgIcon-root': { fontSize: 16, transition: `transform .18s cubic-bezier(.32,.72,0,1)` },
  '&:hover': { background: changeOrderSurface.sunk, color: changeOrderInk.default },
  '&[aria-expanded="true"] .MuiSvgIcon-root': { transform: 'rotate(180deg)' },
  [`@media ${REDUCED_MOTION}`]: { transition: 'none', '& .MuiSvgIcon-root': { transition: 'none' } },
} as const;

/**
 * The repository before the tag: fixed, so quiet. It gives way first when the row is short of
 * room (the warnings keep their short words before it does), cut from its start so the
 * repository's own name stays.
 */
const REPOSITORY_SX = {
  flex: '0 8 auto',
  minWidth: '14ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  // The cut falls at the start, where the registry is, and keeps the repository's name.
  direction: 'rtl',
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.subtle,
} as const;

/** A warning chip: the warn tone's soft fill and line, one size under the row's text. */
const CHIP_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flex: '0 1 auto',
  minWidth: 0,
  height: 22,
  boxSizing: 'border-box',
  padding: '0 8px 0 6px',
  borderRadius: `${changeOrderShape.radius.md}px`,
  border: `1px solid ${changeOrderStatus.warnLine}`,
  background: changeOrderStatus.warnSoft,
  color: changeOrderStatus.warn,
  fontSize: changeOrderType.size.small,
  fontWeight: changeOrderType.weight.medium,
  whiteSpace: 'nowrap',
  cursor: 'default',
  '& .MuiSvgIcon-root': { fontSize: 13, flex: 'none' },
} as const;

const CHIP_TEXT_SX = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } as const;

const LISTBOX_SX = {
  padding: 0,
  maxHeight: 320,
  '& .MuiAutocomplete-option': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '16px',
    minHeight: 0,
    padding: '6px 8px',
    borderRadius: `${changeOrderShape.radius.md}px`,
    transition: DRAFT_TRANSITION,
  },
  '& .MuiAutocomplete-option.Mui-focused': { background: changeOrderSurface.sunk },
  '& .MuiAutocomplete-option[aria-selected="true"]': { background: changeOrderAction.soft, boxShadow: changeOrderSelectedRing },
  '& .MuiAutocomplete-option[aria-selected="true"].Mui-focused': { background: changeOrderAction.soft },
  [`@media ${REDUCED_MOTION}`]: { '& .MuiAutocomplete-option': { transition: 'none' } },
} as const;

const GROUP_HEADING_SX = {
  margin: '4px 8px 4px',
  fontSize: changeOrderType.size.small,
  lineHeight: changeOrderType.lineHeight.body,
  fontWeight: changeOrderType.weight.semibold,
  color: changeOrderInk.subtle,
} as const;

/** How far under its estimated width a form of the warnings is still drawn. */
const SLACK = 12;

/** About how wide a chip draws its words: 12px text, its code in mono, the icon and padding. */
function chipWidth(label: string, code: string | undefined): number {
  return Math.ceil(label.length * 6.4 + (code === undefined ? 0 : code.length * 7.4 + 4) + 32);
}

interface ChipWordsProps {
  label: string;
  code: string | undefined;
}

function ChipWords({ label, code }: ChipWordsProps) {
  return (
    <>
      {label}
      {code === undefined ? null : (
        <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold, marginLeft: '4px' }}>
          {code}
        </Box>
      )}
    </>
  );
}

interface WarningChipProps {
  warning: DraftImageWarning;
}

/** One warning beside the tag: its words in full, or short where the row has less room; the sentence that explains it as its tooltip. */
function WarningChip({ warning }: WarningChipProps) {
  return (
    <Tooltip title={warning.tip} enterDelay={300} placement="bottom-start">
      <Box component="span" data-testid="draft-invoke-tag-warning" data-warning={warning.kind} className="draft-warning" sx={CHIP_SX}>
        <WarningAmberIcon aria-hidden />
        <Box component="span" className="draft-warning-full" sx={CHIP_TEXT_SX}>
          <ChipWords label={warning.label} code={warning.code} />
        </Box>
        <Box component="span" className="draft-warning-short" sx={CHIP_TEXT_SX}>
          <ChipWords label={warning.short.label} code={warning.short.code} />
        </Box>
      </Box>
    </Tooltip>
  );
}

export interface ImageTagWarningsProps {
  warnings: readonly DraftImageWarning[];
}

/**
 * The tag's warnings, in the room the row leaves them: each in full where it fits, short where
 * it does not, one chip with their count where even that does not. The group is its own size
 * container, so which it draws is the browser's measure, not a guess; the words are the same
 * sentences to a screen reader whichever is drawn.
 */
export function ImageTagWarnings({ warnings }: ImageTagWarningsProps) {
  if (warnings.length === 0) return null;
  const gaps = (warnings.length - 1) * 6;
  const full = warnings.reduce((sum, warning) => sum + chipWidth(warning.label, warning.code), gaps);
  const short = warnings.reduce((sum, warning) => sum + chipWidth(warning.short.label, warning.short.code), gaps);
  const tips = warnings.map((warning) => warning.tip).join(' ');
  return (
    <Box
      data-testid="draft-invoke-tag-warnings"
      sx={{
        position: 'relative',
        // Asks for the room its short words take, so the repository gives way for them first.
        flex: `1 1 ${short}px`,
        minWidth: 0,
        height: 28,
        containerType: 'inline-size',
        overflow: 'hidden',
        '& .draft-warning-short, & .draft-warning-count': { display: 'none' },
        // The widths are estimates: a few pixels short, the words' own ellipsis takes it up.
        [`@container (max-width: ${full - SLACK}px)`]: {
          '& .draft-warning-full': { display: 'none' },
          '& .draft-warning-short': { display: 'inline' },
        },
        ...(warnings.length > 1
          ? {
              [`@container (max-width: ${short - SLACK}px)`]: {
                '& .draft-warning': { display: 'none' },
                '& .draft-warning-count': { display: 'inline-flex' },
              },
            }
          : {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', height: '100%', minWidth: 0 }}>
        {warnings.map((warning) => (
          <WarningChip key={warning.kind} warning={warning} />
        ))}
        {warnings.length > 1 ? (
          <Tooltip title={tips} enterDelay={300} placement="bottom-start">
            <Box component="span" className="draft-warning-count" data-testid="draft-invoke-tag-warning-count" sx={CHIP_SX}>
              <WarningAmberIcon aria-hidden />
              <Box component="span" sx={CHIP_TEXT_SX}>
                {copy.warnings.count(warnings.length)}
              </Box>
            </Box>
          </Tooltip>
        ) : null}
      </Box>
      <Box component="span" id={WARNINGS_ID} sx={VISUALLY_HIDDEN_SX}>
        {tips}
      </Box>
    </Box>
  );
}

export interface ImageTagFieldProps {
  invoke: DraftInvoke;
  suggestions: readonly DraftTagSuggestion[];
  /** Whether the warnings are drawn beside the field: the input is described by them. */
  warned: boolean;
  onChange: (patch: DraftAddressPatch) => void;
}

/**
 * The repository and the tag's input. What is typed is the input's own while it has the keyboard;
 * each keystroke is written to the URL, and a value the URL changes from elsewhere (an undo, a
 * container picked) is taken in while it does not.
 */
export function ImageTagField({ invoke, suggestions, warned, onChange }: ImageTagFieldProps) {
  const repository = invoke.containerOption?.repository;
  const [text, setText] = useState(invoke.tag.value);
  const [focused, setFocused] = useState(false);
  if (!focused && text !== invoke.tag.value) setText(invoke.tag.value);
  const [open, setOpen] = useState(false);
  // Typing narrows the list to the suggestions that go on from what is typed; opened otherwise, it lists them all.
  const [narrowing, setNarrowing] = useState(false);
  const typed = text.trim();
  const shown = narrowing && typed !== '' ? suggestions.filter((suggestion) => suggestion.tag.startsWith(typed)) : [...suggestions];
  shown.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
  const listed = open && shown.length > 0;

  const tagProblems = invoke.problems.filter((problem) => problem.focusId === INVOKE_IDS.tag);
  const invalid = tagProblems.some((problem) => INVALID_CODES.has(problem.code));
  const describedBy = [...tagProblems.map(draftProblemId), ...(warned ? [WARNINGS_ID] : [])];
  const write = (next: string) => {
    setText(next);
    if (next !== invoke.tag.value) onChange({ tag: next });
  };
  // An example in the form a tag takes here: the next patch of what the variants run.
  const nextPatch = suggestions.find((suggestion) => suggestion.group === 'variants' && suggestion.hint === copy.suggest.patch)?.tag;
  const placeholder = nextPatch === undefined ? copy.tagPlaceholder : `${nextPatch}…`;
  const groupHeading = (group: string) => {
    const after = suggestions.find((suggestion) => suggestion.group === group)?.after;
    if (group === 'inUse' || after === undefined) return copy.suggest.inUse;
    return (
      <>
        {group === 'variants' ? copy.suggest.variants : copy.suggest.base}{' '}
        <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono }}>
          {after}
        </Box>
      </>
    );
  };

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 0, flex: '0 8 auto' }}>
      {repository === undefined ? null : (
        <>
          <Box component="span" translate="no" title={repository} data-testid="draft-invoke-repository" sx={REPOSITORY_SX}>
            {/* The mark keeps the repository's own order inside the cut-from-the-start box. */}
            <bdi>{repository}</bdi>
          </Box>
          <Box component="span" aria-hidden="true" sx={{ flex: 'none', fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, color: changeOrderInk.subtle, margin: '0 4px 0 1px' }}>
            :
          </Box>
        </>
      )}
      <Autocomplete<DraftTagSuggestion, false, true, true>
        id={INVOKE_IDS.tag}
        freeSolo
        disableClearable
        openOnFocus
        autoHighlight={false}
        selectOnFocus={false}
        handleHomeEndKeys={false}
        options={shown}
        filterOptions={(options) => options}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.tag)}
        isOptionEqualToValue={(option, value) => option.tag === (typeof value === 'string' ? value : value.tag)}
        groupBy={(option) => option.group}
        value={invoke.tag.value}
        inputValue={text}
        open={listed}
        onOpen={() => setOpen(true)}
        // Closed, the list forgets what narrowed it: opened again by the arrows or a click, it lists every suggestion.
        onClose={() => {
          setOpen(false);
          setNarrowing(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInputChange={(_event, value, reason) => {
          // The list's own resets (a value taken, the list closing) are written by `onChange`.
          if (reason !== 'input') return;
          setNarrowing(true);
          setOpen(true);
          write(repository === undefined ? value : tagOfPasted(value, repository));
        }}
        onChange={(_event, value) => {
          write(typeof value === 'string' ? value.trim() : value.tag);
          setNarrowing(false);
        }}
        sx={{ flex: 'none' }}
        slotProps={{
          paper: { sx: { ...POPOVER_PAPER_SX, marginTop: '6px', minWidth: 300 } },
          listbox: { sx: LISTBOX_SX },
          popper: { placement: 'bottom-start', sx: { minWidth: 300 } },
        }}
        renderGroup={(params) => (
          <Box component="li" key={params.key} sx={{ listStyle: 'none', '& + &': { marginTop: '4px', paddingTop: '4px', borderTop: `1px solid ${changeOrderBorder.default}` } }}>
            <Box sx={GROUP_HEADING_SX}>{groupHeading(params.group)}</Box>
            <Box component="ul" sx={{ padding: 0, margin: 0 }}>
              {params.children}
            </Box>
          </Box>
        )}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <Box component="li" key={key} {...rest} data-suggestion={option.tag}>
              <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>
                {option.tag}
              </Box>
              <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, whiteSpace: 'nowrap' }}>
                {option.hint}
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <InputBase
            ref={params.InputProps.ref}
            data-invalid={invalid ? '' : undefined}
            placeholder={placeholder}
            inputProps={{
              ...params.inputProps,
              name: INVOKE_IDS.tag,
              'aria-label': copy.tagLabel(invoke.container.value ?? ''),
              'aria-invalid': invalid ? true : undefined,
              'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
              spellCheck: false,
              translate: 'no',
              'data-testid': 'draft-invoke-tag',
              // A tag longer than the box shows whole on hover.
              title: text.length > 24 ? text : undefined,
            }}
            endAdornment={
              suggestions.length === 0 ? undefined : (
                <Box
                  component="button"
                  type="button"
                  tabIndex={-1}
                  aria-label={copy.showSuggestions}
                  aria-expanded={listed}
                  data-testid="draft-invoke-tag-suggest"
                  // The keyboard stays in the tag: the chevron only opens and closes the list.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    document.getElementById(INVOKE_IDS.tag)?.focus();
                    setNarrowing(false);
                    setOpen(!listed);
                  }}
                  sx={CHEVRON_SX}
                >
                  <ExpandMoreIcon aria-hidden />
                </Box>
              )
            }
            sx={TAG_BOX_SX}
          />
        )}
      />
      <Box component="span" role="status" aria-live="polite" sx={VISUALLY_HIDDEN_SX}>
        {listed ? copy.suggest.count(shown.length) : ''}
      </Box>
    </Box>
  );
}
