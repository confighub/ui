// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The editor a click on a value opens, in the value's place. Check or Enter stages; X or
// Esc cancels; a click away keeps the draft open. An invalid value keeps the editor open,
// red, with a short error and a disabled check. Staging never writes: the commit writes what is staged.

import { memo, useState, type KeyboardEvent } from 'react';
import { Box, IconButton, InputBase } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { componentTheme } from '../componentTheme';
import { imagePrefixOf, validateValue, type EditorKind } from './editors/validate';

interface FieldEditorProps {
  kind: EditorKind;
  /** The value as the Unit holds it (or as staged). */
  initial: string;
  onStage: (value: string) => void;
  onCancel: () => void;
}

export const FieldEditor = memo(function FieldEditor({ kind, initial, onStage, onCancel }: FieldEditorProps) {
  const image = kind === 'image' ? imagePrefixOf(initial) : undefined;
  const [draft, setDraft] = useState(image ? image.tag : initial);
  const error = validateValue(kind, draft, image?.prefix);
  const stage = () => {
    if (error) return;
    onStage(image ? `${image.prefix}${draft}` : draft);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter' && (kind !== 'multiline' || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      stage();
    }
  };
  const width = `${Math.min(Math.max(draft.length, 4) + 2, 48)}ch`;
  return (
    <span className={`fedit${error ? ' bad' : ''}`} data-testid='field-editor'>
      <span className='fedit-row'>
        {/* An image: the whole reference in one box, the repository grey, only its tag typed. */}
        <Box
          component='span'
          sx={{
            display: 'inline-flex',
            alignItems: 'baseline',
            minWidth: 0,
            maxWidth: '100%',
            width: kind === 'multiline' ? '100%' : image ? 'min(100%, 420px)' : 'auto',
            px: 0.75,
            py: 0.125,
            border: `1px solid ${error ? componentTheme.danger : componentTheme.accent}`,
            borderRadius: `${componentTheme.radiusSm}px`,
            bgcolor: componentTheme.bgDefault,
          }}
        >
          {image && (
            <Box component='span' className='fedit-prefix' sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, color: componentTheme.fgSubtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>
              {image.prefix}
            </Box>
          )}
          <InputBase
            autoFocus
            multiline={kind === 'multiline'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            inputProps={{ 'data-testid': 'field-editor-input', 'aria-invalid': !!error, spellCheck: false }}
            sx={{
              fontFamily: componentTheme.fontMono,
              fontSize: 12,
              minWidth: 0,
              width: kind === 'multiline' ? '100%' : image ? 'auto' : width,
              flex: image ? '1 1 auto' : undefined,
              maxWidth: '100%',
              '& input, & textarea': { p: 0 },
            }}
          />
        </Box>
        <IconButton
          size='small'
          data-testid='field-editor-confirm'
          aria-label='Stage this value'
          disabled={!!error}
          onClick={stage}
          sx={{ p: '2px', color: componentTheme.accent }}
        >
          <CheckIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size='small' data-testid='field-editor-cancel' aria-label='Cancel' onClick={onCancel} sx={{ p: '2px', color: componentTheme.fgSubtle }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </span>
      {error && (
        <span className='fedit-error' data-testid='field-editor-error' role='alert'>
          {error}
        </span>
      )}
    </span>
  );
});
