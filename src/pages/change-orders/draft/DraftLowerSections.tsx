// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The lower half of the "create a ChangeOrder" draft, in two parts, because the first sits
 * inside the page's summary card and the second below it:
 *
 * - `DraftSourceSections`: the image changes, the full diff "At the source", and "Passed over".
 *   Place it in the summary card's full-width row; the image changes' header band bleeds to the
 *   card's edges over `bleed` px of the card's padding.
 * - `DraftLowerSections`: the promotion path and the selected node's card, as cards of their
 *   own after the summary card.
 *
 * Both are memoised and take only the parts of `useChangeOrderDraft()` they read. The selected
 * node is the caller's (`decisions.stage`); a rail click calls `onSelectStage` with the node's id.
 */

import { memo, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import BlockIcon from '@mui/icons-material/Block';

import { TreeDiffSection } from '../../x/apps/TreeDiffSection';
import { SOURCE_STAGE_ID } from '../../x/apps/change-order/changeOrderStages';
import { COMPLETE_STAGE_ID } from '../changeOrderCompleteStep';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { onlyChangesHint } from '../imageChangeCopy';
import { ChangeOrderStageRail } from '../components/ChangeOrderStageRail';
import { FullDiffDisclosure, ImageChangeSummary } from '../components/ImageChangeHero';
import { PassedOver } from '../components/PassedOver';
import { SequenceProblems } from '../components/SequenceProblems';
import { UnitDiffRow } from '../components/UnitDiffRow';
import { useSharedDiffColumns } from '../useSharedDiffColumns';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import { draftFinalGates, draftGatesForStage } from './draftGates';
import { draftStageIdOf } from './draftDecisions';
import { draftCarriedCardCount, draftCompleteGateCount, draftRailStages, resolveDraftStageId } from './draftPath';
import { DraftCompleteCard, DraftSourceCard, DraftStageCard, LeaveOutButton } from './DraftStageCard';
import { retryKeepingFocus } from './draftRetryFocus';
import type { DraftVariant, DraftWorkflow } from './draftTypes';
import type { DraftChangeCards } from './useDraftChangeCards';
import type { DraftContext } from './useDraftContext';
import { DRAFT_SCOPE_STAGE_ID, type DraftPreview } from './useDraftPreview';
import type { DraftSourceDiff } from './useDraftSourceDiff';
import type { DraftValidation } from './useDraftValidation';

const H3_SX = {
  fontSize: changeOrderType.size.prose,
  lineHeight: changeOrderType.lineHeight.heading,
  fontWeight: changeOrderType.weight.semibold,
  margin: '0 0 8px',
} as const;


/**
 * Where a resource sits in the order the changes were made, as the ribbon lists them: the base
 * resource a change touched first ranks first, and a variant's resource ranks as its base's.
 */
function useMadeOrderRank({ cards, variantUnits }: Pick<DraftChangeCards, 'cards' | 'variantUnits'>): (unitId: string) => number {
  return useMemo(() => {
    const rank = new Map<string, number>();
    cards.forEach((card, index) => {
      for (const revision of card.revisions) if (!rank.has(revision.unitId)) rank.set(revision.unitId, index);
    });
    const upstreamOf = new Map(variantUnits.map((unit) => [unit.unitId, unit.upstreamUnitId]));
    return (unitId: string) => rank.get(upstreamOf.get(unitId) ?? unitId) ?? cards.length;
  }, [cards, variantUnits]);
}

/** Ids a retry hands focus to once its section has redrawn without the retry. */
const SOURCE_SECTIONS_ID = 'draft-source-sections';
const PATH_HEADING_ID = 'draft-path-heading';

/** A heading or block a retry may hand focus to: focusable from code, never by Tab. */
const FOCUS_TARGET_SX = { '&:focus': { outline: 'none' } } as const;

/** The image changes' shape while the change at the source is read: its header band and two rows. */
function HeroSkeleton() {
  return (
    <Box aria-hidden="true" data-testid="draft-hero-loading" sx={{ borderTop: `1px solid ${changeOrderBorder.default}`, marginTop: '14px' }}>
      <Box sx={{ padding: '10px 16px 10px 20px', background: changeOrderSurface.sunk, borderBottom: `1px solid ${changeOrderBorder.default}` }}>
        <Skeleton variant="text" width={180} height={22} />
      </Box>
      {[0, 1].map((i) => (
        <Box key={i} sx={{ display: 'flex', gap: '24px', alignItems: 'center', padding: '16px 18px 16px 20px' }}>
          <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: '9px', flex: 'none' }} />
          <Skeleton variant="text" sx={{ flex: 1 }} height={22} />
          <Skeleton variant="rounded" sx={{ flex: 1.5, borderRadius: `${changeOrderShape.radius.lg}px` }} height={62} />
          <Skeleton variant="text" sx={{ flex: 0.8 }} height={22} />
        </Box>
      ))}
    </Box>
  );
}

