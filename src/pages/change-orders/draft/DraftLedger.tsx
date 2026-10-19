// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryIcon from '@mui/icons-material/History';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MergeIcon from '@mui/icons-material/Merge';
import UndoIcon from '@mui/icons-material/Undo';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';

import { componentTheme } from '../../x/apps/componentTheme';
import { useChangeWorkflowNames } from '../useChangeWorkflowNames';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { ChangeCardRibbon } from './ChangeCardRibbon';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import type { DraftAddressPatch, DraftDecisions } from './draftDecisions';
import { focusWhenDrawn, ledgerRowId } from './draftFocus';
import {
  BARE_BUTTON,
  DRAFT_TRANSITION,
  FIELD_BUTTON_SX,
  FIGURE_SX,
  FOCUS_RING,
  LEDGER_COLUMNS,
  NOW_GROUND,
  NOW_VALUE_SX,
  PROVENANCE_TONE,
  SAME_VALUE_SX,
  STRUCK_QUIET_SX,
  STRUCK_SX,
  WAS_GROUND,
} from './draftLook';
import { outcomeKindBySpaceId, outlierActions, type OutlierAction } from './draftPageModel';
import { DraftPeek } from './DraftPeek';
import { DRAFT_NAME_INPUT_ID } from './DraftHeader';
import { OutlierChips, OutsideChips, type OutsideVariant } from './OutlierChips';
import { DRAFT_SCOPE_ID, ScopePicker } from './ScopePopover';
import type { DraftDecisionOrigin, DraftProblem, DraftRow } from './draftTypes';
import type { DraftChangeCards } from './useDraftChangeCards';
import type { DraftContext } from './useDraftContext';
import type { DraftPreview } from './useDraftPreview';
import { DRAFT_UPDATE_TYPE_ID, UpdateTypePicker, WorkflowPicker } from './WorkflowPopover';

const copy = draftCopy.page.ledger;

/** A row that holds a problem: amber; the first of them, where the eye should go, carries the accent edge. */
export type LedgerNeed = 'need' | 'next' | undefined;

interface LedgerRowProps {
  label: ReactNode;
  /** The row a problem names (`problemsByRow`): its id is the fallback focus target. */
  row?: DraftRow;
  /** Last time's side. Omitted with `span`. */
  was?: ReactNode;
  /** This time's side. */
  now?: ReactNode;
  /** One cell across both sides, for a row with no last-time counterpart drawn beside it. */
  span?: ReactNode;
  /** Tint the two sides: the decision differs from last time. */
  diff?: boolean;
  revert?: RevertAction;
  need?: LedgerNeed;
  /** Problems the row holds, said under it. */
  problems?: readonly DraftProblem[];
  onFix?: (patch: DraftAddressPatch) => void;
  variant?: 'head' | 'same' | 'outcome';
  busy?: boolean;
  testId?: string;
}

const CELL_SX = {
  padding: '7px 10px',
  minWidth: 0,
  fontSize: changeOrderType.size.body,
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexWrap: 'wrap',
} as const;

const HEAD_CELL_SX = { fontSize: changeOrderType.size.small, color: changeOrderInk.subtle } as const;

/** The way back to last time, beside a row. */
interface RevertAction {
  label: string;
  onClick: () => void;
}

interface RowProblemsProps {
  problems: readonly DraftProblem[];
  /** Apply a problem's own fix (`problem.fix.patch`). */
  onFix: (patch: DraftAddressPatch) => void;
}

