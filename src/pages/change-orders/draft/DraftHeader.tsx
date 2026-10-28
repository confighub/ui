// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo } from 'react';

import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';

import { StateChip } from '../components/SummaryFacts';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import {
  localDateStamp,
  nameProblems as clientNameProblems,
  suggestDraftName,
  type DraftAddressPatch,
  type DraftTemplate,
} from './draftDecisions';
import { draftPlaceId, focusWhenDrawn } from './draftFocus';
import { PLACE_SX, problemEdgeSx } from './draftLook';
import { RevertButton } from './DraftPopover';
import { DraftProblems } from './DraftProblems';
import type { DraftPastChangeOrder, DraftProblem } from './draftTypes';
import type { DraftKind } from './draftKinds';
import { TemplatePicker } from './TemplatePopover';
import { useDraftField, type DraftFieldSignals, type DraftTextField } from './useDraftField';

const copy = draftCopy.page;

/** The id the blocker focuses when the name holds the first problem. */
export const DRAFT_NAME_INPUT_ID = 'draft-name';
export const DRAFT_NAME_ERROR_ID = 'draft-name-error';
/** The id the blocker focuses when the description holds the first problem. */
export const DRAFT_DESCRIPTION_ID = 'draft-description';

/** The title's type: the detail view's slug heading, in its monospace face. */
const NAME_TYPE = {
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.display,
  fontWeight: changeOrderType.weight.strong,
  lineHeight: changeOrderType.lineHeight.tight,
  letterSpacing: '-.015em',
  padding: '1px 2px',
} as const;

export interface DraftHeaderProps {
  name: string;
  description: string;
  template: DraftTemplate;
  /** The name's problems the page knows of: the client's checks and the server's refusal. */
  nameProblems: readonly DraftProblem[];
  /** The template's and the description's problems, said under the title. */
  titleProblems: readonly DraftProblem[];
  /** The blocker beside Create names the template or the description: their problem carries the rust edge. */
  titleNext: boolean;
  /**
   * Something before the name stops Create, so a problem with the name is not the next one. The
   * name's edge is decided here, from the same check that shows its words, so both come together.
   */
  blockedBeforeName: boolean;
  pastChangeOrders: readonly DraftPastChangeOrder[];
  /** The kind of change each past ChangeOrder made, for the template picker. */
  kindOf: (order: DraftPastChangeOrder) => DraftKind | undefined;
  takenSlugs: ReadonlySet<string>;
  componentName: string;
  /** The Component's slug (or the base Space's): what a name with no last ChangeOrder starts from. */
  nameStem: string;
  onChange: (patch: DraftAddressPatch) => void;
  /** How each field tells the page it holds text the URL has not drawn yet (Create waits for it). */
  fieldSignals: Readonly<Record<DraftTextField, DraftFieldSignals>>;
}

/**
 * The draft's title block: its name as the page's `h1`, editable in place, with the way back
 * to the default name when it is not that; the Draft chip; the template it re-aims; the name's
 * and the template's problems, if they have any; and its description.
 *
 * Each field keeps its own text while it is edited and hands it to the URL when typing pauses
 * (`useDraftField`), so the address is the draft and no keystroke is lost to a navigation. They
 * are plain fields rather than a form: there is nothing to submit until Create.
 */
