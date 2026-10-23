// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { getAdapter } from '../adapters';
import { Section } from '../lenses/parts';
import { noun } from '../lenses/layer';
import { useLensData } from '../lenses/useLensData';
import { liveCountsOffText } from '../model/counts';
import { lensSignature, termsToSpecs } from '../model/lens-compile';
import { parseWhere } from '../model/where/parser';
import { splitTextLines } from '../model/where/format';
import { lensesToTokens } from '../model/tokens';
import type { EntityKind, Lens } from '../model/types';
import { useExplorerContext } from '../state/context';
import { lensIdGen } from '../state/initial';
import { useActiveTab, useDispatch, useWork } from '../state/useExplorer';
import {
  type AnalyzeContext,
  analysisLenses,
  analyzeText,
  attributeKnowledge,
  lineAndColumn,
  lensesToText,
  unknownAttributeMessage,
  unwrittenNote,
} from './analyze';
import { type CompletionEnv, completionContext } from './completion';
import { ExtraFields } from './ExtraFields';
import { resourceTypeProblem, whereDataProblem } from './extraChecks';
import { takeLensSelection, usePendingLensSelection } from './selection';
import { useServerValidate } from './useServerValidate';
import { type EditorUi, INITIAL_EDITOR_UI, useEditorSuggestions } from './editorState';
import { WhereEditor, type WhereEditorHandle } from './WhereEditor';

/**
 * Text mode: the whole filter as the WHERE it is saved as, in the lens
 * column, with the rows live beside it. Valid text applies 300 ms after typing
 * stops, once the server has accepted it, and makes a draft like any other
 * change. While the text is wrong nothing is applied and the last valid
 * result stays on screen. The same box reads `key:value` tokens.
 */

// Long enough that typing a word sends nothing: each valid text the server sees costs one
// check here and, once applied, one match-set request per Custom WHERE lens.
const APPLY_DELAY_MS = 300;

/** A filter without lens ids, to tell a change made here from one made elsewhere. */
function filterSignature(entity: EntityKind, lenses: readonly Lens[], resourceType: string, whereData: string): string {
  return JSON.stringify([entity, lenses.map(lensSignature), resourceType.trim(), whereData.trim()]);
}

let throwawayId = 0;
const throwawayIdGen = () => `t${++throwawayId}`;

interface Draft {
  text: string;
  resourceType: string;
  whereData: string;
}

/** A draft that stopped changing: what to check and apply, for the generation it was typed in. */
interface Settled extends Draft {
  generation: number;
}

