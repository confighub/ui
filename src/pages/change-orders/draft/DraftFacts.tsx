// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useMemo } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import UpdateOutlinedIcon from '@mui/icons-material/UpdateOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import { componentTheme } from '../../x/apps/componentTheme';
import { ROUTE_COMPONENTS } from '../../x/apps/appTypes';
import { Fact, FactLink } from '../components/SummaryFacts';
import {
  changeOrderFontMono,
  changeOrderInk,
  changeOrderStatus,
  changeOrderType,
} from '../changeOrdersTokens';
import { ChangeCardEnd, ChangeCardRibbon } from './ChangeCardRibbon';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import { type DraftAddress, type DraftAddressPatch, type DraftDecisions, kindSwitchPatch, workflowGovernsKind } from './draftDecisions';
import { draftPlaceId, draftProblemId } from './draftFocus';
import { DRAFT_EASE, FACT_MONO_SX, FIGURE_SX, FOCUS_RING, PLACE_SX } from './draftLook';
import { outcomeKindBySpaceId, outlierActions, type OutlierAction } from './draftPageModel';
import { DraftPeek } from './DraftPeek';
import { DraftProblems } from './DraftProblems';
import { OutlierChips, OutsideChips, type OutsideVariant } from './OutlierChips';
import { ScopePicker } from './ScopePopover';
import type { DraftProblem, DraftRow, DraftWorkflow } from './draftTypes';
import type { DraftChangeCards } from './useDraftChangeCards';
import type { DraftContext } from './useDraftContext';
import type { DraftPreview } from './useDraftPreview';
import { DRAFT_UPDATE_TYPES } from './draftUpdateTypes';
import { SAID_IN_ROW } from './draftInvoke';
import { FanOutRows } from './FanOutRows';
import { InvokeRows } from './InvokeRows';
import { KindTrack } from './KindTrack';
import { UpdateTypeBar } from './UpdateTypeBar';
import type { DraftInvokeRead } from './useDraftInvoke';
import type { DraftFanOutRead } from './useDraftFanOut';
import type { DraftSkippedUnit } from './draftValidation';
import type { DraftInvokePreview } from './useDraftInvokePreview';
import type { DraftLinkedSpacesRead } from './useDraftLinkedSpaces';
import { WorkflowPicker } from './WorkflowPopover';

const copy = draftCopy.page.facts;

/** A workflow whose first stage has prerequisites cannot govern an Invoke ChangeOrder: the server refuses it. */
const gatedFirstStageReason = (workflow: DraftWorkflow) =>
  workflowGovernsKind(workflow, 'invoke') ? undefined : draftCopy.invoke.problems.gatedFirstStage(workflow.slug);

/** Problems an Invoke row says itself, or holds back until there is something typed to be wrong. */
const QUIET_IN_LIST: ReadonlySet<string> = new Set([...SAID_IN_ROW, 'arg-empty', 'tag-empty']);

const NO_TAGS: ReadonlyMap<string, string> = new Map();
const NO_TAGS_IN_SCOPE: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map();

/** Component, Base Space, Workflow, Scope, Opened, Last activity: the detail view's facts a draft has. */
const FACT_COUNT = 6;

/**
 * No value: a fact a draft does not have yet ("Opened", "Last activity"), or a dry run with
 * nothing to say. Quiet, in the facts' size, and plainly not a slot.
 */
const DASH = (
  <Box component="span" sx={{ color: changeOrderInk.subtle, fontSize: changeOrderType.size.prose }}>
    {copy.none}
  </Box>
);

/** The ids of `problems`, as the words under the card carry them. */
const idsOf = (problems: readonly DraftProblem[]) => problems.map(draftProblemId);

/** The policy's shield beside the workflow: it requires one. Its peek names what the policy allows. */
interface RequiredShieldProps {
  componentName: string;
  /** The workflows the policy allows, by slug. */
  allowed: string;
}

