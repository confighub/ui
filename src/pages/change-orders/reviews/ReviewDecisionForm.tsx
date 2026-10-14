// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The viewer's decision: Approve or Reject, a reason, what the decision covers,
 * and the submit button. Submitting opens the confirm dialog; nothing is
 * recorded from this form directly.
 *
 * The reason is required for both choices (the Note is what other reviewers
 * read), and it is at most 4096 characters, the server's limit.
 */

import { type ReactNode, type Ref } from 'react';
import { Controller, useForm } from 'react-hook-form';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewDangerButtonSx, reviewQuietButtonSx, reviewTextButtonSx } from './reviewButtons';
import { REVIEW_NOTE_MAX, reviewCopy } from './reviewCopy';
import type { ReviewChoice } from './changeOrderReviewTypes';

const copy = reviewCopy.form;

export interface ReviewDecisionValues {
  choice: ReviewChoice | null;
  note: string;
}

interface ReviewDecisionFormProps {
  stageName: string;
  /** Revisions the dry run says the decision covers. `undefined` while unknown. */
  revisionCount?: number;
  /** The coverage list, rendered between the reason and the submit button. */
  coverage: ReactNode;
  /** Why nothing can be submitted (M6: the dry run says nothing would be recorded). Disables submit. */
  blockedReason?: string;
  defaultValues?: ReviewDecisionValues;
  /** Replace mode shows a "Keep my …" cancel instead of the "confirm next" hint. */
  cancelLabel?: string;
  onCancel?: () => void;
  onSubmit: (values: { result: ReviewChoice; note: string }) => void;
  /** Given to the Approve button, so "Review now" can focus it. */
  approveRef?: Ref<HTMLButtonElement>;
  /** Given to the submit button, so the confirm dialog can give focus back. */
  submitRef?: Ref<HTMLButtonElement>;
}

function ChoiceButton({
  value,
  selected,
  onSelect,
  buttonRef,
}: {
  value: ReviewChoice;
  selected: boolean;
  onSelect: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const pass = value === 'Pass';
  const fg = pass ? changeOrderStatus.success : changeOrderStatus.danger;
  const Icon = pass ? CheckIcon : BlockIcon;
  return (
    <Box
      component="button"
      type="button"
      role="radio"
      aria-checked={selected}
      data-choice={value}
      ref={buttonRef}
      onClick={onSelect}
      sx={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: changeOrderType.size.prose,
        fontWeight: changeOrderType.weight.semibold,
        borderRadius: `${changeOrderShape.radius.md}px`,
        border: `1px solid ${changeOrderBorder.strong}`,
        background: changeOrderSurface.card,
        color: changeOrderInk.default,
        '& svg': { fontSize: 15, color: fg },
        '&:hover': { background: changeOrderSurface.sunk },
        '&:focus-visible': { outline: `2px solid ${changeOrderStatus.accent}`, outlineOffset: 2 },
        ...(selected
          ? {
              background: pass ? changeOrderStatus.successGround : changeOrderStatus.dangerSoft,
              color: fg,
              borderColor: pass ? changeOrderStatus.successLine : changeOrderStatus.dangerLine,
              boxShadow: `inset 0 0 0 1.5px ${fg}`,
              '&:hover': { background: pass ? changeOrderStatus.successGround : changeOrderStatus.dangerSoft },
            }
          : {}),
      }}
    >
      <Icon aria-hidden="true" />
      {pass ? copy.approve : copy.reject}
    </Box>
  );
}