export const DraftHeader = memo(function DraftHeader({
  name,
  description,
  template,
  nameProblems,
  titleProblems,
  titleNext,
  blockedBeforeName,
  pastChangeOrders,
  kindOf,
  takenSlugs,
  componentName,
  nameStem,
  onChange,
  fieldSignals,
}: DraftHeaderProps) {
  const commitName = useCallback((text: string) => onChange({ name: text }), [onChange]);
  const commitDescription = useCallback((text: string) => onChange({ desc: text }), [onChange]);
  const nameField = useDraftField('name', name, commitName, fieldSignals.name);
  const descriptionField = useDraftField('desc', description, commitDescription, fieldSignals.desc);

  // While typing, the field's own text is checked here; the server's word comes once the URL has it.
  const problem = nameField.pending ? clientNameProblems(nameField.text, takenSlugs)[0] : nameProblems[0];
  const suggestion = useMemo(
    () =>
      suggestDraftName({
        lastSlug: template.kind === 'changeOrder' ? template.changeOrder.slug : undefined,
        stem: nameStem,
        today: localDateStamp(new Date()),
        taken: takenSlugs,
      }),
    [template, nameStem, takenSlugs],
  );
  // An empty name shows the default as a hint, trailing off like a placeholder.
  const placeholder = `${suggestion}…`;
  const invalid = problem !== undefined;
  // The name the URL holds is not the default: the way back to it sits beside the name.
  const named = name !== suggestion;
  const templateStale = titleProblems.some((item) => item.code === 'template-not-found');
  const ink = invalid ? changeOrderStatus.danger : changeOrderInk.default;
  const rule = invalid ? changeOrderStatus.danger : changeOrderBorder.strong;

  return (
    <Box id={draftPlaceId('title')} tabIndex={-1} sx={PLACE_SX}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <Box component="h1" sx={{ margin: 0, font: 'inherit', display: 'block', flex: 'none', maxWidth: '100%' }}>
          {/*
            The field is as wide as the name (or, empty, as its suggestion): a hidden copy of that
            text, in the same type, sizes the grid cell the input fills.
          */}
          <Box
            component="span"
            data-value={nameField.text === '' ? placeholder : nameField.text}
            sx={{
              display: 'inline-grid',
              // The text lines up with the description; the field's padding and caret room hang outside.
              margin: '0 -4px 0 -2px',
              verticalAlign: 'top',
              '&::after': {
                ...NAME_TYPE,
                content: 'attr(data-value)',
                gridArea: '1 / 1',
                visibility: 'hidden',
                whiteSpace: 'pre',
                overflow: 'hidden',
                minWidth: 120,
                // An input scrolls a few pixels sooner than text wraps: room for its caret.
                paddingRight: '4px',
                borderBottom: '1px solid transparent',
              },
            }}
          >
            <InputBase
              id={DRAFT_NAME_INPUT_ID}
              value={nameField.text}
              placeholder={placeholder}
              onChange={(event) => nameField.onChange(event.target.value)}
              onFocus={nameField.onFocus}
              onBlur={nameField.onBlur}
              error={invalid}
              inputProps={{
                'aria-label': copy.nameLabel,
                'aria-invalid': invalid,
                'aria-describedby': invalid ? DRAFT_NAME_ERROR_ID : undefined,
                autoComplete: 'off',
                spellCheck: false,
                translate: 'no',
                name: 'changeorder-name',
              }}
              sx={{
                gridArea: '1 / 1',
                // No width of its own: the hidden copy sizes the cell, and the field fills it.
                width: 0,
                minWidth: '100%',
                font: 'inherit',
                '& .MuiInputBase-input': {
                  ...NAME_TYPE,
                  boxSizing: 'border-box',
                  width: '100%',
                  height: 'auto',
                  color: ink,
                  borderRadius: '3px',
                  borderBottom: `1px dashed ${rule}`,
                  transition: 'background-color .18s, border-color .18s',
                  '&:hover': { background: changeOrderSurface.sunk },
                  '&:focus': {
                    background: changeOrderSurface.sunk,
                    // Two pixels, taken from the bottom padding, so the text does not move.
                    paddingBottom: 0,
                    borderBottom: `2px solid ${invalid ? changeOrderStatus.danger : changeOrderAction.focus}`,
                  },
                  '&::placeholder': { color: changeOrderInk.subtle, opacity: 1 },
                },
              }}
            />
          </Box>
        </Box>
        {named ? (
          <RevertButton
            label={copy.facts.backTo(suggestion)}
            onClick={() => {
              onChange({ name: null });
              focusWhenDrawn(DRAFT_NAME_INPUT_ID, {
                select: true,
                ready: (element) => element instanceof HTMLInputElement && element.value === suggestion,
              });
            }}
          />
        ) : null}
        <StateChip label={copy.draftChip} tone={changeOrderInk.subtle} />
        <TemplatePicker
          template={template}
          stale={templateStale}
          pastChangeOrders={pastChangeOrders}
          kindOf={kindOf}
          componentName={componentName}
          onChange={onChange}
        />
      </Box>
      {invalid ? (
        <Box
          id={DRAFT_NAME_ERROR_ID}
          role="alert"
          sx={{ fontSize: 12, lineHeight: changeOrderType.lineHeight.body, color: changeOrderStatus.danger, marginTop: '2px', ...problemEdgeSx(!blockedBeforeName) }}
        >
          {problem.message}
        </Box>
      ) : null}
      <DraftProblems place="title" problems={titleProblems} next={titleNext} onFix={onChange} />
      <InputBase
        fullWidth
        value={descriptionField.text}
        onChange={(event) => descriptionField.onChange(event.target.value)}
        onFocus={descriptionField.onFocus}
        onBlur={descriptionField.onBlur}
        placeholder={copy.descriptionPlaceholder}
        id={DRAFT_DESCRIPTION_ID}
        inputProps={{ 'aria-label': copy.descriptionLabel, autoComplete: 'off', name: 'changeorder-description' }}
        sx={{
          display: 'block',
          font: 'inherit',
          margin: '6px -2px 0',
          width: 'calc(100% + 4px)',
          '& .MuiInputBase-input': {
            height: 'auto',
            fontFamily: 'inherit',
            fontSize: changeOrderType.size.prose,
            lineHeight: changeOrderType.lineHeight.body,
            color: changeOrderInk.muted,
            padding: '1px 2px',
            borderRadius: '3px',
            transition: 'background-color .18s, box-shadow .18s',
            '&:hover': { background: changeOrderSurface.sunk },
            // Two pixels, as the name's: the house's focus weight.
            '&:focus': { background: changeOrderSurface.sunk, boxShadow: `inset 0 -2px 0 ${changeOrderAction.focus}` },
            '&::placeholder': { color: changeOrderInk.subtle, opacity: 1 },
          },
        }}
      />
    </Box>
  );
});