function RequiredShield({ componentName, allowed }: RequiredShieldProps) {
  const required = draftCopy.page.workflow.requiredMetric;
  return (
    <DraftPeek
      spec={{
        eyebrow: draftCopy.page.workflow.title(componentName),
        icon: <VerifiedUserOutlinedIcon aria-hidden />,
        title: required,
        lines: [draftCopy.page.workflow.allowed(allowed)],
      }}
    >
      <Box
        component="span"
        tabIndex={0}
        role="img"
        // The peek describes it with the rest; its name says it once.
        aria-label={required}
        data-testid="draft-workflow-required"
        sx={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 18,
          height: 18,
          borderRadius: '5px',
          flex: 'none',
          background: changeOrderStatus.progressSoft,
          color: changeOrderStatus.progress,
          cursor: 'default',
          '&:focus-visible': FOCUS_RING,
        }}
      >
        <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 13 }} />
      </Box>
    </DraftPeek>
  );
}

interface OutcomeProps {
  preview: DraftPreview;
  /** No variant is in scope: the dry run has nothing to say, and the problem under the line says why. */
  scopeEmpty: boolean;
  /** In scope and on no stage of the workflow, by display name. */
  outside: readonly OutsideVariant[];
  workflowSlug: string | undefined;
  onShow: (item: OutlierAction) => void;
  onLeaveOut: (item: OutlierAction) => void;
  onLeaveOutSpaces: (spaceIds: readonly string[]) => void;
  onRetry?: () => void;
}

/** The outcome line's content: "N of M same", then the variants that are not, on one line that wraps. */
function Outcome({ preview, scopeEmpty, outside, workflowSlug, onShow, onLeaveOut, onLeaveOutSpaces, onRetry }: OutcomeProps) {
  if (scopeEmpty) return DASH;
  if (preview.status === 'loading') {
    return (
      <>
        <Skeleton variant="text" width={90} height={30} />
        <Skeleton variant="rounded" width="min(60%, 520px)" height={26} />
      </>
    );
  }
  // Resolved with no totals: nothing is carried, or no variant is in scope. No figure is the answer.
  if (preview.status === 'resolved' && preview.totals === undefined) {
    if (preview.idle === undefined) return DASH;
    return (
      <Box component="span" data-testid="draft-outcome-idle" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
        {preview.idle}
      </Box>
    );
  }
  if (preview.status !== 'resolved' || preview.totals === undefined) {
    return (
      <CouldNotEstablish
        onRetry={preview.status === 'failed' ? onRetry : undefined}
        retryWhat={draftCopy.page.retryWhat.dryRun}
        focusAfterRetry={draftPlaceId('outcome')}
        reason={preview.reason}
      />
    );
  }
  const items = outlierActions(preview);
  const undetermined = preview.undeterminedSpaceIds.length;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap', flex: 'none' }} data-testid="draft-same-figure">
        <Box component="b" sx={FIGURE_SX}>
          {preview.totals.same}
        </Box>
        <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
          {copy.ofSame(preview.totals.variants)}
        </Box>
      </Box>
      {items.length === 0 && undetermined === 0 && outside.length === 0 ? (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: changeOrderStatus.success, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.semibold }}>
          <CheckCircleIcon aria-hidden sx={{ fontSize: 16 }} />
          {copy.noOutliers}
        </Box>
      ) : null}
      {items.length === 0 ? null : <OutlierChips items={items} onShow={onShow} onLeaveOut={onLeaveOut} />}
      {outside.length === 0 || workflowSlug === undefined ? null : (
        <OutsideChips variants={outside} workflowSlug={workflowSlug} onLeaveOut={onLeaveOutSpaces} />
      )}
      {undetermined === 0 ? null : <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>{copy.undetermined(undetermined)}</Box>}
    </>
  );
}