export interface DraftSourceSectionsProps {
  source: DraftSourceDiff;
  validation: DraftValidation;
  /** For the order of the full diff (the order the changes were made) and the names of what is passed over. */
  cards: DraftChangeCards;
  baseSpace: DraftContext['baseSpace'];
  /** The chosen workflow's stage names, in order; empty without one. */
  stageNames: readonly string[];
  /** The summary card's horizontal padding, which the image changes' header band bleeds over. */
  bleed?: number;
}

/**
 * Whether the change at the source cannot be said: its read failed, or the data layer says it
 * is undetermined (no variant in scope, so no start; a MergeUnits change, whose Links no dry run
 * here resolves; an end that names nothing). Any diff shown then would be a guess.
 */
function sourceUndetermined(source: DraftSourceDiff): boolean {
  return (source.status !== 'loading' && source.status !== 'resolved') || source.imageChanges.status === 'unavailable';
}

/**
 * What the draft changes at the source: the image changes, the full diff, and the resources
 * the server's dry run of the create says it would pass over.
 */
export const DraftSourceSections = memo(function DraftSourceSections({
  source,
  validation,
  cards,
  baseSpace,
  stageNames,
  bleed = 20,
}: DraftSourceSectionsProps) {
  const columns = useSharedDiffColumns();
  const baseSpaceId = baseSpace?.spaceId;
  const baseSlug = baseSpace?.slug ?? '';

  const counts = useMemo(() => {
    let changes = 0;
    let resources = 0;
    for (const group of source.sourceGroups) {
      if (group.fieldDiffs.length === 0) continue;
      changes += group.fieldDiffs.length;
      resources += 1;
    }
    return { changes, resources };
  }, [source.sourceGroups]);

  const rank = useMadeOrderRank(cards);
  const changedGroups = useMemo(
    () => source.sourceGroups.filter((group) => group.fieldDiffs.length > 0).sort((a, b) => rank(a.unitId) - rank(b.unitId)),
    [source.sourceGroups, rank],
  );

  const images = source.imageChanges;
  const imagesOnly = images.status === 'some' && images.fieldChanges.count === 0;
  const [fullDiffOverride, setFullDiffOverride] = useState<boolean | undefined>(undefined);
  const fullDiffOpen = fullDiffOverride ?? !imagesOnly;
  const [passedOpen, setPassedOpen] = useState(false);

  const skippedUnits = useMemo(
    () => Object.fromEntries(validation.skippedUnits.map((unit) => [unit.unitId, unit.reason])),
    [validation.skippedUnits],
  );
  const slugByUnitId = useMemo(() => new Map(cards.baseUnits.map((unit) => [unit.unitId, unit.slug])), [cards.baseUnits]);
  const spaceIdByUnitId = useMemo(
    () => new Map(baseSpaceId === undefined ? [] : cards.baseUnits.map((unit) => [unit.unitId, baseSpaceId])),
    [cards.baseUnits, baseSpaceId],
  );

  const undetermined = sourceUndetermined(source);
  const retrySource = useMemo(() => retryKeepingFocus(source.retry, SOURCE_SECTIONS_ID), [source.retry]);
  const retryValidation = useMemo(() => retryKeepingFocus(validation.retry, SOURCE_SECTIONS_ID), [validation.retry]);
  let hero;
  if (undetermined) {
    hero = (
      <CouldNotEstablish
        framed
        testId="draft-source-unknown"
        subject={draftCopy.path.imageChanges}
        reason={source.reason}
        onRetry={source.status === 'failed' ? retrySource : undefined}
        retryWhat={draftCopy.path.retryImageChanges}
      />
    );
  } else if (source.status === 'loading' || images.status === 'loading') {
    hero = (
      <Box sx={{ marginX: `-${bleed}px` }}>
        <HeroSkeleton />
      </Box>
    );
  } else {
    hero = (
      <Box sx={{ marginX: `-${bleed}px` }}>
        <ImageChangeSummary changes={images} stageNames={stageNames} meta="bump" inset={bleed} />
      </Box>
    );
  }

  return (
    <Box id={SOURCE_SECTIONS_ID} tabIndex={-1} data-testid="draft-source-sections" sx={FOCUS_TARGET_SX}>
      {hero}
      {!undetermined && source.status === 'resolved' && changedGroups.length > 0 ? (
        <FullDiffDisclosure
          changeCount={counts.changes}
          unitCount={counts.resources}
          imagesOnly={imagesOnly}
          hintText={images.status === 'some' ? onlyChangesHint(images.images) : undefined}
          expanded={fullDiffOpen}
          onToggle={() => setFullDiffOverride(!fullDiffOpen)}
          idPrefix="draft"
          renderBody={() => (
            <Box component="section" role="region" aria-label={draftCopy.path.atTheSource} sx={{ marginTop: '14px' }}>
              <Box component="h3" sx={H3_SX}>
                {draftCopy.path.atTheSource}
              </Box>
              {changedGroups.map((group) => (
                <UnitDiffRow
                  key={group.unitId}
                  unitId={group.unitId}
                  spaceId={baseSpaceId ?? ''}
                  slug={group.resourceName}
                  resourceKind={group.resourceKind}
                  spaceName={baseSlug}
                  changed
                  diff={group.diff}
                  columns={columns.columns}
                  fallback={
                    <TreeDiffSection
                      entry={{ unitId: group.unitId, fieldDiffs: group.fieldDiffs }}
                      allPaths={group.allPaths}
                      keyPrefix="draft-source"
                      label=""
                      hideLabel
                      variant="data"
                      columnStyle={columns.columnStyle}
                      onDividerMouseDown={columns.onDividerMouseDown}
                      isDragging={columns.isDragging}
                    />
                  }
                />
              ))}
            </Box>
          )}
        />
      ) : null}
      {validation.status === 'failed' ? (
        <CouldNotEstablish
          framed
          subject={draftCopy.path.passedOver}
          onRetry={retryValidation}
          retryWhat={draftCopy.page.retryWhat.createDryRun}
        />
      ) : null}
      <PassedOver
        skippedUnits={skippedUnits}
        spaceIdByUnitId={spaceIdByUnitId}
        slugByUnitId={slugByUnitId}
        fallbackLabel={draftCopy.path.baseResource}
        expanded={passedOpen}
        onToggle={() => setPassedOpen((open) => !open)}
        sx={{ marginTop: '14px' }}
      />
    </Box>
  );
});

