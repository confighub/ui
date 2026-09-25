// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';

import { AfterCell, PropertyCell, ReviewRow } from './diffStyles';
import { componentTheme } from './componentTheme';
import { validateKey } from './componentKeyUtils';
import type { ResourceInfo } from './configParser';

// Must stay in sync with ComponentValuesSection's INDENT_PX
const INDENT_PX = 12;

/**
 * Describes an active inline composer session.
 * Mirrors the type in ComponentValuesSection.tsx.
 *
 * The `*Path` and `*Id` fields answer two DIFFERENT questions and are not
 * interchangeable:
 *   - `parentPath` composes the new key's real dot-path (and validates it).
 *   - `parentId` / `insertBeforeId` / `insertAfterId` address ROWS in the tree.
 * For an ordinary folder the two coincide, which is why they used to be one field.
 * They must not be: a per-document wrapper row is path-transparent, so EVERY
 * top-level wrapper has the same (empty) path while being a distinct row.
 */
export interface ComposingDescriptor {
  /**
   * Real dot-path of the config container that will own the new key.
   * `''` means a document/root-level key. PATH COMPOSITION ONLY — never compare
   * this against a row's identity: it is not unique across rows.
   */
  parentPath: string;
  /** Identity of the row that hosts the composer as a child. Equals `parentPath` for ordinary folders. */
  parentId: string;
  /** Identity of the row to render the composer after; null = first child of `parentId`. */
  insertAfterId: string | null;
  /** Identity of the row to render the composer before (mutually exclusive with insertAfterId). */
  insertBeforeId?: string | null;
  /** Indentation depth the composer row should use. */
  depth: number;
  /** Adding a leaf key=value or an empty group. */
  mode: 'key' | 'group';
  /**
   * Resource identity of the source document the new key MUST land in, for units
   * holding several documents. Undefined for single-document units, where the
   * write needs no scoping. Without this a new key silently lands in whichever
   * document the writer picks last — a different resource than the user aimed at.
   */
  resource?: ResourceInfo;
}

interface ComposerRowProps {
  desc: ComposingDescriptor;
  allPaths: { path: string; value: string }[];
  onCommit: (desc: ComposingDescriptor, key: string, value: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Inline composer row for adding a new key or group into the component treeview.
 *
 * KEY mode: right-aligned key input + `=` + value input.
 * GROUP mode: key input only + "empty container" hint text.
 *
 * Enter commits (when valid), Escape cancels, × button cancels.
 * Shows an inline red error when the field is touched and invalid.
 */
export function ComposerRow({ desc, allPaths, onCommit, onCancel }: ComposerRowProps): React.ReactNode {
  const [keyValue, setKeyValue] = useState('');
  const [valueValue, setValueValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);

  const validationError = touched ? validateKey(keyValue, desc.parentPath, allPaths) : null;
  const isValid = validateKey(keyValue, desc.parentPath, allPaths) === null;

  const handleCommit = useCallback(async () => {
    setTouched(true);
    if (!isValid || isCommitting) return;
    setIsCommitting(true);
    try {
      await onCommit(desc, keyValue.trim(), valueValue);
    } finally {
      setIsCommitting(false);
    }
  }, [desc, isValid, isCommitting, keyValue, onCommit, valueValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleCommit();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [handleCommit, onCancel],
  );

  const indentPx = 16 + desc.depth * INDENT_PX;

  return (
    <Box sx={{ position: 'relative' }}>
      <ReviewRow
        $plain
        sx={{
          alignItems: 'center',
          background: componentTheme.upgradeMuted,
          borderLeft: `2px solid ${componentTheme.upgrade}`,
          cursor: 'default',
          opacity: isCommitting ? 0.7 : 1,
        }}
      >
        <PropertyCell
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingLeft: `${indentPx}px`,
            gap: '4px',
          }}
        >
          <InputBase
            autoFocus
            value={keyValue}
            onChange={(e) => {
              setKeyValue(e.target.value);
              if (!touched) setTouched(true);
            }}
            onKeyDown={handleKeyDown}
            disabled={isCommitting}
            placeholder="key"
            inputProps={{ 'data-testid': 'composer-key-input', ref: keyRef }}
            sx={{
              fontSize: 11,
              fontFamily: componentTheme.fontMono,
              flex: '0 1 auto',
              minWidth: 80,
              textAlign: 'right',
              '& input': {
                textAlign: 'right',
                padding: '2px 6px',
                height: 21,
                border: `1px solid ${validationError ? componentTheme.danger : componentTheme.accent}`,
                borderRadius: '4px',
                background: componentTheme.bgDefault,
                boxShadow: validationError
                  ? `0 0 0 2px rgba(220,38,38,.12)`
                  : `0 0 0 2px rgba(9,105,218,.08)`,
                boxSizing: 'border-box',
                outline: 'none',
              },
            }}
          />
          {desc.mode === 'key' && (
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontFamily: componentTheme.fontMono,
                color: componentTheme.fgSubtle,
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              =
            </Box>
          )}
        </PropertyCell>

        <AfterCell sx={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'visible' }}>
          {desc.mode === 'key' ? (
            <InputBase
              value={valueValue}
              onChange={(e) => setValueValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isCommitting}
              placeholder="value"
              inputProps={{ 'data-testid': 'composer-value-input' }}
              sx={{
                fontSize: 11,
                fontFamily: componentTheme.fontMono,
                flex: 1,
                minWidth: 60,
                '& input': {
                  padding: '2px 6px',
                  height: 21,
                  border: `1px solid ${componentTheme.borderMuted}`,
                  borderRadius: '4px',
                  background: componentTheme.bgDefault,
                  boxSizing: 'border-box',
                  outline: 'none',
                  '&:focus': {
                    borderColor: componentTheme.accent,
                    boxShadow: `0 0 0 2px rgba(9,105,218,.08)`,
                  },
                },
              }}
            />
          ) : (
            <Box
              sx={{
                fontSize: 11,
                fontFamily: componentTheme.fontSans,
                color: componentTheme.fgSubtle,
                fontStyle: 'italic',
                opacity: 0.75,
                flexShrink: 0,
              }}
            >
              empty container
            </Box>
          )}

          {/* Cancel button */}
          <Box
            component="button"
            onClick={onCancel}
            disabled={isCommitting}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: componentTheme.fgMuted,
              padding: '2px 4px',
              borderRadius: '3px',
              lineHeight: 1,
              flexShrink: 0,
              ml: 'auto',
              transition: 'color .1s, background .1s',
              '&:hover': { color: componentTheme.danger, background: componentTheme.dangerFaint },
            }}
          >
            ×
          </Box>
        </AfterCell>
      </ReviewRow>

      {/* Inline validation error — absolute, below the row */}
      {validationError && (
        <Box
          sx={{
            position: 'absolute',
            top: '100%',
            left: `${indentPx}px`,
            right: 0,
            fontSize: 10,
            fontFamily: componentTheme.fontSans,
            color: componentTheme.danger,
            background: componentTheme.bgDefault,
            borderLeft: `2px solid ${componentTheme.danger}`,
            padding: '2px 6px',
            zIndex: 20,
            lineHeight: 1.4,
          }}
        >
          {validationError}
        </Box>
      )}
    </Box>
  );
}
