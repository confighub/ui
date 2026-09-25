// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { useQueryBuilderContext } from '../../QueryBuilderContext';
import type { FieldConfig } from '../../types';
import { InlineInput } from '../styles';

interface TextInputProps {
  config: FieldConfig;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Minimum width for the input */
  minWidth?: number;
  /** Trigger to programmatically focus the input */
  focusTrigger?: number;
}

/**
 * Text input for filter values
 * Commits value on blur or Enter key
 */
export const TextInput = ({
  config,
  value,
  onChange,
  onRemove,
  disabled = false,
  autoFocus = false,
  minWidth = 120,
  focusTrigger = 0,
}: TextInputProps) => {
  const { openAddMenu } = useQueryBuilderContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Focus when focusTrigger changes (operator changed)
  useEffect(() => {
    if (focusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [focusTrigger]);

  const handleCommit = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit();
      (e.target as HTMLInputElement).blur();
      // Open the add filter menu after committing so user can quickly add another filter
      openAddMenu?.();
    } else if (e.key === 'Escape') {
      // If the filter has no committed value and no local value, remove it
      if (value === '' && localValue === '') {
        e.preventDefault();
        onRemove();
      } else {
        // Otherwise just revert to the committed value
        setLocalValue(value);
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === 'Backspace' && localValue === '' && !disabled) {
      // Remove filter when backspace is pressed on empty input
      e.preventDefault();
      onRemove();
    }
  };

  return (
    <InlineInput
      inputRef={inputRef}
      size="small"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      placeholder={config.placeholder}
      disabled={disabled}
      sx={{ minWidth }}
    />
  );
};