export function TextMode() {
  const work = useWork();
  const tabId = useActiveTab().id;
  const dispatch = useDispatch();
  const { toast } = useExplorerContext();
  const data = useLensData();
  const entity = work.entity;
  const unitsOnly = entity === 'Unit';

  const asText = useMemo(() => lensesToText(entity, work.lenses), [entity, work.lenses]);
  const workSig = filterSignature(entity, work.lenses, work.resourceType, work.whereData);
  const writtenSig = useMemo(() => {
    const unwritten = new Set(asText.unwritten.map((l) => l.id));
    return filterSignature(
      entity,
      work.lenses.filter((l) => !unwritten.has(l.id)),
      work.resourceType,
      work.whereData,
    );
  }, [entity, work.lenses, work.resourceType, work.whereData, asText.unwritten]);

  const fromWork = (): Draft => ({ text: asText.text, resourceType: work.resourceType, whereData: work.whereData });
  const [draft, setDraft] = useState<Draft>(fromWork);
  /** The text as it was last loaded from the view: unchanged text is the view, whatever it parses to. */
  const [base, setBase] = useState<Draft>(fromWork);
  const viewKey = `${tabId}|${workSig}`;
  const [syncedKey, setSyncedKey] = useState(viewKey);
  /** The filter this box just applied, until the view shows it (on a new tab, when it forked "All units"). */
  const [ownSig, setOwnSig] = useState<string | null>(null);
  /** Bumped by every change made elsewhere; an edit typed before it is never applied after it. */
  const [generation, setGeneration] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  if (viewKey !== syncedKey) {
    setSyncedKey(viewKey);
    if (ownSig !== null && workSig === ownSig) {
      // Our own change arriving: keep the text and whatever is still being typed.
      setOwnSig(null);
    } else {
      // A change made elsewhere (another tab, Undo, Discard, the toolbar) replaces the text
      // and drops whatever was waiting to apply.
      const next = fromWork();
      setDraft(next);
      setBase(next);
      setGeneration((g) => g + 1);
      setSettled(null);
      setOwnSig(null);
    }
  }

  const [ui, setUi] = useState<EditorUi>(() => ({ ...INITIAL_EDITOR_UI, caret: asText.text.length }));
  const onUi = useCallback((patch: Partial<EditorUi>) => setUi((u) => ({ ...u, ...patch })), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The filter this box last dispatched, so the tab change of a fork it causes shows no "not applied" note. */
  const lastApplied = useRef<string | null>(null);
  const editorRef = useRef<WhereEditorHandle | null>(null);
  const statusId = useId();

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const generationRef = useRef(generation);
  generationRef.current = generation;
  const edit = useCallback((patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    // The generation is taken now, when the text was typed, not when the timer fires.
    const typedIn = generationRef.current;
    timer.current = setTimeout(() => setSettled({ ...next, generation: typedIn }), APPLY_DELAY_MS);
  }, []);

  const extraNames = useMemo(() => getAdapter(entity).filterFields, [entity]);
  const knowledge = useMemo(() => attributeKnowledge(entity, extraNames), [entity, extraNames]);
  const actx = useMemo<AnalyzeContext>(
    () => ({ entity, tokens: data.tokenCtx, knowledge }),
    [entity, data.tokenCtx, knowledge],
  );
  // The applied lens the term under the caret stands for: the k-th enabled lens on its field,
  // when the term is the k-th term on that field in the text.
  const editingLensId = useCallback(
    (fieldId: string): string | null => {
      const ctx = completionContext(draft.text, ui.caret);
      if (ctx.kind !== 'value') return null;
      const { main } = splitTextLines(draft.text);
      // The whole terms before this one (up to its AND), read as lenses: count the field lenses
      // on this field, so a Custom WHERE term on the same attribute is not counted.
      const before = main.slice(0, ctx.from);
      const lastAnd = [...before.matchAll(/(^|\s)AND\s/g)].pop();
      const and = lastAnd?.index !== undefined ? lastAnd.index + lastAnd[1].length : -1;
      const parsed = and > 0 ? parseWhere(before.slice(0, and)) : null;
      const earlier = parsed?.ok
        ? termsToSpecs(
            entity,
            parsed.terms.map((term) => ({ term, source: before.slice(term.start, term.end) })),
          )
        : [];
      const k = earlier.filter((spec) => spec.kind === 'field' && spec.field === fieldId).length;
      const applied = work.lenses.filter((l) => l.enabled && l.kind === 'field' && l.field === fieldId);
      return applied[k]?.id ?? null;
    },
    [draft.text, ui.caret, work.lenses, entity],
  );
  const countsOn = data.liveCounts;
  const env = useMemo<CompletionEnv>(
    () => ({
      entity,
      labelKeys: data.tokenCtx.labelKeys,
      extraAttributes: extraNames,
      knowledge,
      // A value is suggested for the term under the caret, so it is counted against the other
      // terms only: that term's applied lens (its old value) is left out, as the lens popover
      // does for the lens it edits.
      // Above the live-count limit counting every value is too slow to do per keystroke:
      // the known values are listed in the catalog's own (numeric-aware) order, with no counts.
      values: (fieldId) =>
        countsOn
          ? data
              .valuesWithCounts(fieldId, editingLensId(fieldId))
              .map((v) => ({ value: v.value, count: v.count ?? undefined }))
              .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
          : data.tokenCtx.values(fieldId).map((value) => ({ value })),
      countsOff: !countsOn,
    }),
    [entity, data, extraNames, knowledge, editingLensId, countsOn],
  );

  const analysis = useMemo(() => analyzeText(draft.text, actx), [draft.text, actx]);
  const suggestions = useEditorSuggestions(draft.text, analysis.form, env, ui);
  const suggesting = suggestions.open;
  // A settled edit from before a change made elsewhere (a tab switch included) is dropped.
  const current = settled && settled.generation === generation ? settled : null;
  const settledAnalysis = useMemo(
    () => (current ? analyzeText(current.text, actx) : null),
    [current, actx],
  );
  const extraProblem = unitsOnly
    ? (resourceTypeProblem(draft.resourceType) ?? whereDataProblem(draft.whereData))
    : null;
  const settledExtraOk =
    !!current &&
    (!unitsOnly || (!resourceTypeProblem(current.resourceType) && !whereDataProblem(current.whereData)));

  const request = useMemo(
    () =>
      current &&
      settledAnalysis?.status === 'ok' &&
      settledExtraOk &&
      settledAnalysis.validationWhere
        ? {
            where: settledAnalysis.validationWhere,
            whereData: unitsOnly ? current.whereData : undefined,
            resourceType: unitsOnly ? current.resourceType : undefined,
          }
        : null,
    [current, settledAnalysis, settledExtraOk, unitsOnly],
  );
  const check = useServerValidate(entity, request);

  // Apply once the text has settled and (when it says anything) the server has accepted it.
  // WHY an effect: the server's answer arrives through RTK Query, from outside React's events.
  useEffect(() => {
    if (!current || !settledAnalysis || !settledExtraOk) return;
    if (settledAnalysis.status === 'error') return;
    if (request && check.status !== 'ok') return;
    const lenses = settledAnalysis.status === 'ok' ? analysisLenses(entity, settledAnalysis, lensIdGen) : [];
    const resourceType = unitsOnly ? current.resourceType.trim() : '';
    const whereData = unitsOnly ? current.whereData.trim() : '';
    const nextSig = filterSignature(entity, lenses, resourceType, whereData);
    setSettled(null);
    if (nextSig === writtenSig && asText.unwritten.length === 0 && asText.raw.length === 0) return;
    setOwnSig(nextSig);
    // Applying on "All units" forks a new tab: that tab change is this edit arriving, not a leave.
    lastApplied.current = nextSig;
    dispatch({ type: 'replaceFilter', lenses, resourceType, whereData });
  }, [current, settledAnalysis, settledExtraOk, request, check.status, entity, unitsOnly, writtenSig, asText.unwritten.length, asText.raw.length, dispatch]);

  // A click on a Custom WHERE lens asks for its text to be selected.
  const pendingSelection = usePendingLensSelection();
  useEffect(() => {
    if (!pendingSelection) return;
    const id = takeLensSelection();
    const range = id ? asText.ranges.get(id) : undefined;
    // WHY an effect: it reads an outside store and moves DOM focus, after the editor has mounted.
    if (range) editorRef.current?.select(range.start, range.end);
  }, [pendingSelection, asText.ranges]);

  // What the text means now, ignoring ids: equal to the view's when it is applied.
  const liveSig = useMemo(() => {
    if (analysis.status === 'error') return null;
    const lenses = analysis.status === 'ok' ? analysisLenses(entity, analysis, throwawayIdGen) : [];
    return filterSignature(
      entity,
      lenses,
      unitsOnly ? draft.resourceType : '',
      unitsOnly ? draft.whereData : '',
    );
  }, [analysis, entity, unitsOnly, draft.resourceType, draft.whereData]);
  // Text not edited since it was loaded is the view, even when it parses to lenses in another form.
  const pristine =
    draft.text === base.text && draft.resourceType === base.resourceType && draft.whereData === base.whereData;
  const applied = pristine || (liveSig !== null && liveSig === writtenSig);

  const serverInvalid = check.status === 'invalid' && current?.text === draft.text ? check : null;

  let status:
    | { kind: 'error'; message: string; at: number | null; span: { start: number; end: number } | null }
    | { kind: 'ok' }
    | { kind: 'busy'; message: string };
  const suggestError = suggesting ? suggestions.result.error : undefined;
  const suggestAttr =
    suggestError && (suggestions.ctx.kind === 'operator' || suggestions.ctx.kind === 'value') ? suggestions.ctx.attr : null;
  const suggestAt = suggestAttr ? draft.text.lastIndexOf(suggestAttr, ui.caret) : -1;
  if (suggestError) {
    // The list says what is wrong (an unknown field); the box and the line under it say the same.
    status = {
      kind: 'error',
      message: suggestError,
      at: suggestAt >= 0 ? suggestAt : null,
      span: suggestAt >= 0 && suggestAttr ? { start: suggestAt, end: suggestAt + suggestAttr.length } : null,
    };
  } else if (analysis.status === 'error' && suggesting) {
    status = { kind: 'busy', message: 'Keep typing…' };
  } else if (analysis.status === 'error') {
    status = { kind: 'error', message: analysis.error.message, at: analysis.error.start, span: analysis.error };
  } else if (serverInvalid) {
    const name = serverInvalid.attribute;
    const idx = name ? draft.text.search(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)) : -1;
    status = {
      kind: 'error',
      message: serverInvalid.message,
      at: idx >= 0 ? idx : null,
      span: idx >= 0 && name ? { start: idx, end: idx + name.length } : null,
    };
  } else if (analysis.status === 'ok' && analysis.unknown.length > 0 && !applied) {
    // Provisional: the server has names the client does not list, so it decides.
    status = {
      kind: 'busy',
      message: `${unknownAttributeMessage(entity, analysis.unknown[0].attr).replace(/\.$/, '')} here · checking with the server…`,
    };
  } else if (extraProblem) {
    status = { kind: 'busy', message: 'Fix ResourceType or WhereData below.' };
  } else if (applied) {
    status = { kind: 'ok' };
  } else if (suggesting) {
    status = { kind: 'busy', message: 'Keep typing…' };
  } else {
    status = { kind: 'busy', message: check.status === 'checking' ? 'Checking with ConfigHub…' : 'Applying…' };
  }

  // Leaving text mode (⌘E, the switch) or the tab with text that was not applied says so,
  // rather than dropping it without a word.
  const note = applied
    ? null
    : status.kind === 'error'
      ? `Your last edit was not applied: ${status.message.replace(/[\s.]+$/, '')}${status.at !== null ? ` (line ${lineAndColumn(draft.text, status.at).line})` : ''}.`
      : 'Your last edit was not applied yet.';
  const leaveNote = useRef<string | null>(null);
  const toastRef = useRef(toast);
  const shownTab = useRef(tabId);
  // WHY an effect: a toast updates the page's state, which must not happen during this render.
  // On a tab change the ref still holds the note of the tab that was left.
  useEffect(() => {
    if (shownTab.current !== tabId) {
      const fork = lastApplied.current !== null && lastApplied.current === workSig;
      if (leaveNote.current && !fork) toastRef.current({ message: leaveNote.current, severity: 'warning' });
      shownTab.current = tabId;
      lastApplied.current = null;
    } else if (lastApplied.current === workSig) {
      // Our change arrived on this tab (no fork): nothing more to recognise.
      lastApplied.current = null;
    }
    leaveNote.current = note;
    toastRef.current = toast;
  }, [tabId, workSig, note, toast]);
  // WHY an effect: leaving text mode unmounts this component, which only a cleanup sees; the
  // debounce timer must not fire into it after that either.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (leaveNote.current) toastRef.current({ message: leaveNote.current, severity: 'warning' });
    },
    [],
  );
  // One live region: polite, and assertive only for the render in which a new error appears.
  const errorKey = status.kind === 'error' ? status.message : null;
  const shownError = useRef<string | null>(null);
  const newError = errorKey !== null && errorKey !== shownError.current;
  // WHY an effect: "new" means unlike the error of the last committed render, known only after commit.
  useEffect(() => {
    shownError.current = errorKey;
  }, [errorKey]);

  const n = data.result;
  const resultText = `${n} of ${data.total} ${noun(entity, data.total)}`;
  const customCount = work.lenses.filter((l) => l.kind === 'custom' && l.enabled).length;

  const asTokens = useMemo(() => {
    if (analysis.status !== 'ok' || analysis.form !== 'where' || !draft.text.trim()) return null;
    return lensesToTokens(analysisLenses(entity, analysis, throwawayIdGen), data.tokenCtx);
  }, [analysis, entity, draft.text, data.tokenCtx]);

  const convertToWhere = () => {
    if (analysis.status !== 'ok') return;
    editorRef.current?.replaceAll(lensesToText(entity, analysisLenses(entity, analysis, throwawayIdGen)).text);
  };

  const copy = async () => {
    const lines = [draft.text.trim()];
    if (unitsOnly && draft.resourceType.trim()) lines.push(`-- ResourceType: ${draft.resourceType.trim()}`);
    if (unitsOnly && draft.whereData.trim()) lines.push(`-- WhereData: ${draft.whereData.trim()}`);
    try {
      await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));
      toast({ message: 'Filter copied', severity: 'success' });
    } catch {
      toast({ message: 'The browser did not allow copying', severity: 'warning' });
    }
  };

  const unwrittenText = unwrittenNote(asText.unwritten);

  return (
    <Box data-testid='vx-text-mode'>
      <Section
        label='Filter'
        note={
          analysis.form === 'tokens' ? (
            <Box component='span' data-testid='vx-text-form' data-form='tokens'>
              Reading as <b>tokens</b>
              {analysis.status === 'ok' && (
                <>
                  {' · '}
                  <Link component='button' type='button' onClick={convertToWhere} sx={{ fontSize: 11.5, fontWeight: 700, verticalAlign: 'baseline' }} data-testid='vx-text-convert'>
                    Convert to WHERE
                  </Link>
                </>
              )}
            </Box>
          ) : (
            <Box component='span' data-testid='vx-text-form' data-form='where'>
              <Box
                component='code'
                sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'text.secondary', bgcolor: 'action.hover', px: 0.5, py: 0.125, borderRadius: 0.5 }}
              >
                Filter.Where
              </Box>
              {asTokens && (
                <>
                  {' · '}
                  <Link component='button' type='button' onClick={() => editorRef.current?.replaceAll(asTokens)} sx={{ fontSize: 11.5, fontWeight: 700, verticalAlign: 'baseline' }} data-testid='vx-text-show-tokens'>
                    Show as tokens
                  </Link>
                </>
              )}
            </Box>
          )
        }
        right={
          <Button
            size='small'
            variant='text'
            color='inherit'
            startIcon={<ContentCopyIcon sx={{ fontSize: 13 }} />}
            onClick={copy}
            data-testid='vx-text-copy'
            sx={{ fontSize: 12, color: 'text.disabled', minWidth: 0, py: 0, '&:hover': { color: 'text.primary' } }}
          >
            Copy
          </Button>
        }
        testId='vx-text-section'
      >
        {unwrittenText && (
          <Stack direction='row' spacing={0.75} sx={{ mb: 0.75, px: 0.5 }} data-testid='vx-text-unwritten'>
            <InfoOutlinedIcon sx={{ fontSize: 14, color: 'warning.main', mt: '2px' }} />
            <Typography sx={{ fontSize: 12, color: 'warning.dark', lineHeight: 1.45 }}>{unwrittenText}</Typography>
          </Stack>
        )}
        <WhereEditor
          value={draft.text}
          onChange={(text) => edit({ text })}
          form={analysis.form}
          errorSpan={status.kind === 'error' ? status.span : null}
          caret={ui.caret}
          onUi={onUi}
          suggestions={suggestions}
          describedBy={statusId}
          editorRef={editorRef}
          countsOffHint={liveCountsOffText(entity)}
          placeholder={"Space.Slug LIKE 'payments-%'\nAND Labels.app = 'api'\n\nor tokens: space:payments-* is:unreleased"}
        />
        <Box
          id={statusId}
          role='status'
          aria-live={newError ? 'assertive' : 'polite'}
          sx={{ minHeight: 40, pt: 0.75, px: 0.25 }}
          data-testid='vx-text-status'
          data-status={status.kind}
        >
          {status.kind === 'error' ? (
            <Stack direction='row' spacing={0.75}>
              <ErrorOutlineIcon sx={{ fontSize: 15, color: 'error.main', mt: '2px' }} />
              <Box>
                <Typography sx={{ fontSize: 12.5, color: 'error.main', lineHeight: 1.45 }}>
                  <b data-testid='vx-text-error'>{status.message.replace(/\s+$/, '')}</b>
                  {status.at !== null && <> · line {lineAndColumn(draft.text, status.at).line}</>}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.disabled', lineHeight: 1.45 }} data-testid='vx-text-last-valid'>
                  Showing the last valid result: {resultText}.
                </Typography>
              </Box>
            </Stack>
          ) : status.kind === 'ok' ? (
            <Stack direction='row' spacing={0.75}>
              <CheckIcon sx={{ fontSize: 15, color: 'success.main', mt: '2px' }} />
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45 }}>
                Valid · <b>{resultText}</b>
                {customCount > 0 && (
                  <>
                    {' '}· kept as {customCount === 1 ? 'a ' : `${customCount} `}
                    <b>Custom WHERE</b> {customCount === 1 ? 'lens' : 'lenses'}
                  </>
                )}
              </Typography>
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled', lineHeight: 1.45, pl: 0.25 }}>
              {status.message}
            </Typography>
          )}
        </Box>
        {unitsOnly && (
          <ExtraFields
            resourceType={draft.resourceType}
            whereData={draft.whereData}
            onResourceType={(resourceType) => edit({ resourceType })}
            onWhereData={(whereData) => edit({ whereData })}
          />
        )}
        <Typography sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1.6, mt: 1.5, px: 0.25 }}>
          Type <Code>WHERE</Code> or tokens like <Code>space:payments-*</Code> <Code>is:unreleased</Code>. Terms join
          with <Code>AND</Code> only. Hidden lenses stay as <Code>-- hidden:</Code> lines. A condition a lens cannot
          show becomes one <b>Custom WHERE</b> lens.
        </Typography>
      </Section>
    </Box>
  );
}

function Code({ children }: { children: string }) {
  return (
    <Box
      component='code'
      sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'text.secondary', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}
    >
      {children}
    </Box>
  );
}
