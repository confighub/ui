// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { DiffEditor as MonacoDiffEditor, type DiffOnMount } from '@monaco-editor/react';
import { styled } from '@mui/material/styles';

const EditorContainer = styled('div')`
  width: 100%;
  height: 100%;
  min-height: 300px;
`;

interface DiffEditorProps {
  originalContent: string;
  modifiedContent: string;
  language?: string;
  height?: string;
  renderSideBySide?: boolean;
  /** Monaco theme. Defaults to 'vs' (light). */
  theme?: string;
  /**
   * Enable the glyph margin (for clickable gutter decorations). Defaults to
   * false so existing callers' margin layout is unaffected.
   */
  glyphMargin?: boolean;
  /** Called once the diff editor has mounted, for attaching decorations/handlers. */
  onMount?: DiffOnMount;
}

export const DiffEditor = ({
  originalContent,
  modifiedContent,
  language = 'yaml',
  height = '100%',
  renderSideBySide = false,
  theme = 'vs',
  glyphMargin = false,
  onMount,
}: DiffEditorProps) => {
  return (
    <EditorContainer style={{ height }}>
      <MonacoDiffEditor
        original={originalContent}
        modified={modifiedContent}
        language={language}
        theme={theme}
        onMount={onMount}
        options={{
          enableSplitViewResizing: true,
          renderSideBySide,
          readOnly: true,
          glyphMargin,
          minimap: { enabled: false },
          padding: { top: 10 },
          automaticLayout: true,
        }}
      />
    </EditorContainer>
  );
};
