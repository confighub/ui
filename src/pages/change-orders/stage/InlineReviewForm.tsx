// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The approve or reject form, opened in the status box from Approve… or Reject….
 *
 * The server accepts an approval with no note, so whether an approval needs a
 * reason is one flag (`noteRequired`); a rejection always needs one, because the
 * author has to know what to change. When the note is optional, focus goes to
 * Submit so a plain approval is two keystrokes.
 *
 * Ctrl/Cmd+Enter submits, Escape cancels.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha, type Theme } from '@mui/material/styles';

import { REVIEW_NOTE_MAX, reviewCopy } from '../reviews/reviewCopy';
import type { ReviewChoice } from '../reviews/changeOrderReviewTypes';
import { NOTE_COUNTER_FROM, noteRequired, stageCardCopy } from './stageCardCopy';

const copy = stageCardCopy.review;

export interface InlineReviewFormProps {
  choice: ReviewChoice;
  /** The stage whose change is reviewed, for the rejection's placeholder. */
  subjectName: string;
  /** "14 Units in 7 Spaces": what a decision covers, when the coverage is known. */
  coverageText?: string;
  /** Overrides the flag, for a caller that knows better. */
  required?: boolean;
  /** Set when submitting would record nothing: Submit stays unavailable and says why. */
  blockedReason?: string;
  submitting: boolean;
  /** Shown above the field: "A rejection stands." and similar. */
  lead?: ReactNode;
  /** The last attempt failed. */
  error?: string;
  cancelLabel?: string;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}

interface FormValues {
  note: string;
}

const unavailableSx = {
  '&[aria-disabled="true"]': {
    cursor: 'not-allowed',
    color: (t: Theme) => alpha(t.palette.common.black, 0.38),
    borderColor: 'action.disabledBackground',
  },
  '&.MuiButton-contained[aria-disabled="true"]': { bgcolor: 'action.disabledBackground' },
} as const;

/** Helper text in sentence case: the theme's caption styling is for labels, not sentences. */
const helperSx = { mt: '4px', mx: 0, fontSize: '11px', fontWeight: 400, lineHeight: 1.5, letterSpacing: 'normal', textTransform: 'none' } as const;

const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } } as const;

export function InlineReviewForm({
  choice,
  subjectName,
  coverageText,
  required: requiredProp,
  blockedReason,
  submitting,
  lead,
  error,
  cancelLabel,
  onSubmit,
  onCancel,
}: InlineReviewFormProps) {
  const pass = choice === 'Pass';
  const required = requiredProp ?? noteRequired(choice);
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();
  const blockedId = useId();
  const focused = useRef(false);
  const { control, handleSubmit } = useForm<FormValues>({ defaultValues: { note: '' } });
  const note = useWatch({ control, name: 'note' });

  const submit = handleSubmit((values) => {
    if (submitting || blockedReason !== undefined) return;
    onSubmit(values.note.trim());
  });
  const onKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !submitting) {
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };
  /** Focus lands once, when the form opens: the field when a note is needed, else Submit. */
  const focusOnce = (target: 'field' | 'submit') => (el: HTMLElement | null) => {
    if (el === null || focused.current || (target === 'field') !== required) return;
    focused.current = true;
    el.focus();
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={onKeys}
      role="group"
      aria-label={reviewCopy.form.submit(choice, subjectName)}
      data-testid="review-form"
      data-choice={choice}
      sx={{ mt: '12px', display: 'grid', gap: '12px', maxWidth: 560 }}
    >
      {lead}
      <Controller
        name="note"
        control={control}
        rules={{ validate: (value) => !required || value.trim() !== '' || copy.reasonMissing }}
        render={({ field, fieldState }) => (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '6px' }}>
              <Typography component="label" htmlFor={fieldId} variant="subtitle1" sx={{ color: 'text.primary' }}>
                {copy.reasonLabel(required)}
              </Typography>
              {note.length > NOTE_COUNTER_FROM ? (
                <Box component="span" data-testid="review-note-count" sx={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'text.secondary' }}>
                  {copy.counter(note.length)}
                </Box>
              ) : null}
            </Box>
            <TextField
              {...field}
              inputRef={(el: HTMLTextAreaElement | null) => {
                field.ref(el);
                focusOnce('field')(el);
              }}
              id={fieldId}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder={pass ? copy.placeholderPass : copy.placeholderFail(subjectName)}
              error={fieldState.error !== undefined}
              disabled={submitting}
              slotProps={{
                htmlInput: {
                  maxLength: REVIEW_NOTE_MAX,
                  'aria-describedby': [fieldState.error !== undefined ? errorId : '', coverageText !== undefined ? helpId : ''].filter(Boolean).join(' ') || undefined,
                  'aria-invalid': fieldState.error !== undefined,
                  'data-testid': 'review-reason',
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': { minHeight: 64, alignItems: 'flex-start' },
                // The multiline root already pads 8px 12px; the input's own side padding would double it.
                '& .MuiOutlinedInput-input': { px: 0 },
                '& textarea': { resize: 'vertical' },
                '& textarea::placeholder': { color: 'text.disabled', opacity: 1 },
              }}
            />
            {fieldState.error !== undefined ? (
              <FormHelperText id={errorId} error sx={helperSx}>
                {fieldState.error.message}
              </FormHelperText>
            ) : null}
            {coverageText !== undefined ? (
              <FormHelperText id={helpId} sx={{ ...helperSx, color: 'text.secondary' }}>
                {copy.coverageHelp(coverageText)}
              </FormHelperText>
            ) : null}
          </Box>
        )}
      />
      {error !== undefined ? (
        <Box
          data-testid="review-form-error"
          sx={{ p: '8px 12px', bgcolor: 'var(--red-bg)', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-sm)', typography: 'body2', color: 'error.dark' }}
        >
          {error}
        </Box>
      ) : null}
      {blockedReason !== undefined ? (
        <Typography id={blockedId} variant="body2" data-testid="review-submit-blocked" sx={{ color: 'text.secondary' }}>
          {blockedReason}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Button
          type="submit"
          variant={pass ? 'contained' : 'outlined'}
          color="primary"
          ref={focusOnce('submit')}
          aria-disabled={submitting || blockedReason !== undefined ? true : undefined}
          aria-describedby={blockedReason !== undefined ? blockedId : undefined}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}
          data-testid="review-submit"
          data-choice={choice}
          sx={{ ...unavailableSx, ...focusSx }}
        >
          {submitting ? copy.submitting : pass ? copy.submitApproval : copy.submitRejection}
        </Button>
        <Button variant="text" onClick={() => !submitting && onCancel()} aria-disabled={submitting ? true : undefined} data-testid="review-cancel" sx={{ px: '10px', ...unavailableSx, ...focusSx }}>
          {cancelLabel ?? copy.cancel}
        </Button>
      </Box>
    </Box>
  );
}
