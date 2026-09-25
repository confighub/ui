// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';
import { QueryBox, IQueryBoxProps } from '../query-box/QueryBox';

export interface ISearchableQueryBoxProps extends Omit<IQueryBoxProps, 'placeholder'> {
  autoFocus?: boolean;
  enableKeyboardShortcut?: boolean;
  placeholder?: string;
}

export const SearchableQueryBox = ({
  autoFocus = false,
  enableKeyboardShortcut = true,
  ...queryBoxProps
}: ISearchableQueryBoxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enableKeyboardShortcut) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if "/" is pressed and no input is focused
      if (event.key === '/' && !isInputFocused()) {
        event.preventDefault();
        focusSearchInput();
      }
    };

    const isInputFocused = () => {
      const activeElement = document.activeElement;
      return activeElement?.tagName === 'INPUT' || 
             activeElement?.tagName === 'TEXTAREA' ||
             activeElement?.getAttribute('contenteditable') === 'true';
    };

    const focusSearchInput = () => {
      const searchInput = containerRef.current?.querySelector('input[data-testid="query-box"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcut]);

  useEffect(() => {
    if (autoFocus) {
      const searchInput = containerRef.current?.querySelector('input[data-testid="query-box"]') as HTMLInputElement;
      if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
      }
    }
  }, [autoFocus]);

  return (
    <div ref={containerRef}>
      <QueryBox {...queryBoxProps} />
    </div>
  );
};