export interface DraftLowerSectionsProps {
  preview: DraftPreview;
  /** For the source node's count and the order of each card's resources. */
  cards: DraftChangeCards;
  componentSlug: string | undefined;
  baseSpace: DraftContext['baseSpace'];
  variants: readonly DraftVariant[];
  /** The chosen workflow; `undefined` for none, or none picked yet. */
  workflow: DraftWorkflow | undefined;
  /** The in-scope variants' Space ids, in scope order. */
  scope: readonly string[];
  /** `Invoke` for an Invoke draft; a fan-out type for Transform paths. */
  updateType: string;
  /**
   * What the rail's source node says for a kind that carries no base changes: an Invoke draft's
   * Invocation or function, with "Change defined" as the detail view says it; a Transform paths
   * kind's source Spaces, with how much it carries.
   */
  source?: { summary: string; verdict?: string };
  /** The selected node, `decisions.stage`: a stage name, or the source's or Complete's id. Absent: the page's choice. */
  stage: string | undefined;
  /** A rail click, with the node's id: pass it to `draft.update({ stage })`, which writes the URL's word. */
  onSelectStage: (stageId: string) => void;
  /**
   * A variant to show in its stage's card, as an outlier chip's "Show" does: the cards open
   * with it as its outcome group's representative. Select its stage with `draftStageOfSpace`.
   */
  shownSpaceId?: string;
  /** Leave variants out of the scope: the path's "outside every stage" line and the unknown note offer it. */
  onLeaveOut: (spaceIds: readonly string[]) => void;
  /** For the caller to move focus into the stage card. */
  handleRef?: Ref<DraftLowerSectionsHandle>;
}

