// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';

import { TOP_NAV_HEIGHT } from '@/utility/constants';

import { OrganizationRow } from '@/components/organization-switcher/OrganizationRow';
import { SummaryCard } from '../components/SummaryFacts';
import { changeOrderFontSans, changeOrderInk, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { DRAFT_END_ID } from './ChangeCardRibbon';
import { draftCopy } from './draftCopy';
import { focusWhenDrawn, ledgerRowId, revealCardWhenFocused } from './draftFocus';
import { DraftHeader, DRAFT_NAME_INPUT_ID } from './DraftHeader';
import { DraftLedger, type LedgerNeed } from './DraftLedger';
import { DraftLowerSections, DraftSourceSections, type DraftLowerSectionsHandle } from './DraftLowerSections';
import type { OutlierAction } from './draftPageModel';
import { DRAFT_BLOCKER_ID, DraftSideColumn } from './DraftSideColumn';
import { DRAFT_STICKY_BLOCKER_ID, DraftStickyBar } from './DraftStickyBar';
import type { DraftProblem, DraftRow } from './draftTypes';
import { DRAFT_SCOPE_ID } from './ScopePopover';
import { useChangeOrderDraft } from './useChangeOrderDraft';
import { useDraftFieldWaits } from './useDraftField';
import { useOutOfView } from './useOutOfView';
import { DRAFT_UPDATE_TYPE_ID, DRAFT_WORKFLOW_ID } from './WorkflowPopover';

const copy = draftCopy.page;

/** The control each ledger row's problem is fixed at: what the blocker beside Create focuses. */
const FOCUS_BY_ROW: Partial<Record<DraftRow, string>> = {
  name: DRAFT_NAME_INPUT_ID,
  path: DRAFT_WORKFLOW_ID,
  where: DRAFT_SCOPE_ID,
  howMuch: DRAFT_END_ID,
  same: DRAFT_UPDATE_TYPE_ID,
  template: 'draft-template',
};

/** Focus the control that fixes a row's problem; a row with no such control takes focus itself. */
function focusRow(row: DraftRow) {
  const id = FOCUS_BY_ROW[row];
  const target = id === undefined ? null : document.getElementById(id);
  focusWhenDrawn(target === null ? ledgerRowId(row) : (id as string), { select: row === 'name' });
}

/** The rows holding a problem that stops Create; the first of them in ledger order is `next`. */
function ledgerNeeds(problems: readonly DraftProblem[], blocker: DraftProblem | undefined): Map<DraftRow, LedgerNeed> {
  const needs = new Map<DraftRow, LedgerNeed>();
  for (const problem of problems) if (problem.blocks) needs.set(problem.row, 'need');
  if (blocker !== undefined) needs.set(blocker.row, 'next');
  return needs;
}

/** The app bar covers the top of the viewport: something under it is out of view. */
const BELOW_APP_BAR = `-${TOP_NAV_HEIGHT}px 0px 0px 0px`;

const UNDO_ID = 'draft-undo';

interface Toast {
  message: string;
  undo?: () => void;
}

/** The same array while its items are the same: a list the URL rebuilds on every write. */
function useSameList<T>(list: readonly T[]): readonly T[] {
  const [kept, setKept] = useState(list);
  const same = kept.length === list.length && kept.every((item, index) => item === list[index]);
  if (!same) setKept(list);
  return same ? kept : list;
}

/** No stages, no variants: one empty list, so an empty prop never changes. */
const NO_STAGES: readonly string[] = [];

/**
 * Create a ChangeOrder, by re-aiming the last one: `/change-orders/new?space=<base>&…`.
 *
 * The URL is the draft (`useDraftAddress`); this page lays out what `useChangeOrderDraft` says.
 * The summary card holds the title, the ledger of decisions against last time and the dry run
 * with Create; the change at the source sits in its full-width row; the promotion path and the
 * selected stage follow as cards of their own. Create commits with no confirm step: the page is
 * the preview.
 */
export default function ChangeOrderDraftPage() {
  const draft = useChangeOrderDraft();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { context, decisions, update, address, preview, cards, problemsByRow } = draft;
  const [ctaRef, ctaOutOfView] = useOutOfView<HTMLDivElement>(BELOW_APP_BAR);
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoFocused, setUndoFocused] = useState(false);
  // A refusal of Create belongs to the draft it refused: any change to the draft retires it.
  const [createRefusal, setCreateRefusal] = useState<{ problem: DraftProblem; search: string } | null>(null);
  const [shownSpaceId, setShownSpaceId] = useState<string | undefined>(undefined);
  const lowerRef = useRef<DraftLowerSectionsHandle>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  // Text typed into the name or description that the URL has not drawn yet: Create waits for it,
  // so it never sends the name the URL had a moment ago.
  const fields = useDraftFieldWaits(search);

  const createProblem = createRefusal !== null && createRefusal.search === search ? createRefusal.problem : undefined;
  const problems = useMemo(() => (createProblem === undefined ? draft.problems : [...draft.problems, createProblem]), [draft.problems, createProblem]);
  const blocker = draft.blocker ?? (createProblem?.blocks === true ? createProblem : undefined);
  const needs = useMemo(() => ledgerNeeds(problems, blocker), [problems, blocker]);
  const nameProblems = useMemo(() => problems.filter((problem) => problem.row === 'name'), [problems]);

  const { create } = draft;
  const canCreate = draft.canCreate && !fields.pending;
  const onCreate = useCallback(async () => {
    if (fields.pending) return;
    setCreateRefusal(null);
    const outcome = await create();
    if (outcome === undefined) return;
    if (outcome.ok) {
      // The draft is done: Back from the new ChangeOrder goes where the reader came from, not to the draft.
      navigate(outcome.path, { replace: true });
      return;
    }
    setCreateRefusal({ problem: outcome.problem, search });
    // The refusal is said beside the Create that was pressed; a refusal that blocks nothing
    // leaves focus on Create.
    if (outcome.problem.blocks) focusWhenDrawn(ctaOutOfView ? DRAFT_STICKY_BLOCKER_ID : DRAFT_BLOCKER_ID);
  }, [create, navigate, search, fields.pending, ctaOutOfView]);

  const onShow = useCallback(
    (item: OutlierAction) => {
      if (item.stage === undefined) return;
      setShownSpaceId(item.outlier.spaceId);
      update({ stage: item.stage });
      lowerRef.current?.focusVariant(item.outlier.spaceId);
      // The card's header goes to the top, clear of the app bar, once its chip has the keyboard:
      // the chip and the group it opens are in view, and not under the sticky bar.
      revealCardWhenFocused(() => lowerRef.current?.stageCard() ?? null, 16, TOP_NAV_HEIGHT);
    },
    [update],
  );

  const leftOut = decisions?.leftOut;
  /** Leave variants out of scope, say which in the toast, and offer the way back. */
  const leaveOut = useCallback(
    (spaceIds: readonly string[]) => {
      if (leftOut === undefined) return;
      const leaving = context.variants.filter((variant) => spaceIds.includes(variant.spaceId));
      if (leaving.length === 0) return;
      const before = address.out;
      update({ out: [...leftOut, ...leaving.map((variant) => variant.slug)] });
      setToast({
        message: copy.outlier.leftOut(leaving.map((variant) => variant.name).join(', ')),
        undo: () => update({ out: before ?? null }),
      });
      // What offered it has gone with the variants: the keyboard goes to the way back.
      focusWhenDrawn(UNDO_ID);
    },
    [address.out, context.variants, leftOut, update],
  );
  const onLeaveOut = useCallback((item: OutlierAction) => leaveOut([item.outlier.spaceId]), [leaveOut]);

  const closeToast = useCallback(() => {
    const active = document.activeElement;
    const focusInToast = active !== null && toastRef.current?.contains(active) === true;
    setToast(null);
    setUndoFocused(false);
    // The chip it came from has gone: a keyboard that was in the toast goes back to the row it
    // was in. One that has moved on stays where it is.
    if (focusInToast) focusWhenDrawn(ledgerRowId('where'));
  }, []);

  const onFocusBlocker = useCallback(() => {
    if (blocker !== undefined) focusRow(blocker.row);
  }, [blocker]);
  const onSelectStage = useCallback(
    (stage: string) => {
      setShownSpaceId(undefined);
      update({ stage });
    },
    [update],
  );

  const componentName = context.component?.name ?? context.baseSpace?.slug ?? '';
  const nameStem = context.component?.slug ?? context.baseSpace?.slug ?? '';
  const workflowChoice = decisions?.workflow.value;
  const workflow = workflowChoice?.kind === 'workflow' ? workflowChoice.workflow : undefined;
  const stageNames = workflow?.stageNames ?? NO_STAGES;
  const scope = useSameList(decisions?.scope.value ?? NO_STAGES);
  const outsideNames = useMemo(() => {
    const nameOf = new Map(context.variants.map((variant) => [variant.spaceId, variant.name]));
    return preview.outsideStageSpaceIds.flatMap((spaceId) => nameOf.get(spaceId) ?? []);
  }, [context.variants, preview.outsideStageSpaceIds]);

  // An Undo stays while it has the keyboard; otherwise a toast with an Undo stays longer than one without.
  const toastHold = toast?.undo === undefined ? 3600 : 8000;
  const toastDuration = undoFocused ? null : toastHold;
  const loading = context.status === 'loading' || (context.status === 'resolved' && decisions === undefined);

  return (
    <Box
      data-testid="change-order-draft"
      sx={{
        padding: '20px 22px 0',
        background: changeOrderSurface.page,
        minHeight: '100%',
        flex: 1,
        minWidth: 0,
        fontFamily: changeOrderFontSans,
        lineHeight: changeOrderType.lineHeight.body,
        fontSize: changeOrderType.size.body,
        color: changeOrderInk.default,
      }}
    >
      <OrganizationRow />
      <Box sx={{ marginBottom: '12px' }}>
        <Box
          component={RouterLink}
          to="/change-orders"
          sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted, textDecoration: 'none', '&:hover': { color: changeOrderInk.default } }}
        >
          {copy.back}
        </Box>
      </Box>

      {context.status === 'notFound' ? (
        <Box component="h1" sx={{ fontSize: changeOrderType.size.heading, fontWeight: changeOrderType.weight.semibold, margin: 0 }}>
          {address.space === undefined ? copy.noSpace : copy.notFound(address.space)}
        </Box>
      ) : null}
      {context.status === 'failed' ? (
        <Box component="h1" sx={{ fontSize: changeOrderType.size.heading, fontWeight: changeOrderType.weight.semibold, margin: 0 }}>
          {draftCopy.couldNotEstablish}
        </Box>
      ) : null}
      {loading ? (
        <SummaryCard label={copy.summaryLabel}>
          <Box role="status" sx={{ padding: '18px 20px' }} aria-busy="true" aria-label={copy.loading}>
            <Skeleton variant="text" width={280} height={30} />
            <Skeleton variant="text" width={180} />
            <Skeleton variant="rounded" height={420} sx={{ marginTop: '14px', borderRadius: '8px' }} />
          </Box>
        </SummaryCard>
      ) : null}

      {decisions === undefined || context.status !== 'resolved' ? null : (
        <>
          <SummaryCard label={copy.summaryLabel}>
            <Box
              sx={{
                padding: '18px 20px',
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 232px',
                gap: '0 32px',
                '@media (max-width: 1180px)': { gridTemplateColumns: 'minmax(0,1fr) 210px', gap: '0 24px' },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <DraftHeader
                  name={decisions.name.value}
                  description={decisions.description.value}
                  template={decisions.template}
                  nameProblems={nameProblems}
                  pastChangeOrders={context.pastChangeOrders}
                  takenSlugs={context.takenSlugs}
                  componentName={componentName}
                  nameStem={nameStem}
                  onChange={update}
                  fieldSignals={fields.signals}
                />
                <DraftLedger
                  context={context}
                  decisions={decisions}
                  cards={cards}
                  preview={preview}
                  problemsByRow={problemsByRow}
                  needs={needs}
                  onChange={update}
                  onShow={onShow}
                  onLeaveOut={onLeaveOut}
                  onLeaveOutSpaces={leaveOut}
                  onRetryPreview={preview.retry}
                  onRetryCards={cards.retry}
                />
              </Box>
              <DraftSideColumn
                preview={preview}
                stageNames={stageNames}
                selectedStage={decisions.stage}
                outsideNames={outsideNames}
                onSelectStage={onSelectStage}
                canCreate={canCreate}
                isCreating={draft.isCreating}
                blocker={blocker}
                onCreate={onCreate}
                onFocusBlocker={onFocusBlocker}
                onRetry={preview.retry}
                onRetryValidation={draft.validation.retry}
                ctaRef={ctaRef}
              />
              <Box sx={{ gridColumn: '1 / -1', minWidth: 0, marginTop: '2px' }}>
                <DraftSourceSections
                  source={draft.source}
                  validation={draft.validation}
                  cards={draft.cards}
                  baseSpace={context.baseSpace}
                  stageNames={stageNames}
                />
              </Box>
            </Box>
          </SummaryCard>
          <DraftLowerSections
            preview={preview}
            cards={draft.cards}
            componentSlug={context.component?.slug}
            baseSpace={context.baseSpace}
            variants={context.variants}
            workflow={workflow}
            scope={scope}
            updateType={decisions.updateType.value}
            stage={decisions.stage}
            onSelectStage={onSelectStage}
            shownSpaceId={shownSpaceId}
            onLeaveOut={leaveOut}
            handleRef={lowerRef}
          />
        </>
      )}

      {/* Room under the last card; the sticky bar's holder comes after it so the bar never rides up. */}
      <Box aria-hidden="true" sx={{ height: 120 }} />
      {decisions === undefined || context.status !== 'resolved' ? null : (
        <DraftStickyBar
          open={ctaOutOfView}
          preview={preview}
          name={decisions.name.value}
          blocker={blocker}
          canCreate={canCreate}
          isCreating={draft.isCreating}
          onCreate={onCreate}
          onFocusBlocker={onFocusBlocker}
          onRetryValidation={draft.validation.retry}
        />
      )}

      <Snackbar
        ref={toastRef}
        open={toast !== null}
        autoHideDuration={toastDuration}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') closeToast();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={toast?.message ?? ''}
        data-testid="draft-toast"
        ContentProps={{ sx: { fontFamily: changeOrderFontSans, fontSize: changeOrderType.size.body } }}
        action={
          toast?.undo === undefined ? undefined : (
            <Button
              id={UNDO_ID}
              size="small"
              onFocus={() => setUndoFocused(true)}
              onBlur={() => setUndoFocused(false)}
              onClick={() => {
                toast.undo?.();
                closeToast();
              }}
              sx={{ color: changeOrderSurface.card, fontWeight: changeOrderType.weight.strong }}
            >
              {copy.outlier.undo}
            </Button>
          )
        }
      />
    </Box>
  );
}
