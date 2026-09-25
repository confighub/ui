// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import Editor, { useMonaco } from '@monaco-editor/react';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';
import { editor } from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';

import { CmpProps } from '../../types';
import { fadeIn } from '../styled';
import {
  Language,
  MonacoLanguageId,
  hasWellKnownKubernetesApiVersion,
  isKubernetesToolchain,
  resolveMonacoLanguage,
} from './language';
import { initMonaco } from './monaco-setup';

export type { Language } from './language';

initMonaco();

// Must be absolute: monaco-yaml resolves nested $refs (all.json -> _definitions.json)
// via `new URL(ref, schemaUri)`, which throws on a path-only base.
const KUBERNETES_SCHEMA_URI = new URL(
  '/schemas/kubernetes/all.json',
  window.location.origin,
).toString();

/**
 * Size ceiling (in bytes of editor content) for the per-document work Monaco
 * does on our behalf. Above it we:
 *   - stop handing monaco-yaml the Kubernetes JSON schema, so the YAML worker
 *     parses/validates nothing against it (by far the dominant cost — the k8s
 *     bundle is thousands of definitions and the whole document is re-validated
 *     on every edit),
 *   - skip the per-line decoration pass (O(lines) on every content change), and
 *   - force the minimap off (it renders the entire document off-screen).
 *
 * 256 KB is roughly 50-100x a typical single Kubernetes manifest (2-5 KB) and
 * still comfortably above a large rendered Helm bundle (tens of KB), so
 * ordinary editing keeps full validation and autocomplete; only genuinely large
 * documents — the multi-MB ones that freeze the tab — lose them.
 *
 * Compared against `String.length` (UTF-16 code units) rather than an exact
 * byte count: config text is overwhelmingly ASCII, so the two agree closely,
 * and `.length` is O(1) where re-encoding a multi-MB string is not.
 */
export const MONACO_SCHEMA_MAX_BYTES = 256 * 1024;

/** True when `content` is past the point where we stop doing per-document work. */
const isOversizedForMonacoSchema = (content: string): boolean =>
  content.length > MONACO_SCHEMA_MAX_BYTES;

export const Container = styled('div')`
  width: 100%;
  animation: ${fadeIn} 0.3s ease-in;
`;

export interface ICodeEditorProps extends CmpProps {
  value: string;
  language?: Language;
  /**
   * Unit ToolchainType (e.g. "Kubernetes/YAML", "AppConfig/INI"). When set,
   * it determines the Monaco language and enables Kubernetes schema-driven
   * autocompletion for "Kubernetes/YAML".
   */
  toolchainType?: string;
  onCodeChanged?: (value: string) => void;
  highlightValues?: Array<string>;
  height?: string | number;
  canEdit?: boolean;
  readonly?: boolean;
  showMinimap?: boolean;
  goToLineValues?: Array<string>;
  /**
   * Opt-in: size the editor to its content height so it scrolls together with
   * its surrounding container instead of trapping the mouse wheel. When set,
   * the wrapper height is driven by Monaco's content size (capped at
   * `maxContentHeight`) and the wheel passes through at the edges. Leave unset
   * to preserve the default fixed-height behavior used by other callers.
   */
  fitContentHeight?: boolean;
  /**
   * Maximum height for `fitContentHeight` mode. A number is treated as pixels;
   * a 'NNvh' string is resolved against `window.innerHeight`. Defaults to '60vh'.
   */
  maxContentHeight?: number | string;
}

/** Resolve a max-height (px number or 'NNvh' string) to a pixel value. */
const resolveMaxContentPx = (maxContentHeight: number | string): number => {
  if (typeof maxContentHeight === 'number') return maxContentHeight;
  const vhMatch = /^(\d+(?:\.\d+)?)vh$/.exec(maxContentHeight.trim());
  if (vhMatch) return (parseFloat(vhMatch[1]) / 100) * window.innerHeight;
  const px = parseFloat(maxContentHeight);
  return Number.isFinite(px) ? px : 0.6 * window.innerHeight;
};

