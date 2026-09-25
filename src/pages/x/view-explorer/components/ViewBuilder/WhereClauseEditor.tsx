// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { KeyboardEvent, useCallback, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';

import { ViewEntityType } from '../../adapters';
import { useWhereCompletions } from '../../hooks/useWhereCompletions';
import { useWhereDataCompletions } from '../../hooks/useWhereDataCompletions';

/** Shared interface for any completions hook */
interface CompletionsHook {
  suggestions: string[];
  context: string;
  isLoading: boolean;
  onInputChange: (text: string) => void;
  acceptSuggestion: (suggestion: string, currentText: string) => string;
}

interface WhereEditorBaseProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  placeholder: string;
  completions: CompletionsHook;
  contextLabels: Record<string, string>;
}

const SuggestionList = styled(Paper)(({ theme }) => ({
  maxHeight: 220,
  overflowY: 'auto',
  zIndex: theme.zIndex.modal + 1,
  minWidth: 180,
}));

const ContextLabel = styled(Typography)(({ theme }) => ({
  padding: theme.spacing(0.5, 1.5),
  color: theme.palette.text.disabled,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}));

function WhereEditorBase({
  value,
  onChange,
  disabled,
  label,
  placeholder,
  completions,
  contextLabels,
}: WhereEditorBaseProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const { suggestions, context, isLoading, onInputChange, acceptSuggestion } = completions;

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      onInputChange(newValue);
      setOpen(true);
      setHighlightedIndex(0);
    },
    [onChange, onInputChange],
  );

  const handleAccept = useCallback(
    (suggestion: string) => {
      const newText = acceptSuggestion(suggestion, value);
      onChange(newText);
      onInputChange(newText);
      setOpen(true);
      setHighlightedIndex(0);
      inputRef.current?.focus();
    },
    [acceptSuggestion, value, onChange, onInputChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (open && suggestions.length > 0) {
          e.preventDefault();
          handleAccept(suggestions[highlightedIndex]);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [open, suggestions, highlightedIndex, handleAccept],
  );

  const contextLabelText = contextLabels[context] ?? null;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={anchorRef} sx={{ position: 'relative' }}>
        <TextField
          inputRef={inputRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            onInputChange(value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          fullWidth
          size='small'
          placeholder={placeholder}
          label={label}
          multiline
          minRows={2}
          maxRows={5}
          slotProps={{
            input: {
              endAdornment: isLoading ? (
                <InputAdornment position='end'>
                  <CircularProgress size={14} />
                </InputAdornment>
              ) : undefined,
              sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
            },
          }}
        />
        <Popper
          open={open && suggestions.length > 0}
          anchorEl={anchorRef.current}
          placement='bottom-start'
          style={{ zIndex: 1400, width: anchorRef.current?.offsetWidth }}
          modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
        >
          <SuggestionList elevation={4}>
            {contextLabelText && <ContextLabel>{contextLabelText}</ContextLabel>}
            <List dense disablePadding>
              {suggestions.map((s, i) => (
                <ListItemButton
                  key={s}
                  selected={i === highlightedIndex}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAccept(s);
                  }}
                  dense
                  sx={{ py: 0.5 }}
                >
                  <ListItemText
                    primary={s}
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </SuggestionList>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

const WHERE_CONTEXT_LABELS: Record<string, string> = {
  field: 'Field',
  operator: 'Operator',
  value: 'Value',
  'label-key': 'Label key',
  conjunction: 'Conjunction',
};

const WHERE_DATA_CONTEXT_LABELS: Record<string, string> = {
  path: 'Data path',
  operator: 'Operator',
  value: 'Value',
  conjunction: 'Conjunction',
};

interface WhereClauseEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  entityType?: ViewEntityType;
  /**
   * Attribute vocabulary to complete against, when the clause is evaluated
   * somewhere other than the entity the adapter describes. Prefixed names
   * (`Unit.Slug`, `Space.Labels.env`) are understood.
   */
  fields?: string[];
  /** Example clause shown when the field is empty. */
  placeholder?: string;
  label?: string;
}

export function WhereClauseEditor({
  value,
  onChange,
  disabled,
  entityType = 'Unit',
  fields,
  placeholder,
  label,
}: WhereClauseEditorProps) {
  const completions = useWhereCompletions(entityType, fields);
  // The Resource filter actually evaluates against units (resources are
  // synthesised from each matching unit's data) — same vocabulary as a Unit
  // view, slightly different framing in the placeholder.
  const defaultPlaceholder =
    entityType === 'Space'
      ? "Slug LIKE 'app-%' AND Labels.env = 'prod'"
      : "Slug = 'my-unit' AND Labels.env = 'prod'";
  const defaultLabel =
    entityType === 'Resource' ? 'Unit filter (WHERE clause)' : 'Filter (WHERE clause)';
  return (
    <WhereEditorBase
      value={value}
      onChange={onChange}
      disabled={disabled}
      label={label ?? defaultLabel}
      placeholder={placeholder ?? defaultPlaceholder}
      completions={completions}
      contextLabels={WHERE_CONTEXT_LABELS}
    />
  );
}

export function WhereDataClauseEditor({ value, onChange, disabled }: WhereClauseEditorProps) {
  const completions = useWhereDataCompletions();
  return (
    <WhereEditorBase
      value={value}
      onChange={onChange}
      disabled={disabled}
      label='Data filter (WHERE DATA clause)'
      placeholder="metadata.namespace = 'default' AND spec.replicas > 1"
      completions={completions}
      contextLabels={WHERE_DATA_CONTEXT_LABELS}
    />
  );
}
