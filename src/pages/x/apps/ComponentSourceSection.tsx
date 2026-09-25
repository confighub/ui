// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Suspense, lazy, memo, useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';

import { componentTheme } from './componentTheme';

// Monaco (plus monaco-yaml and its workers) is by far the heaviest thing this
// page can pull in, and the treeview — the default view (components.md rule 13)
// — never needs it. Loading it dynamically keeps the whole Monaco chunk out of
// the treeview code path; it's fetched the first time someone opens Source view.
const CodeEditor = lazy(() =>
  import('@/components/code-editor/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

interface ComponentSourceSectionProps {
  /** Base64-encoded unit data (the currently-stored config). */
  data?: string;
  /** Unit ToolchainType (e.g. "Kubernetes/YAML"), used for syntax highlighting. */
  toolchainType?: string;
  /** Active search text — highlighted as whole lines in the editor when present. */
  filterText?: string;
  /** When provided, the editor becomes editable and a save bar appears on change. */
  onSaveData?: (newEncodedData: string) => Promise<void>;
}

/**
 * Source view of a unit's configuration in the component pane.
 *
 * Renders an editable Monaco editor of the current config. When `onSaveData`
 * is provided the editor is writable and a save bar appears on first edit,
 * offering Save (patches the unit's Data) and Discard (resets to stored value).
 */
export const ComponentSourceSection = memo(({
  data,
  toolchainType,
  filterText,
  onSaveData,
}: ComponentSourceSectionProps) => {
  // Decoding is proportional to the size of the unit's data, which can run to
  // megabytes — keep it off the render path except when `data` actually changes.
  const decoded = useMemo(() => data ?? '', [data]);
  const isEmpty = useMemo(() => decoded.trim().length === 0, [decoded]);

  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);

  const handleCodeChange = useCallback((newValue: string) => {
    setEditedContent(newValue);
  }, []);

  const handleSave = useCallback(async () => {
    if (editedContent === null || !onSaveData) return;
    setIsSaving(true);
    try {
      await onSaveData(editedContent);
      setEditedContent(null);
    } finally {
      setIsSaving(false);
    }
  }, [editedContent, onSaveData]);

  const handleDiscard = useCallback(() => {
    setEditedContent(null);
    setEditorResetKey((k) => k + 1);
  }, []);

  if (isEmpty) {
    return (
      <Box data-testid='component-source-section' sx={{ px: 2, py: 2, fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, fontStyle: 'italic' }}>
        No configuration data
      </Box>
    );
  }

  const isDirty = onSaveData && editedContent !== null;

  return (
    // Tagged so callers can assert WHICH units are showing source — the pane
    // can now be in Tree view with a single oversized unit overridden into
    // Source (ComponentSidePane's `sourceOverrideUnitIds`), and "one section,
    // not all of them" is the property that has to be testable.
    <Box data-testid='component-source-section'>
      {isDirty && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          px: 2,
          py: '6px',
          borderBottom: `1px solid ${componentTheme.borderSubtle}`,
          background: componentTheme.bgSubtle,
        }}>
          <Box sx={{ fontSize: 11, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, mr: 'auto' }}>
            Unsaved changes
          </Box>
          <Box
            component="button"
            onClick={handleDiscard}
            disabled={isSaving}
            sx={{
              padding: '3px 10px',
              borderRadius: `${componentTheme.radiusMd}px`,
              border: `1px solid ${componentTheme.borderMuted}`,
              background: 'transparent',
              color: componentTheme.fgMuted,
              fontSize: 12,
              fontFamily: componentTheme.fontSans,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background .12s, color .12s',
              '&:hover': { background: componentTheme.bgInset, color: componentTheme.fgDefault },
              '&:disabled': { opacity: 0.5, cursor: 'default' },
            }}
          >
            Discard
          </Box>
          <Box
            component="button"
            onClick={() => { void handleSave(); }}
            disabled={isSaving}
            sx={{
              padding: '3px 10px',
              borderRadius: `${componentTheme.radiusMd}px`,
              border: `1px solid ${componentTheme.accent}`,
              background: componentTheme.accent,
              color: componentTheme.fgOnEmphasis,
              fontSize: 12,
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background .12s',
              '&:hover': { background: componentTheme.accentEmphasis },
              '&:disabled': { opacity: 0.5, cursor: 'default' },
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Box>
        </Box>
      )}
      <Suspense
        fallback={
          <Box
            sx={{
              px: 2,
              py: 2,
              fontSize: 12,
              fontFamily: componentTheme.fontSans,
              color: componentTheme.fgMuted,
            }}
          >
            Loading editor…
          </Box>
        }
      >
        <CodeEditor
          key={editorResetKey}
          value={decoded}
          toolchainType={toolchainType}
          // Size the editor to its content so the side pane scrolls as one
          // continuous list instead of trapping the wheel. Tall files cap at
          // maxContentHeight and the editor's own scrollbar takes over.
          fitContentHeight
          maxContentHeight='60vh'
          highlightValues={filterText ? [filterText] : undefined}
          onCodeChanged={onSaveData ? handleCodeChange : undefined}
          canEdit={!!onSaveData}
          showMinimap={false}
        />
      </Suspense>
    </Box>
  );
});

ComponentSourceSection.displayName = 'ComponentSourceSection';