export const CodeEditor = ({
  value,
  className,
  language = 'yaml',
  toolchainType,
  onCodeChanged,
  height,
  canEdit,
  highlightValues,
  readonly = false,
  showMinimap = true,
  goToLineValues,
  fitContentHeight = false,
  maxContentHeight = '60vh',
}: ICodeEditorProps) => {
  const resolvedLanguage: MonacoLanguageId = resolveMonacoLanguage(toolchainType, language);
  const [formattedValue, setFormattedValue] = useState<string>(value);
  // Live editor buffer (formattedValue is the prop-fed value; it doesn't
  // update as the user types). Used to gate K8s schema attachment.
  const [liveContent, setLiveContent] = useState<string>(value);
  // Last value we pushed into the editor model. The editor is uncontrolled
  // (via `defaultValue`); we only imperatively setValue when the `value`
  // prop changes externally (initial load, refetch, revert). Letting the
  // model be the source of truth during typing avoids @monaco-editor/react's
  // controlled-mode reconciliation, which calls executeEdits on every parent
  // re-render and would clobber in-flight edits.
  const lastPushedValueRef = useRef<string>(value);
  const [editorHeight, setEditorHeight] = useState<number>();
  // Content-driven height for `fitContentHeight` mode (capped at maxContentHeight).
  const [fitHeight, setFitHeight] = useState<number>();
  const monaco = useMonaco();
  const [isEditMode, setIsEditMode] = useState(canEdit);
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor>();
  const decorationsRef = useRef<string[]>([]);
  // Disposable for the onDidContentSizeChange listener used by fitContentHeight.
  const contentSizeDisposableRef = useRef<{ dispose: () => void } | null>(null);

  // Dispose the content-size listener on unmount.
  useEffect(() => {
    return () => {
      contentSizeDisposableRef.current?.dispose();
      contentSizeDisposableRef.current = null;
    };
  }, []);

  // Past MONACO_SCHEMA_MAX_BYTES we drop schema validation, the decoration pass
  // and the minimap. See the constant for the reasoning.
  const isOversized = isOversizedForMonacoSchema(liveContent);

  // The size check comes first so a multi-MB document never gets scanned by the
  // apiVersion regex, and the whole thing is memoized so it doesn't re-run on
  // unrelated re-renders.
  const useK8sSchema = useMemo(
    () =>
      !isOversized &&
      isKubernetesToolchain(toolchainType) &&
      hasWellKnownKubernetesApiVersion(liveContent),
    [isOversized, toolchainType, liveContent],
  );

  // Only surfaced where schema validation would otherwise have been available,
  // i.e. Kubernetes YAML. Everything else never had it, so saying so would be
  // noise.
  const showSchemaDisabledNote = isOversized && isKubernetesToolchain(toolchainType);

  useEffect(() => {
    setIsEditMode(canEdit);
  }, [canEdit]);

  const updateEditorHeight = () => {
    const remainingHeight = window.innerHeight - 170 - 50;
    setEditorHeight(remainingHeight);
  };

  useEffect(() => {
    updateEditorHeight();
    window.addEventListener('resize', updateEditorHeight);
    return () => {
      window.removeEventListener('resize', updateEditorHeight);
    };
  }, []);

  const smoothScrollToLine = (lineNumber: number, duration = 300) => {
    if (!editorInstance) return;

    const editorDomNode = editorInstance.getDomNode();
    if (!editorDomNode) return;

    const scrollTop = editorInstance.getScrollTop();
    const targetTop = editorInstance.getTopForLineNumber(lineNumber);

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeInOut = 0.5 - 0.5 * Math.cos(Math.PI * progress);

      const nextScrollTop = scrollTop + (targetTop - scrollTop) * easeInOut;
      editorInstance.setScrollTop(nextScrollTop);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };

  const scrollToLineWithAnimation = (values: Array<string>) => {
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const lines = model.getLinesContent();

    let foundIndex = 0;

    values.forEach((searchTerm) => {
      foundIndex = lines
        .slice(foundIndex)
        .findIndex((line) => line.toLowerCase().includes(searchTerm.toLowerCase()));
    });

    if (foundIndex !== -1) {
      const lineNumber = foundIndex + 1;
      smoothScrollToLine(lineNumber, 400); // 400ms animation
    }
  };

  useEffect(() => {
    if (goToLineValues && goToLineValues.length > 0) {
      scrollToLineWithAnimation(goToLineValues);
    }
  }, [goToLineValues]);

  const handleEditorChange = () => {
    const extraContent = getEditorContent();
    if (extraContent) {
      onCodeChanged?.(extraContent);
      setLiveContent(extraContent);
    }
  };

  useEffect(() => {
    let next = value;
    try {
      const jsonValue = JSON.parse(value);
      next = JSON.stringify(jsonValue, null, 2);
    } catch {
      // not JSON; use raw value
    }
    setFormattedValue(next);
    setLiveContent(next);
  }, [value, language]);

  // Push external value changes into the editor model imperatively. Skipped
  // when the value matches what we last pushed, so this never fires in
  // response to the user's own typing.
  useEffect(() => {
    if (!editorInstance) return;
    if (formattedValue === lastPushedValueRef.current) return;
    lastPushedValueRef.current = formattedValue;
    if (editorInstance.getValue() !== formattedValue) {
      editorInstance.setValue(formattedValue);
    }
  }, [editorInstance, formattedValue]);

  // monaco-yaml is a process-wide singleton: configureMonacoYaml mutates the
  // YAML language service for the whole Monaco runtime, so two CodeEditors
  // mounted at once will overwrite each other's config and only the last to
  // mount/update wins. We accept that because our editors don't overlap; if
  // that changes, this needs to lift to a single shared config keyed off the
  // active editor.
  //
  // We only attach the schema when the doc references a well-known K8s API
  // group (see hasWellKnownKubernetesApiVersion). CRD-only docs would
  // otherwise have every field flagged as unknown.
  //
  // TODO: CRDs aren't in the standard schema. To support CRD-aware
  // completion, invoke the ConfigHub get-resources function with the argument
  // "none" to enumerate the GVKs in this Unit (rather than parsing YAML in
  // the UI), then add per-GVK entries to the schemas array pointing at
  // raw.githubusercontent.com/datreeio/CRDs-catalog/main/{group}/{kind}_{version}.json
  // (same source the backend's lookupCRDPath uses).
  //
  // enableSchemaRequest: true is required because all.json uses relative
  // $refs into _definitions.json.
  useEffect(() => {
    if (!monaco || resolvedLanguage !== 'yaml') return;
    const yamlConfig = configureMonacoYaml(monaco, {
      enableSchemaRequest: true,
      isKubernetes: useK8sSchema,
      schemas: useK8sSchema
        ? [
            {
              uri: KUBERNETES_SCHEMA_URI,
              fileMatch: ['*'],
            },
          ]
        : [],
    });
    return () => {
      yamlConfig.dispose();
    };
  }, [monaco, resolvedLanguage, useK8sSchema]);

  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('confighub-light', {
        base: 'vs',
        inherit: true,
        // GitHub-Light syntax palette. Token colors must be hex WITHOUT a
        // leading '#'. Scope-name variants (e.g. 'string.yaml') are included so
        // colors apply across the YAML/JSON/INI tokens Monaco actually emits.
        rules: [
          { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
          { token: 'comment.yaml', foreground: '6e7781', fontStyle: 'italic' },
          { token: 'string', foreground: '0a3069' },
          { token: 'string.yaml', foreground: '0a3069' },
          { token: 'string.key.json', foreground: '0550ae' },
          { token: 'string.value.json', foreground: '0a3069' },
          { token: 'number', foreground: '0550ae' },
          { token: 'number.yaml', foreground: '0550ae' },
          { token: 'keyword', foreground: 'cf222e' },
          { token: 'keyword.yaml', foreground: 'cf222e' },
          { token: 'type', foreground: '953800' },
          { token: 'type.yaml', foreground: '953800' },
          { token: 'key', foreground: '0550ae' },
          { token: 'key.yaml', foreground: '953800' },
          { token: 'delimiter', foreground: '24292f' },
          { token: 'delimiter.yaml', foreground: '24292f' },
          { token: 'variable', foreground: '24292f' },
          { token: 'variable.yaml', foreground: '24292f' },
          { token: 'constant', foreground: '0550ae' },
          { token: 'operator', foreground: 'cf222e' },
          { token: 'attribute.name', foreground: '0550ae' },
          { token: 'attribute.value', foreground: '0a3069' },
        ],
        colors: {
          'editor.background': '#ffffff',
          'editor.foreground': '#24292f',
          'editorLineNumber.foreground': '#8c959f',
          'editorLineNumber.activeForeground': '#24292f',
          'editor.lineHighlightBackground': '#f6f8fa',
          'editorGutter.background': '#ffffff',
          'editorIndentGuide.background': '#eaeef2',
          'editorIndentGuide.activeBackground': '#d0d7de',
        },
      });
      // Don't set theme globally to avoid interfering with other editors
    }
  }, [monaco]);

  const getEditorContent = () => {
    const model = editorInstance?.getModel();

    if (model) {
      const contentLines = model.getLinesContent();
      return contentLines.join('\n');
    }
    return '';
  };

  // Highlight whole lines containing any of `highlightValues`. This walks every
  // line on every content change, so it's skipped entirely when there's nothing
  // to highlight or the document is oversized; any decorations left over from a
  // previous pass are cleared so nothing goes stale.
  useEffect(() => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;

    if (isOversized || !highlightValues || highlightValues.length === 0) {
      if (decorationsRef.current.length > 0) {
        decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, []);
      }
      return;
    }

    const lines = model.getLinesContent();
    const newDecorations = lines.flatMap((line, index) => {
      const lineNumber = index + 1;
      if (!highlightValues || !monaco) return [];
      const shouldHighlight = highlightValues.some((term) => line.includes(term));

      return shouldHighlight
        ? [
            {
              range: new monaco.Range(lineNumber, 1, lineNumber, 1),
              options: {
                isWholeLine: true,
                className: 'my-line-highlight',
              },
            },
          ]
        : [];
    });

    decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, newDecorations);
  }, [formattedValue, monaco, editorInstance, highlightValues, isOversized]);

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    setEditorInstance(editor);

    if (monaco) {
      monaco.editor.setTheme('confighub-light');
    }

    // Auto-height (opt-in): size the editor container to its content so the
    // surrounding pane scrolls as one continuous list. Capped at
    // maxContentHeight; beyond the cap Monaco's own scrollbar engages, and
    // alwaysConsumeMouseWheel:false lets the wheel pass through at the edges.
    if (fitContentHeight) {
      const applyContentHeight = () => {
        const maxPx = resolveMaxContentPx(maxContentHeight);
        const h = Math.min(maxPx, editor.getContentHeight());
        setFitHeight(h);
        // Drive Monaco's own layout to the new height. @monaco-editor/react
        // also reflows from the height prop (below) + automaticLayout; this
        // immediate call avoids a one-frame flash on content-size changes.
        editor.layout({ width: editor.getLayoutInfo().width, height: h });
      };
      applyContentHeight();
      const sizeDisposable = editor.onDidContentSizeChange(applyContentHeight);
      contentSizeDisposableRef.current = sizeDisposable;
    }

    // Workaround for a Monaco macOS IME-composition bug.
    //
    // Symptom: with the cursor placed mid-line in a populated YAML buffer,
    // defocusing the window and refocusing it would cause the next typed
    // ASCII keystroke to replace the entire current line with the typed
    // character followed by a verbatim copy of several lines below the
    // cursor. The cursor would jump down by however many lines the snippet
    // contained. Repeated typing kept duplicating the YAML.
    //
    // Cause: traced via wrapping `model.applyEdits` and capturing a stack
    // trace. The bug originates in `compositionType` inside monaco-editor
    // 0.52.2 — Monaco's hidden textarea was treating plain ASCII keystrokes
    // as IME composition events after focus transitions, and the
    // composition path computed a `replacePrevCharCnt` spanning the whole
    // current line plus a `text` argument that included adjacent buffer
    // content. This is independent of monaco-yaml, our schema completion,
    // and `@monaco-editor/react`'s value reconciliation — verified by
    // disabling each in turn while the bug persisted, and by switching the
    // language to `plaintext` (which made the bug stop, since plaintext
    // has no language hooks for the composition path to invoke).
    //
    // Workaround: for plain printable keystrokes that aren't part of a real
    // IME composition (`isComposing === false`), preventDefault on the
    // browser event and trigger Monaco's regular `type` command directly
    // with the typed character. This bypasses the textarea/composition
    // pipeline. Real IME use (CJK pinyin, accented composition, dead keys)
    // still works because once a composition is in progress, `isComposing`
    // is true and we fall through to Monaco's default handling.
    //
    // Upstream fix: monaco-editor 0.53+ added `experimentalEditContextEnabled`,
    // which uses the EditContext API and skips the textarea entirely. Once
    // we move past 0.52.2 we can drop this workaround.
    editor.onKeyDown((e) => {
      const ev = e.browserEvent;
      const isPlainPrintable =
        ev.key.length === 1 &&
        !ev.ctrlKey &&
        !ev.altKey &&
        !ev.metaKey &&
        !ev.isComposing;
      if (isPlainPrintable) {
        e.preventDefault();
        e.stopPropagation();
        editor.trigger('keyboard', 'type', { text: ev.key });
      }
    });

    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      editorDomNode.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      // Stop navigation-key propagation so the editor's Escape/Tab/Enter
      // don't reach parent components. Text-editing keys are left to bubble.
      editorDomNode.addEventListener('keydown', (e) => {
        const navigationKeys = ['Escape', 'Tab', 'Enter'];
        if (navigationKeys.includes(e.key) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.stopPropagation();
        }
      });

      editorDomNode.addEventListener(
        'focus',
        (e) => {
          e.stopPropagation();
        },
        true,
      );
    }
  };

  return (
    <>
      {showSchemaDisabledNote && (
        <Box
          data-testid='code-editor-large-file-note'
          sx={{
            px: 1.5,
            py: 0.5,
            fontSize: 12,
            color: 'text.secondary',
          }}
        >
          This file is large, so schema validation and autocomplete are turned off.
        </Box>
      )}
      <Container
        className={className}
        style={{
          height: fitContentHeight ? fitHeight : height ? height : editorHeight,
          width: '100%',
        }}
        onClick={handleContainerClick}
        onMouseDown={handleContainerMouseDown}
      >
        <Editor
          // Non-fit: fill the fixed-height container as before. Fit: use the
          // content-driven pixel height (with an initial value pre-mount so the
          // editor can lay out and report its content size).
          height={fitContentHeight ? (fitHeight ?? 200) : '100%'}
          width='100%'
          onMount={handleEditorMount}
          defaultLanguage={resolvedLanguage}
          language={resolvedLanguage}
          // Uncontrolled. External value updates are pushed via the imperative
          // setValue effect above; @monaco-editor/react's controlled-mode
          // reconciliation calls executeEdits on every parent re-render and
          // would clobber in-flight edits.
          defaultValue={formattedValue}
          theme='confighub-light'
          options={{
            padding: { top: 10 },
            // The minimap renders the whole document off-screen, so it goes
            // away on oversized files regardless of what the caller asked for.
            minimap: { enabled: showMinimap && !isOversized },
            fontSize: 14,
            lineNumbers: 'on',
            automaticLayout: true,
            readOnly: !isEditMode || readonly,
            // Don't auto-pop or auto-accept the suggest widget. monaco-yaml
            // schema-driven completion supplies multi-line snippet items whose
            // `range` covers the whole current line; with the defaults, a
            // single keystroke can land us inside one of those snippets and
            // overwrite the line. Users still get completions explicitly via
            // Ctrl+Space.
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            acceptSuggestionOnCommitCharacter: false,
            inlineSuggest: { enabled: false },
            // Auto-height mode: stop the editor reserving a trailing empty
            // viewport and let the wheel pass through to the surrounding pane at
            // the scroll edges.
            ...(fitContentHeight
              ? {
                  scrollBeyondLastLine: false,
                  scrollbar: { alwaysConsumeMouseWheel: false },
                }
              : {}),
          }}
          onChange={handleEditorChange}
        />
      </Container>
    </>
  );
};