/** A row's problems, under its cells: the server's or the client's own words, and a fix where there is one. */
function RowProblems({ problems, onFix }: RowProblemsProps) {
  return (
    <Box role="cell" sx={{ gridColumn: '2 / 5', padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {problems.map((problem) => {
        const fix = problem.fix;
        const action = fix === undefined ? undefined : { label: fix.label, onClick: () => onFix(fix.patch) };
        return (
          <Box
            key={problem.code + problem.message}
            data-problem={problem.code}
            sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: changeOrderType.size.small, color: problem.blocks ? changeOrderStatus.danger : changeOrderStatus.warn }}
          >
            <span>{problem.message}</span>
            {action === undefined ? null : (
              <Box
                component="button"
                type="button"
                onClick={action.onClick}
                sx={{
                  ...BARE_BUTTON,
                  fontSize: changeOrderType.size.small,
                  fontWeight: changeOrderType.weight.semibold,
                  color: changeOrderStatus.accent,
                  borderRadius: '3px',
                  '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
                  '&:focus-visible': FOCUS_RING,
                }}
              >
                {action.label}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

interface RevertButtonProps {
  revert: RevertAction;
}

function RevertButton({ revert }: RevertButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      title={revert.label}
      aria-label={revert.label}
      onClick={revert.onClick}
      sx={{
        ...BARE_BUTTON,
        display: 'grid',
        placeItems: 'center',
        width: 24,
        height: 24,
        borderRadius: '5px',
        color: changeOrderInk.subtle,
        transition: DRAFT_TRANSITION,
        '&:hover': { background: changeOrderSurface.inset, color: changeOrderInk.default },
        '&:focus-visible': FOCUS_RING,
      }}
    >
      <UndoIcon aria-hidden sx={{ fontSize: 16 }} />
    </Box>
  );
}

/** One decision: its name, last time, an arrow, this time, and the way back to last time. */
function LedgerRow({
  label,
  row,
  was,
  now,
  span,
  diff = false,
  revert,
  need,
  problems = [],
  onFix = () => undefined,
  variant,
  busy,
  testId,
}: LedgerRowProps) {
  const head = variant === 'head';
  let labelWeight: number = changeOrderType.weight.semibold;
  if (need === undefined) labelWeight = head ? changeOrderType.weight.regular : changeOrderType.weight.medium;
  const needTone = need === 'next' ? changeOrderStatus.accent : changeOrderStatus.warn;
  const minHeight = { head: 34, outcome: 76, same: 38 }[variant ?? 'same'] ?? 38;
  const needMark =
    need === undefined
      ? {}
      : { '&::after': { content: '""', width: 6, height: 6, borderRadius: '50%', background: needTone, marginLeft: '4px', flex: 'none' } };
  const spanSx =
    variant === 'same'
      ? { ...CELL_SX, gridColumn: '2 / 5' }
      : { ...CELL_SX, gridColumn: '2 / -1', display: 'block', padding: '8px 10px 12px' };
  return (
    <Box
      role="row"
      id={row === undefined ? undefined : ledgerRowId(row)}
      tabIndex={row === undefined ? undefined : -1}
      aria-busy={busy}
      data-testid={testId}
      data-need={need}
      sx={{
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: LEDGER_COLUMNS,
        alignItems: 'center',
        minHeight,
        borderTop: `1px solid ${componentTheme.borderSubtle}`,
        position: 'relative',
        background: head || variant === 'same' ? changeOrderSurface.sunk : 'transparent',
        boxShadow: need === 'next' ? `inset 3px 0 0 ${changeOrderStatus.accent}` : 'none',
        transition: 'box-shadow .18s',
        outline: 'none',
        '&:first-of-type': { borderTop: 0 },
        '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${changeOrderStatus.accent}` },
        ...(head ? { borderBottom: `1px solid ${changeOrderBorder.default}` } : {}),
      }}
    >
      <Box
        role={head ? 'columnheader' : 'rowheader'}
        sx={{
          padding: '8px 0 8px 12px',
          fontSize: 12,
          fontWeight: labelWeight,
          color: need === undefined ? changeOrderInk.muted : needTone,
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          lineHeight: changeOrderType.lineHeight.tight,
          alignSelf: 'stretch',
          '& .MuiSvgIcon-root': { fontSize: 14 },
          ...needMark,
        }}
      >
        {label}
      </Box>
      {span !== undefined ? (
        <Box role="cell" sx={spanSx}>
          {span}
        </Box>
      ) : (
        <>
          <Box role="cell" sx={{ ...CELL_SX, background: diff ? WAS_GROUND : 'transparent', ...(head ? HEAD_CELL_SX : {}) }}>
            {was}
          </Box>
          <Box aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', color: changeOrderInk.subtle, fontSize: 14, fontFamily: componentTheme.fontSans, alignSelf: 'stretch' }}>
            →
          </Box>
          <Box role="cell" sx={{ ...CELL_SX, background: diff ? NOW_GROUND : 'transparent', ...(head ? HEAD_CELL_SX : {}) }}>
            {now}
          </Box>
          <Box role="cell" sx={{ display: 'grid', placeItems: 'center' }}>
            {revert === undefined ? null : <RevertButton revert={revert} />}
          </Box>
        </>
      )}
      {problems.length > 0 ? <RowProblems problems={problems} onFix={onFix} /> : null}
    </Box>
  );
}

const PROVENANCE_ICON: Record<DraftDecisionOrigin, typeof HistoryIcon> = {
  last: HistoryIcon,
  policy: VerifiedUserOutlinedIcon,
  you: EditOutlinedIcon,
};

interface ProvenanceProps {
  origin: DraftDecisionOrigin;
  /** The tile's name, when the origin's own word is not the right one ("Default name"). */
  label?: string;
  line?: string;
}

/** Where this side's value came from: last time, the policy, or you. */
function Provenance({ origin, label, line }: ProvenanceProps) {
  const Icon = PROVENANCE_ICON[origin];
  const tone = PROVENANCE_TONE[origin];
  const name = label ?? draftCopy.page.provenance[origin];
  return (
    <DraftPeek spec={{ eyebrow: name, icon: <Icon aria-hidden />, lines: line === undefined ? [] : [line] }}>
      <Box
        component="span"
        tabIndex={0}
        role="img"
        aria-label={line === undefined ? name : `${name}. ${line}`}
        data-provenance={origin}
        sx={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 20,
          height: 20,
          borderRadius: '5px',
          flex: 'none',
          background: tone.bg,
          color: tone.fg,
          '&:focus-visible': FOCUS_RING,
        }}
      >
        <Icon aria-hidden sx={{ fontSize: 14 }} />
      </Box>
    </DraftPeek>
  );
}

/** "Base changes 6": the one kind of change this draft makes, on the design's segment track. Not a control. */
interface KindChipProps {
  /** How many changes the draft carries; undefined until they are read. */
  count: number | undefined;
}

function KindChip({ count }: KindChipProps) {
  return (
    <Box sx={{ display: 'inline-flex', background: changeOrderSurface.inset, borderRadius: '7px', padding: '2px', gap: '2px', cursor: 'default' }}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: 24,
          padding: '0 9px',
          borderRadius: '5px',
          fontFamily: componentTheme.fontSans,
          fontSize: changeOrderType.size.small,
          fontWeight: changeOrderType.weight.semibold,
          letterSpacing: '-.01em',
          color: changeOrderInk.default,
          background: changeOrderSurface.card,
          boxShadow: `${changeOrderCardTokens.shadow}, ${changeOrderSelectedRing}`,
          whiteSpace: 'nowrap',
        }}
      >
        <MergeIcon aria-hidden sx={{ fontSize: 16 }} />
        {copy.baseChanges}
        {count === undefined ? null : (
          <Box
            component="span"
            sx={{
              position: 'relative',
              fontFamily: changeOrderFontMono,
              fontSize: changeOrderType.size.micro,
              fontWeight: changeOrderType.weight.bold,
              background: changeOrderStatus.accent,
              color: changeOrderSurface.card,
              borderRadius: `${changeOrderShape.radius.pill}px`,
              padding: '0 5px',
              lineHeight: '15px',
            }}
          >
            <span aria-hidden="true">{count}</span>
            <Box component="span" sx={VISUALLY_HIDDEN_SX}>
              {copy.changesCount(count)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** "8 variants": how many variants last time's ChangeOrder covered. */
interface LastFigureProps {
  count: number;
}

function LastFigure({ count }: LastFigureProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
      <Box component="b" sx={{ ...FIGURE_SX, fontSize: 18, fontWeight: changeOrderType.weight.strong, color: changeOrderInk.muted }}>
        {count}
      </Box>
      <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
        {copy.variantsWord(count)}
      </Box>
    </Box>
  );
}

const NONE = <Box component="span" sx={{ ...SAME_VALUE_SX, color: changeOrderInk.subtle }}>{copy.none}</Box>;

interface WhereNowProps {
  preview: DraftPreview;
  /** In scope and on no stage of the workflow, by display name. */
  outside: readonly OutsideVariant[];
  workflowSlug: string | undefined;
  onShow: (item: OutlierAction) => void;
  onLeaveOut: (item: OutlierAction) => void;
  onLeaveOutSpaces: (spaceIds: readonly string[]) => void;
  onRetry?: () => void;
}

/** The Where row's right side: "N of M same", then the variants that are not. */
function WhereNow({ preview, outside, workflowSlug, onShow, onLeaveOut, onLeaveOutSpaces, onRetry }: WhereNowProps) {
  if (preview.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <Skeleton variant="text" width={90} height={30} />
        <Skeleton variant="rounded" width="60%" height={26} />
      </Box>
    );
  }
  // Resolved with no totals: nothing is carried, or no variant is in scope. No figure is the answer.
  if (preview.status === 'resolved' && preview.totals === undefined) return NONE;
  if (preview.status !== 'resolved' || preview.totals === undefined) {
    return (
      <CouldNotEstablish
        onRetry={preview.status === 'failed' ? onRetry : undefined}
        retryWhat={draftCopy.page.retryWhat.dryRun}
        focusAfterRetry={ledgerRowId('where')}
        reason={preview.reason}
      />
    );
  }
  const items = outlierActions(preview);
  const undetermined = preview.undeterminedSpaceIds.length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', minWidth: 0, width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }} data-testid="draft-same-figure">
        <Box component="b" sx={FIGURE_SX}>
          {preview.totals.same}
        </Box>
        <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
          {copy.ofSame(preview.totals.variants)}
        </Box>
      </Box>
      {items.length === 0 && undetermined === 0 && outside.length === 0 ? (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: changeOrderStatus.success, fontSize: changeOrderType.size.body, fontWeight: 600 }}>
          <CheckCircleIcon aria-hidden sx={{ fontSize: 16 }} />
          {copy.noOutliers}
        </Box>
      ) : (
        <OutlierChips items={items} onShow={onShow} onLeaveOut={onLeaveOut} />
      )}
      {outside.length === 0 || workflowSlug === undefined ? null : (
        <OutsideChips variants={outside} workflowSlug={workflowSlug} onLeaveOut={onLeaveOutSpaces} />
      )}
      {undetermined === 0 ? null : <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>{copy.undetermined(undetermined)}</Box>}
    </Box>
  );
}

/** "−1 +2": the scope against last time's. */
function scopeDelta(now: readonly string[], last: readonly string[] | undefined): string {
  if (last === undefined) return '';
  const nowSet = new Set(now);
  const lastSet = new Set(last);
  const removed = last.filter((id) => !nowSet.has(id)).length;
  const added = now.filter((id) => !lastSet.has(id)).length;
  return [removed > 0 ? `−${removed}` : '', added > 0 ? `+${added}` : ''].filter(Boolean).join(' ');
}

/** The workflow last time used, by name, whether or not the policy still allows it. Never by id. */
interface LastWorkflowProps {
  workflowId: string | undefined;
  differs: boolean;
}

function LastWorkflow({ workflowId, differs }: LastWorkflowProps) {
  const names = useChangeWorkflowNames();
  if (workflowId === undefined) return <Box component="span" sx={differs ? STRUCK_SX : SAME_VALUE_SX}>{copy.noWorkflow}</Box>;
  const slug = names.byId.get(workflowId);
  if (slug === undefined && names.isLoading) return <Skeleton variant="text" width={70} />;
  if (slug === undefined) return <CouldNotEstablish />;
  return (
    <Box component="span" translate="no" sx={differs ? STRUCK_SX : SAME_VALUE_SX}>
      {slug}
    </Box>
  );
}

/** The policy's "required" badge, its peek naming what the policy allows. */
interface RequiredBadgeProps {
  componentName: string;
  /** The workflows the policy allows, by slug. */
  allowed: string;
}

function RequiredBadge({ componentName, allowed }: RequiredBadgeProps) {
  return (
    <DraftPeek
      spec={{
        eyebrow: draftCopy.page.workflow.title(componentName),
        icon: <VerifiedUserOutlinedIcon aria-hidden />,
        title: draftCopy.page.workflow.requiredMetric,
        lines: [draftCopy.page.workflow.allowed(allowed)],
      }}
    >
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          height: 20,
          boxSizing: 'border-box',
          padding: '0 7px',
          borderRadius: `${changeOrderShape.radius.pill}px`,
          fontSize: 11,
          fontWeight: changeOrderType.weight.semibold,
          color: changeOrderStatus.accent,
          background: changeOrderStatus.accentSoft,
          border: `1px solid ${changeOrderStatus.accentLine}`,
          whiteSpace: 'nowrap',
          '&:focus-visible': FOCUS_RING,
        }}
      >
        <LockOutlinedIcon aria-hidden sx={{ fontSize: 13 }} />
        {copy.required}
      </Box>
    </DraftPeek>
  );
}

export interface DraftLedgerProps {
  context: DraftContext;
  decisions: DraftDecisions;
  cards: DraftChangeCards;
  preview: DraftPreview;
  problemsByRow: ReadonlyMap<DraftRow, DraftProblem[]>;
  needs: ReadonlyMap<DraftRow, LedgerNeed>;
  onChange: (patch: DraftAddressPatch) => void;
  onShow: (item: OutlierAction) => void;
  onLeaveOut: (item: OutlierAction) => void;
  /** Leave variants out by id, with the page's toast and Undo: the "outside every stage" fix. */
  onLeaveOutSpaces: (spaceIds: readonly string[]) => void;
  onRetryCards?: () => void;
  onRetryPreview?: () => void;
}

/** Where a picker that a decision can move between rows sits while its popover is open. */
type Placement = 'chip' | 'row' | null;

/**
 * The heart of the draft: this ChangeOrder diffed against the last one, decision by decision.
 * Each row is last time on the left (struck where this time differs), this time on the right
 * with where its value came from, and a one-click way back to last time. Rows that need a
 * decision before Create can run are marked; the first of them carries the accent edge.
 */
export const DraftLedger = memo(function DraftLedger({
  context,
  decisions,
  cards,
  preview,
  problemsByRow,
  needs,
  onChange,
  onShow,
  onLeaveOut,
  onLeaveOutSpaces,
  onRetryCards,
  onRetryPreview,
}: DraftLedgerProps) {
  // A picker stays where it was opened while its popover is open, so a pick that moves the
  // decision between the Same row and its own row does not pull the popover out from under the
  // reader. Once it closes, the control moves and the keyboard follows it.
  const [scopeOpenAs, setScopeOpenAs] = useState<Placement>(null);
  const [updateOpenAs, setUpdateOpenAs] = useState<Placement>(null);
  const scope = decisions.scope;
  const updateType = decisions.updateType;
  const scopeInRow = scopeOpenAs === null ? scope.differsFromLast : scopeOpenAs === 'row';
  const updateInRow = updateOpenAs === null ? updateType.differsFromLast : updateOpenAs === 'row';

  const template = decisions.template.kind === 'changeOrder' ? decisions.template.changeOrder : undefined;
  const componentName = context.component?.name ?? context.baseSpace?.slug ?? '';
  const templateLabel = template?.slug ?? draftCopy.page.template.policy(componentName);
  const workflow = decisions.workflow;
  const workflowDiffers = workflow.differsFromLast || (template !== undefined && workflow.last === undefined);
  const stageOrder = workflow.value.kind === 'workflow' ? workflow.value.workflow.stageNames : [];
  const kindBySpaceId = outcomeKindBySpaceId(preview);
  const problemsOf = (row: DraftRow) => problemsByRow.get(row) ?? [];
  // Last time's workflow leads the picker; the rest by slug. The order does not move as you pick.
  const lastWorkflowId = template?.workflowId;
  const workflowsInOrder = [...context.workflows].sort(
    (a, b) => Number(b.workflowId === lastWorkflowId) - Number(a.workflowId === lastWorkflowId) || a.slug.localeCompare(b.slug),
  );

  const onEnd = useCallback((end: string | null) => onChange({ end }), [onChange]);
  const scopeOpenChange = (placement: 'chip' | 'row') => (open: boolean) => {
    setScopeOpenAs(open ? placement : null);
    if (!open) focusWhenDrawn(DRAFT_SCOPE_ID, { fresh: true });
  };
  const updateOpenChange = (placement: 'chip' | 'row') => (open: boolean) => {
    setUpdateOpenAs(open ? placement : null);
    if (!open) focusWhenDrawn(DRAFT_UPDATE_TYPE_ID, { fresh: true });
  };

  const scopePicker = (asChip: boolean) => (
    <ScopePicker
      variants={context.variants}
      inScopeIds={scope.value}
      stageOrder={stageOrder}
      kindBySpaceId={kindBySpaceId}
      onChange={(out) => onChange({ out })}
      asChip={asChip}
      delta={asChip ? undefined : scopeDelta(scope.value, scope.last)}
      onOpenChange={scopeOpenChange(asChip ? 'chip' : 'row')}
    />
  );
  const updatePicker = (asChip: boolean) => (
    <UpdateTypePicker
      value={updateType.value}
      onPick={(value) => onChange({ update: value })}
      asChip={asChip}
      onOpenChange={updateOpenChange(asChip ? 'chip' : 'row')}
    />
  );
  const nameIsDefault = decisions.name.origin !== 'you';
  // Variants on no stage of the workflow: the server would accept them and no promotion reaches
  // them. They are chips beside the outliers, so their problem is not said again under the row.
  const outside = useMemo(() => {
    const nameOf = new Map(context.variants.map((variant) => [variant.spaceId, variant.name]));
    return preview.outsideStageSpaceIds.map((spaceId) => ({ spaceId, name: nameOf.get(spaceId) ?? '' })).filter((variant) => variant.name !== '');
  }, [context.variants, preview.outsideStageSpaceIds]);
  const whereProblems = problemsOf('where').filter((problem) => problem.code !== 'outside-every-stage' || outside.length === 0);

  return (
    <Box
      role="table"
      aria-label={copy.label}
      data-testid="draft-ledger"
      sx={{
        marginTop: '14px',
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: `${changeOrderShape.radius.lg}px`,
        overflow: 'hidden',
        background: changeOrderSurface.card,
      }}
    >
      <LedgerRow
        variant="head"
        row="template"
        label={
          <Box component="span" sx={VISUALLY_HIDDEN_SX}>
            {copy.decision}
          </Box>
        }
        need={needs.get('template')}
        onFix={onChange}
        problems={problemsOf('template')}
        was={
          <>
            {template === undefined ? <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 15 }} /> : <HistoryIcon aria-hidden sx={{ fontSize: 15 }} />}
            <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.strong, color: changeOrderInk.default, fontSize: 12 }}>
              {templateLabel}
            </Box>
          </>
        }
        now={
          <Box component="b" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.strong, color: changeOrderInk.default, fontSize: 12 }}>
            {decisions.name.value || copy.none}
          </Box>
        }
      />

      <LedgerRow
        label={copy.what}
        row="what"
        need={needs.get('what')}
        onFix={onChange}
        problems={problemsOf('what')}
        testId="draft-row-what"
        was={
          <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: template === undefined ? changeOrderInk.subtle : changeOrderInk.muted }}>
            {template === undefined ? copy.none : copy.baseChanges}
          </Box>
        }
        now={<KindChip count={cards.status === 'resolved' ? cards.cards.length : undefined} />}
      />

      <LedgerRow
        label={copy.howMuch}
        row="howMuch"
        need={needs.get('howMuch')}
        onFix={onChange}
        problems={problemsOf('howMuch')}
        testId="draft-row-how-much"
        span={<ChangeCardRibbon cards={cards} startLabel={template?.slug} onEnd={onEnd} onRetry={onRetryCards} />}
      />

      <LedgerRow
        variant="outcome"
        label={copy.where}
        row="where"
        need={needs.get('where')}
        onFix={onChange}
        problems={whereProblems}
        busy={preview.status === 'loading'}
        testId="draft-row-where"
        was={scope.last === undefined ? NONE : <LastFigure count={scope.last.length} />}
        now={
          <WhereNow
            preview={preview}
            outside={outside}
            workflowSlug={workflow.value.kind === 'workflow' ? workflow.value.workflow.slug : undefined}
            onShow={onShow}
            onLeaveOut={onLeaveOut}
            onLeaveOutSpaces={onLeaveOutSpaces}
            onRetry={onRetryPreview}
          />
        }
      />

      {scopeInRow ? (
        <LedgerRow
          label={copy.scope}
          diff={scope.differsFromLast}
          testId="draft-row-scope"
          was={<Box component="span" sx={scope.differsFromLast ? STRUCK_SX : SAME_VALUE_SX}>{copy.variants(scope.last?.length ?? 0)}</Box>}
          now={
            <>
              <Provenance origin={scope.origin} />
              {scopePicker(false)}
            </>
          }
          revert={{ label: copy.revertLabel(copy.scope), onClick: () => onChange({ out: null }) }}
        />
      ) : null}

      {updateInRow ? (
        <LedgerRow
          label={copy.updateType}
          diff={updateType.differsFromLast}
          testId="draft-row-update-type"
          was={<Box component="span" sx={updateType.differsFromLast ? STRUCK_SX : SAME_VALUE_SX}>{updateType.last}</Box>}
          now={
            <>
              <Provenance origin={updateType.origin} />
              {updatePicker(false)}
            </>
          }
          revert={{ label: copy.revertLabel(copy.updateType), onClick: () => onChange({ update: null }) }}
        />
      ) : null}

      <LedgerRow
        label={copy.path}
        row="path"
        need={needs.get('path')}
        onFix={onChange}
        problems={problemsOf('path')}
        diff={workflowDiffers}
        testId="draft-row-path"
        was={template === undefined ? NONE : <LastWorkflow workflowId={template.workflowId} differs={workflowDiffers} />}
        now={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', minWidth: 0 }}>
            <Provenance origin={workflow.origin} />
            <WorkflowPicker
              value={workflow.value}
              workflows={workflowsInOrder}
              required={context.policy.required}
              componentName={componentName}
              onPick={(wf) => onChange({ wf })}
            />
            {context.policy.required ? (
              <RequiredBadge componentName={componentName} allowed={context.workflows.map((item) => item.slug).join(', ')} />
            ) : null}
          </Box>
        }
        revert={workflow.origin === 'you' && template !== undefined ? { label: copy.revertLabel(copy.path), onClick: () => onChange({ wf: null }) } : undefined}
      />

      <LedgerRow
        label={copy.name}
        row="name"
        need={needs.get('name')}
        testId="draft-row-name"
        was={
          template === undefined ? (
            NONE
          ) : (
            <Box component="span" translate="no" sx={decisions.name.differsFromLast ? STRUCK_QUIET_SX : SAME_VALUE_SX}>
              {template.slug}
            </Box>
          )
        }
        now={
          <>
            <Provenance
              origin={decisions.name.origin}
              label={nameIsDefault ? copy.defaultName : undefined}
              line={nameIsDefault && template !== undefined ? copy.datedLike(template.slug) : undefined}
            />
            <Box
              component="button"
              type="button"
              aria-label={copy.editName(decisions.name.value)}
              onClick={() => focusWhenDrawn(DRAFT_NAME_INPUT_ID, { select: true })}
              sx={FIELD_BUTTON_SX}
            >
              <Box component="span" translate="no" sx={NOW_VALUE_SX}>
                {decisions.name.value || copy.none}
              </Box>
              <EditOutlinedIcon aria-hidden sx={{ fontSize: 14, color: changeOrderInk.subtle }} />
            </Box>
          </>
        }
        revert={nameIsDefault ? undefined : { label: copy.defaultName, onClick: () => onChange({ name: null }) }}
      />

      <LedgerRow
        variant="same"
        row="same"
        label={
          <>
            <HistoryIcon aria-hidden />
            {copy.same}
          </>
        }
        need={needs.get('same')}
        onFix={onChange}
        problems={problemsOf('same')}
        testId="draft-row-same"
        span={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {scopeInRow ? null : scopePicker(true)}
            {updateInRow ? null : updatePicker(true)}
          </Box>
        }
      />
    </Box>
  );
});
