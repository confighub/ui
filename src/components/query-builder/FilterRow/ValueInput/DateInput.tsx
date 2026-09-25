// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { InlineInput } from '../styles';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Trigger to programmatically focus the input */
  focusTrigger?: number;
}

/**
 * Date input for filter values
 * Commits value on blur
 */
export const DateInput = ({
  value,
  onChange,
  onRemove,
  disabled = false,
  autoFocus = false,
  focusTrigger = 0,
}: DateInputProps) => {
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

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
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
      type="date"
      size="small"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      sx={{ minWidth: 130 }}
    />
  );
};