export interface DraftFactsProps {
  context: DraftContext;
  decisions: DraftDecisions;
  cards: DraftChangeCards;
  /** Which variants each update type's Links reach: what the update type offers. */
  links: DraftLinkedSpacesRead;
  preview: DraftPreview;
  /** An Invoke draft's row and its reads. */
  invoke: DraftInvokeRead;
  /** An Invoke draft's preview, for the image tag's notes on the outcome line. */
  invokePreview?: DraftInvokePreview;
  /** A Transform paths kind's rows and reads, and whether the kind is offered. */
  fanOut: DraftFanOutRead;
  /** The create dry run's passed-over Units: for Transform paths, its sources. */
  skippedUnits: readonly DraftSkippedUnit[];
  /** What the URL says, for the kind switch. */
  address: DraftAddress;
  problemsByRow: ReadonlyMap<DraftRow, DraftProblem[]>;
  /** What the blocker beside Create names: its problem carries the rust edge. */
  nextRow: DraftRow | undefined;
  onChange: (patch: DraftAddressPatch) => void;
  onShow: (item: OutlierAction) => void;
  onLeaveOut: (item: OutlierAction) => void;
  /** Leave variants out by id, with the page's toast and Undo: the "outside every stage" fix. */
  onLeaveOutSpaces: (spaceIds: readonly string[]) => void;
  onRetryCards?: () => void;
  onRetryPreview?: () => void;
}

/**
 * Everything the draft decides, under its title, read in the order a reader asks: the settings
 * as the detail view's facts row (the two the draft can change open their popovers), the dry
 * run's answer to them, and the change itself: what kind, how it propagates (the update type,
 * under the kind's chip), and how much of it, as the ribbon of waiting changes. A decision this
 * draft changes from last time says what it was and has the way back beside it; each problem is
 * said under the part it is about, and the control it is about is described by it.
 */