export interface DraftLowerSectionsHandle {
  /**
   * Move focus to a variant's chip in the stage card, as soon as it is drawn: after a "Show",
   * the stage, the cards and the chip all change in the render the "Show" causes.
   */
  focusVariant: (spaceId: string) => void;
  /** The selected node's card, to scroll to: `null` until it is drawn. */
  stageCard: () => HTMLElement | null;
}

/** "Promotion path". */
function PathHeading() {
  return (
    <Box component="h2" id={PATH_HEADING_ID} tabIndex={-1} sx={{ ...H3_SX, margin: '0 0 12px', ...FOCUS_TARGET_SX }}>
      {draftCopy.path.heading}
    </Box>
  );
}

const CARD_SX = {
  marginTop: '20px',
  background: changeOrderSurface.card,
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderCardTokens.radius}px`,
  boxShadow: changeOrderCardTokens.shadow,
  padding: '20px 20px 22px',
} as const;

/** A slug or a workflow name, set as code in a sentence. */
interface CodeChipProps {
  children: ReactNode;
}

function CodeChip({ children }: CodeChipProps) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: changeOrderFontMono,
        fontSize: changeOrderType.size.micro,
        background: changeOrderSurface.inset,
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '0 4px',
        color: changeOrderInk.default,
      }}
    >
      {children}
    </Box>
  );
}

/** "payments-dev outside every stage of hotfix · Leave out": in scope, and on no stage of the path. */
interface OutsideEveryStageProps {
  spaceIds: readonly string[];
  nameBySpaceId: ReadonlyMap<string, string>;
  workflowSlug: string;
  onLeaveOut: ((spaceIds: readonly string[]) => void) | undefined;
}

function OutsideEveryStage({ spaceIds, nameBySpaceId, workflowSlug, onLeaveOut }: OutsideEveryStageProps) {
  const names = spaceIds.map((spaceId) => nameBySpaceId.get(spaceId) ?? draftCopy.path.aVariant);
  const named = names.length === 1 ? names[0] : draftCopy.path.outsideVariants(names.length);
  return (
    <Box
      data-testid="draft-outside-every-stage"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        marginTop: '10px',
        fontSize: changeOrderType.size.small,
        color: changeOrderInk.muted,
      }}
    >
      <BlockIcon aria-hidden="true" sx={{ fontSize: 14, color: changeOrderInk.subtle }} />
      <span>
        <CodeChip>{named}</CodeChip> {draftCopy.path.outsideEveryStage} <CodeChip>{workflowSlug}</CodeChip>
      </span>
      {onLeaveOut !== undefined ? (
        <LeaveOutButton onClick={() => onLeaveOut(spaceIds)} ariaLabel={draftCopy.path.leaveOutNamed(names.join(', '))} />
      ) : null}
    </Box>
  );
}

/** The draft's promotion path, every gate not evaluated, and the selected node's dry run. */
export const DraftLowerSections = memo(function DraftLowerSections({
  preview,
  cards,
  componentSlug,
  baseSpace,
  variants,
  workflow,
  scope,
  updateType,
  source,
  stage,
  onSelectStage,
  shownSpaceId,
  onLeaveOut,
  handleRef,
}: DraftLowerSectionsProps) {
  const columns = useSharedDiffColumns();
  const unitRank = useMadeOrderRank(cards);
  const [focusSpaceId, setFocusSpaceId] = useState<string | undefined>(undefined);
  const cardSlot = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    handleRef,
    () => ({
      focusVariant: setFocusSpaceId,
      stageCard: () => (cardSlot.current?.firstElementChild instanceof HTMLElement ? cardSlot.current.firstElementChild : null),
    }),
    [],
  );
  const onFocused = useCallback(() => setFocusSpaceId(undefined), []);
  const sequence = preview.sequence;
  const base = baseSpace?.slug ?? '';
  const resolved = preview.status === 'resolved';
  const retryPreview = useMemo(() => retryKeepingFocus(preview.retry, PATH_HEADING_ID), [preview.retry]);

  const railStages = useMemo(
    () =>
      sequence === undefined || workflow === undefined
        ? []
        : draftRailStages({ sequence, spec: workflow.spec, stages: preview.stages, resolved, base }),
    [sequence, workflow, preview.stages, resolved, base],
  );
  const regionBySpaceId = useMemo(() => new Map(variants.map((variant) => [variant.spaceId, variant.region])), [variants]);
  const slugBySpaceId = useMemo(() => new Map(variants.map((variant) => [variant.spaceId, variant.slug])), [variants]);
  const carried = cards.status === 'resolved' ? draftCarriedCardCount(cards.cards) : undefined;
  let sourceSummary = carried === undefined ? '' : draftCopy.path.sourceSummary(carried);
  if (source !== undefined) sourceSummary = source.summary;
  const sourceVerdict = source?.verdict;

  const common = {
    preview,
    componentSlug,
    baseSpaceId: baseSpace?.spaceId,
    updateType,
    regionBySpaceId,
    shownSpaceId,
    columns,
    unitRank,
    inScopeSpaceIds: scope,
    slugBySpaceId,
    focusSpaceId,
    onFocused,
    onRetry: preview.retry,
    onLeaveOut,
  };

  if (sequence === undefined || workflow === undefined) {
    const scopeStage = preview.stages.find((s) => s.stageId === DRAFT_SCOPE_STAGE_ID);
    return (
      <>
        {/* With no workflow there is no path past the source: the rail is the source node alone. */}
        <Box component="section" role="region" aria-label={draftCopy.path.heading} data-testid="draft-path" sx={CARD_SX}>
          <PathHeading />
          <ChangeOrderStageRail
            preview
            stages={[{ stageId: SOURCE_STAGE_ID, isSource: true, variantCount: 0, gateCount: 0 }]}
            selectedStageId={undefined}
            sourceSummary={sourceSummary}
            sourceVerdict={sourceVerdict}
            complete={null}
          />
        </Box>
        <div ref={cardSlot}>
          <DraftStageCard
            key={DRAFT_SCOPE_STAGE_ID}
            stageId={DRAFT_SCOPE_STAGE_ID}
            title={draftCopy.path.scopeStage}
            spaceIds={scope}
            gates={undefined}
            isFirst={false}
            stagePreview={scopeStage}
            {...common}
          />
        </div>
      </>
    );
  }

  const selectedId = resolveDraftStageId({
    requested: draftStageIdOf(stage, workflow.stageNames),
    sequence,
    stages: preview.stages,
    hasComplete: true,
  });
  const selected = sequence.stages.find((s) => s.id === selectedId);
  const stagePreview = preview.stages.find((s) => s.stageId === selectedId);
  const outside = preview.outsideStageSpaceIds;

  let card;
  if (selectedId === COMPLETE_STAGE_ID) {
    card = <DraftCompleteCard gates={draftFinalGates(workflow.spec, base)} />;
  } else if (selected?.isSource) {
    card = <DraftSourceCard />;
  } else if (selected !== undefined) {
    card = (
      <DraftStageCard
        key={selected.id}
        stageId={selected.id}
        title={selected.id}
        spaceIds={stagePreview?.spaceIds ?? selected.spaceIds}
        gates={draftGatesForStage(workflow.spec, selected.id, base)}
        isFirst={selected.isFirst}
        stagePreview={stagePreview}
        {...common}
      />
    );
  }

  return (
    <>
      <Box component="section" role="region" aria-label={draftCopy.path.heading} data-testid="draft-path" sx={CARD_SX}>
        <PathHeading />
        <ChangeOrderStageRail
          preview
          stages={railStages}
          selectedStageId={selectedId}
          sourceSummary={sourceSummary}
          sourceVerdict={sourceVerdict}
          complete={{ gateCount: draftCompleteGateCount(workflow.spec, base) }}
          onSelectStage={onSelectStage}
        />
        {preview.status === 'failed' ? (
          <Box sx={{ marginTop: '10px' }}>
            <CouldNotEstablish
              subject={draftCopy.path.dryRun}
              onRetry={retryPreview}
              retryWhat={draftCopy.page.retryWhat.dryRun}
            />
          </Box>
        ) : null}
        {outside.length > 0 ? (
          <OutsideEveryStage
            spaceIds={outside}
            nameBySpaceId={preview.nameBySpaceId}
            workflowSlug={workflow.slug}
            onLeaveOut={onLeaveOut}
          />
        ) : null}
        {/* With nothing in scope every stage selects nothing; the problem under the outcome says that once. */}
        {scope.length > 0 ? <SequenceProblems problems={sequence.problems} /> : null}
      </Box>
      <div ref={cardSlot}>{card}</div>
    </>
  );
});