export function ReviewDecisionForm({
  stageName,
  revisionCount,
  coverage,
  blockedReason,
  defaultValues = { choice: null, note: '' },
  cancelLabel,
  onCancel,
  onSubmit,
  approveRef,
  submitRef,
}: ReviewDecisionFormProps) {
  const { control, handleSubmit, watch, setValue, formState } = useForm<ReviewDecisionValues>({
    defaultValues,
    shouldFocusError: true,
  });
  const choice = watch('choice');
  const note = watch('note');
  const noteError = formState.errors.note?.message;

  let submitLabel: string = copy.choose;
  let submitSx: object = reviewQuietButtonSx;
  if (choice !== null) {
    submitLabel = copy.submit(choice, revisionCount);
    submitSx = choice === 'Pass' ? reviewQuietButtonSx : reviewDangerButtonSx;
  }

  return (
    <Box
      component="form"
      noValidate
      data-testid="review-form"
      onSubmit={handleSubmit((values) => {
        if (values.choice === null) return;
        onSubmit({ result: values.choice, note: values.note.trim() });
      })}
    >
      <Box
        role="radiogroup"
        aria-label={copy.groupLabel}
        sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}
      >
        <ChoiceButton
          value="Pass"
          selected={choice === 'Pass'}
          onSelect={() => setValue('choice', 'Pass')}
          buttonRef={approveRef}
        />
        <ChoiceButton value="Fail" selected={choice === 'Fail'} onSelect={() => setValue('choice', 'Fail')} />
      </Box>

      <Box sx={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <Box
          component="label"
          htmlFor="review-note"
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: changeOrderType.size.body,
            fontWeight: changeOrderType.weight.semibold,
            color: changeOrderInk.muted,
          }}
        >
          {copy.reasonLabel}
          <Box
            component="span"
            data-testid="review-note-count"
            sx={{ fontWeight: changeOrderType.weight.regular, fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}
          >
            {copy.counter(note.length)}
          </Box>
        </Box>
        <Controller
          name="note"
          control={control}
          rules={{
            validate: (value) => value.trim() !== '' || copy.reasonRequired,
            maxLength: { value: REVIEW_NOTE_MAX, message: copy.counter(REVIEW_NOTE_MAX) },
          }}
          render={({ field: { ref, ...field } }) => (
            <TextField
              {...field}
              inputRef={ref}
              id="review-note"
              multiline
              minRows={3}
              size="small"
              fullWidth
              placeholder={choice === 'Fail' ? copy.placeholderFail(stageName) : copy.placeholderPass}
              error={noteError !== undefined}
              slotProps={{
                htmlInput: {
                  maxLength: REVIEW_NOTE_MAX,
                  'aria-describedby': 'review-note-hint',
                },
              }}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'inherit',
                  fontSize: changeOrderType.size.body,
                  lineHeight: changeOrderType.lineHeight.body,
                  padding: '8px 10px',
                  background: changeOrderSurface.card,
                },
                '& textarea::placeholder': { color: changeOrderInk.subtle, opacity: 1 },
              }}
            />
          )}
        />
        {noteError !== undefined ? (
          <Box
            component="p"
            role="alert"
            id="review-note-hint"
            sx={{ margin: 0, fontSize: changeOrderType.size.small, color: changeOrderStatus.danger, fontWeight: changeOrderType.weight.semibold }}
          >
            {noteError}
          </Box>
        ) : (
          <Box component="p" id="review-note-hint" sx={{ margin: 0, fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
            {copy.hint(choice)}
          </Box>
        )}
      </Box>

      {coverage}

      <Box sx={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Button
          type="submit"
          variant="outlined"
          disabled={choice === null || blockedReason !== undefined}
          disableElevation
          fullWidth
          ref={submitRef}
          data-testid="review-submit"
          sx={{
            ...submitSx,
            height: 36,
            // The same type in every state, the disabled "Choose approve or reject" included.
            '&, &.Mui-disabled': { fontSize: changeOrderType.size.prose, fontWeight: changeOrderType.weight.semibold },
          }}
        >
          {submitLabel}
        </Button>
        {blockedReason !== undefined ? (
          <Box component="span" data-testid="review-submit-blocked" sx={{ fontSize: changeOrderType.size.small, color: changeOrderStatus.warn, textAlign: 'center' }}>
            {blockedReason}
          </Box>
        ) : null}
        {onCancel !== undefined && cancelLabel !== undefined ? (
          <Box component="button" type="button" onClick={onCancel} sx={{ ...reviewTextButtonSx, alignSelf: 'center' }}>
            {cancelLabel}
          </Box>
        ) : (
          <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, textAlign: 'center' }}>
            {copy.confirmNext}
          </Box>
        )}
      </Box>
    </Box>
  );
}