export const DraftFacts = memo(function DraftFacts({
  context,
  decisions,
  cards,
  links,
  preview,
  invoke,
  invokePreview,
  fanOut,
  skippedUnits,
  address,
  problemsByRow,
  nextRow,
  onChange,
  onShow,
  onLeaveOut,
  onLeaveOutSpaces,
  onRetryCards,
  onRetryPreview,
}: DraftFactsProps) {
  const { scope, updateType, workflow } = decisions;
  const template = decisions.template.kind === 'changeOrder' ? decisions.template.changeOrder : undefined;
  const componentName = context.component?.name ?? context.baseSpace?.slug ?? '';
  const stageOrder = workflow.value.kind === 'workflow' ? workflow.value.workflow.stageNames : [];
  const kindBySpaceId = outcomeKindBySpaceId(preview);
  const problemsOf = (...rows: DraftRow[]) => rows.flatMap((row) => problemsByRow.get(row) ?? []);
  // A problem the row says beside its control is not said again under the row.
  const changeProblems = problemsOf('what', 'howMuch', 'same').filter((problem) => !QUIET_IN_LIST.has(problem.code));
  // Last time's workflow leads the picker; the rest by slug. The order does not move as you pick.
  const lastWorkflowId = template?.workflowId;
  const workflowsInOrder = [...context.workflows].sort(
    (a, b) => Number(b.workflowId === lastWorkflowId) - Number(a.workflowId === lastWorkflowId) || a.slug.localeCompare(b.slug),
  );
  const onEnd = useCallback((end: string | null) => onChange({ end }), [onChange]);
  // Variants on no stage of the workflow: the server would accept them and no promotion reaches
  // them. They are chips beside the outliers, so their problem is not said again under the line.
  const outside = useMemo(() => {
    const nameOf = new Map(context.variants.map((variant) => [variant.spaceId, variant.name]));
    return preview.outsideStageSpaceIds.map((spaceId) => ({ spaceId, name: nameOf.get(spaceId) ?? '' })).filter((variant) => variant.name !== '');
  }, [context.variants, preview.outsideStageSpaceIds]);
  const outcomeProblems = problemsOf('where').filter((problem) => problem.code !== 'outside-every-stage' || outside.length === 0);
  // The scope is what an outcome problem is about, except a variant outside every stage, which is the workflow's doing.
  const scopeProblems = outcomeProblems.filter((problem) => problem.code !== 'outside-every-stage');
  const isNext = (...rows: DraftRow[]) => nextRow !== undefined && rows.includes(nextRow);
  const kind = decisions.kind.value;
  const invokes = kind === 'invoke';
  // Transform paths is offered only where a variant in scope reads a shared source.
  const trackUnavailable = useMemo(
    () => (fanOut.offered === 'unavailable' ? { transformPaths: draftCopy.kinds.noSharedSource } : undefined),
    [fanOut.offered],
  );
  const chosenType = fanOut.fanOut?.type.value;
  const trackLabels = useMemo(() => (chosenType === undefined ? undefined : { transformPaths: draftCopy.fanOut.kindName[chosenType] }), [chosenType]);
  // Base changes chooses how it propagates; an Invoke draft has one way, and its row instead.
  const updateTypes = DRAFT_UPDATE_TYPES;
  // Changed from last time, and last time's can be gone back to: when its Links no longer reach
  // the scope, the type the draft takes instead is not a change anyone made.
  const updateTypeChanged =
    updateType.differsFromLast && updateType.last !== undefined && decisions.updateTypes[updateType.last] !== 'unavailable';
  const component = context.component;
  const baseSpace = context.baseSpace;

  return (
    <>
      <Box id={draftPlaceId('facts')} tabIndex={-1} data-testid="draft-facts" sx={{ ...PLACE_SX, marginTop: '16px' }}>
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${FACT_COUNT}, minmax(0, 1fr))`,
            gap: '14px',
            margin: 0,
            '@media (max-width: 1180px)': { gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' },
            // The links sit their rule clear of the slots' dashed one, and answer hover and the keyboard.
            '& a': {
              textUnderlineOffset: '3px',
              borderRadius: '3px',
              transition: `text-decoration-color .18s ${DRAFT_EASE}`,
              '&:hover': { textDecorationColor: changeOrderInk.muted },
              '&:focus-visible': FOCUS_RING,
            },
          }}
        >
          <Fact term={copy.component} icon={AccountTreeOutlinedIcon}>
            {component === undefined ? DASH : <FactLink href={`${ROUTE_COMPONENTS}?app=${encodeURIComponent(component.slug)}`}>{component.name}</FactLink>}
          </Fact>
          <Fact term={copy.baseSpace} icon={FolderOutlinedIcon}>
            {baseSpace === undefined ? (
              DASH
            ) : (
              <FactLink href={`/spaces/${baseSpace.spaceId}`}>
                <Box component="span" translate="no" sx={FACT_MONO_SX}>
                  {baseSpace.slug}
                </Box>
              </FactLink>
            )}
          </Fact>
          <Fact term={copy.workflow} icon={SchemaOutlinedIcon}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '100%', minWidth: 0 }}>
              <WorkflowPicker
                value={workflow.value}
                workflows={workflowsInOrder}
                required={context.policy.required}
                componentName={componentName}
                last={workflow.last}
                changed={workflow.differsFromLast}
                problemIds={idsOf(problemsOf('path'))}
                onPick={(wf) => onChange({ wf })}
                onRevert={() => onChange({ wf: null })}
                unusable={kind === 'baseChanges' ? undefined : gatedFirstStageReason}
              />
              {context.policy.required ? (
                <RequiredShield componentName={componentName} allowed={context.workflows.map((item) => item.slug).join(', ')} />
              ) : null}
            </Box>
          </Fact>
          <Fact term={draftCopy.page.scope.title} icon={FolderCopyOutlinedIcon}>
            <ScopePicker
              variants={context.variants}
              inScopeIds={scope.value}
              stageOrder={stageOrder}
              kindBySpaceId={kindBySpaceId}
              lastCount={scope.differsFromLast ? scope.last?.length : undefined}
              problemIds={idsOf(scopeProblems)}
              onChange={(out) => onChange({ out })}
            />
          </Fact>
          <Fact term={copy.opened} icon={CalendarTodayOutlinedIcon}>
            {DASH}
          </Fact>
          <Fact term={copy.lastActivity} icon={UpdateOutlinedIcon}>
            {DASH}
          </Fact>
        </Box>
        <DraftProblems place="facts" problems={problemsOf('path')} next={isNext('path')} onFix={onChange} />
      </Box>

      <Box sx={{ marginTop: '16px' }}>
        <Box
          id={draftPlaceId('outcome')}
          tabIndex={-1}
          role="group"
          aria-label={copy.outcome}
          aria-busy={preview.status === 'loading'}
          data-testid="draft-outcome"
          sx={{ ...PLACE_SX, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 14px', minHeight: 30, minWidth: 0 }}
        >
          <Outcome
            preview={preview}
            scopeEmpty={scope.value.length === 0}
            outside={outside}
            workflowSlug={workflow.value.kind === 'workflow' ? workflow.value.workflow.slug : undefined}
            onShow={onShow}
            onLeaveOut={onLeaveOut}
            onLeaveOutSpaces={onLeaveOutSpaces}
            onRetry={onRetryPreview}
          />
        </Box>
        <DraftProblems place="outcome" problems={outcomeProblems} next={isNext('where')} onFix={onChange} />
      </Box>

      <Box
        id={draftPlaceId('change')}
        tabIndex={-1}
        role="group"
        aria-label={copy.change}
        data-testid="draft-change"
        sx={{ ...PLACE_SX, marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${componentTheme.borderSubtle}`, borderRadius: 0 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <KindTrack
            value={kind}
            last={decisions.kind.last}
            changed={decisions.kind.differsFromLast}
            templates={decisions.kindTemplates}
            baseCount={cards.status === 'resolved' ? cards.cards.length : undefined}
            unavailable={trackUnavailable}
            labels={trackLabels}
            onPick={(next) => onChange(kindSwitchPatch({ next, address, decisions }))}
            onRevert={() => onChange({ kind: null })}
          />
          {kind === 'baseChanges' ? (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
              <ChangeCardEnd cards={cards} onEnd={onEnd} />
            </Box>
          ) : null}
        </Box>
        {invokes ? (
          <InvokeRows invoke={invoke.invoke} status={invoke.status} onRetry={invoke.retry} currentTags={invokePreview?.currentTags ?? NO_TAGS}
            tagsInScope={invokePreview?.tagsInScope ?? NO_TAGS_IN_SCOPE}
            onChange={onChange}
          />
        ) : null}
        {kind === 'transformPaths' ? (
          <FanOutRows fanOut={fanOut.fanOut} status={fanOut.status} onRetry={fanOut.retry} skippedUnits={skippedUnits} onChange={onChange} />
        ) : null}
        {kind !== 'baseChanges' ? null : (
          <UpdateTypeBar
            types={updateTypes}
            value={updateType.value}
            last={updateType.last}
            changed={updateTypeChanged}
            availability={decisions.updateTypes}
            linksStatus={links.status}
            onRetryLinks={links.retry}
            problemIds={idsOf(problemsOf('same'))}
            onPick={(value) => onChange({ update: value })}
            onRevert={() => onChange({ update: null })}
          />
        )}
        <DraftProblems place="change" problems={changeProblems} next={isNext('what', 'howMuch', 'same')} onFix={onChange} />
        {kind !== 'baseChanges' ? null : (
          // The ribbon's start flag sits clear of the sub bar above it.
          <Box sx={{ margin: '8px 0 14px' }}>
            <ChangeCardRibbon
              cards={cards}
              startLabel={template?.slug}
              onEnd={onEnd}
              onRetry={onRetryCards}
              emptySaid={changeProblems.some((problem) => problem.code === 'nothing-to-carry')}
            />
          </Box>
        )}
      </Box>
    </>
  );
});
