// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import DataObjectIcon from '@mui/icons-material/DataObject';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import type { ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';

import { unitConfigHref, unitLinksHref } from '../../unit-detail/unitDetailHrefs';
import { ChangeOrderGateList } from '../../x/apps/change-order/ChangeOrderGateList';
import { ChangeOrderUnitHeader } from '../../x/apps/change-order/ChangeOrderUnitHeader';
import { componentSpaceDeepLink } from '../../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderChangeGroup, ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import { TagBadge, TagBadgeLink, UnitHeaderRow, UnitSlug } from '../../x/apps/diffStyles';
import { componentTheme } from '../../x/apps/componentTheme';
import { computeFieldDiffs } from '../../x/apps/entryBuilders';
import { parseUnitData } from '../../x/apps/configParser';
import { COMPLETE_STAGE_ID, COMPLETE_STEP_LABEL } from '../changeOrderCompleteStep';
import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { OutcomeUnitDiff } from '../components/OutcomeUnitDiff';
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
import { GateDisclosure } from '../components/GateDisclosure';
import { OutcomeBreakdown } from '../components/OutcomeBar';
import { OutcomeGroupCards, type OutcomeCardContext } from '../components/OutcomeGroupCards';
import { OutcomeUnknownNote } from '../components/OutcomeUnknownNote';
import { outcomeSegments } from '../components/outcomeMeta';
import { StateChip } from '../components/SummaryFacts';
import { draftCopy } from './draftCopy';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftGateSummary } from './draftGates';
import { focusWhenDrawn } from './draftFocus';
import { retryKeepingFocus } from './draftRetryFocus';
import { DRAFT_TRANSITION, FOCUS_RING, PRESS } from './draftLook';
import { comparableGroupsOf, inScopeOrder } from './draftPath';
import type { DraftStagePreview } from './draftPreview';
import type { DraftClone, DraftPreview } from './useDraftPreview';

/** The diff columns every tree on the page shares (`useSharedDiffColumns`). */
export interface DraftDiffColumns {
  columns: ConfigDiffColumns;
  columnStyle: CSSProperties;
  onDividerMouseDown: ConfigDiffColumns['onDividerMouseDown'];
  isDragging: boolean;
}

/** A resource on a card: one a variant holds, or one the promotion would clone into it. */
interface DraftCardUnit {
  unitId: string;
  spaceId: string;
  slug: string;
  clone?: DraftClone;
}

/** A clone's card row id: it has no Unit of its own in the variant yet. */
const cloneUnitId = (clone: DraftClone) => `clone:${clone.spaceId}:${clone.baseUnitId}`;

/** The id of a stage card's "What this promotion writes" heading: where a retry leaves focus. */
const writesHeadingId = (stageId: string) => `draft-writes-${stageId}`;

/** A variant chip's id, unique on the page. */
const variantChipId = (stageId: string, spaceId: string) => `draft-chip-${stageId}-${spaceId}`;
/** A region chip's id: one per outcome group and region. */
const regionChipId = (stageId: string, kind: string, region: string) => `draft-chip-${stageId}-${kind}-${region}`;

/** More members than this and a card's chips are one per region, not per variant. */
const MAX_VARIANT_CHIPS = 6;

/** The card chrome every card on the page wears: `.card`, with a sunk head band. */
const CARD_SX = {
  marginTop: '20px',
  background: changeOrderSurface.card,
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderCardTokens.radius}px`,
  boxShadow: changeOrderCardTokens.shadow,
  overflow: 'clip',
} as const;

interface CardHeadProps {
  title: string;
  right?: ReactNode;
}

function CardHead({ title, right }: CardHeadProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        padding: '14px 20px',
        background: changeOrderSurface.sunk,
        borderBottom: `1px solid ${changeOrderBorder.default}`,
      }}
    >
      <Box
        component="h2"
        sx={{
          fontSize: changeOrderType.size.heading,
          lineHeight: changeOrderType.lineHeight.heading,
          fontWeight: changeOrderType.weight.semibold,
          fontFamily: changeOrderFontMono,
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        {title}
      </Box>
      <StateChip label={draftCopy.path.dryRun} tone={changeOrderInk.subtle} />
      {right !== undefined ? (
        <Box component="span" sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
          {right}
        </Box>
      ) : null}
    </Box>
  );
}

const NOTE_SX = { fontSize: changeOrderType.size.body, color: changeOrderInk.muted } as const;

/** One variant's chip on a card: pressed when its resources are the ones the open card shows. */
interface VariantChipProps {
  label: ReactNode;
  pressed: boolean;
  onClick: () => void;
  /** The chip's id, so a "Show" elsewhere on the page can move focus to it (`focusWhenDrawn`). */
  id: string;
}

function VariantChip({ label, pressed, onClick, id }: VariantChipProps) {
  return (
    <Box
      component="button"
      type="button"
      id={id}
      aria-pressed={pressed}
      onClick={onClick}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        height: 22,
        padding: '0 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        border: `1px solid ${pressed ? changeOrderStatus.accent : changeOrderBorder.strong}`,
        boxShadow: pressed ? changeOrderSelectedRing : 'none',
        background: changeOrderSurface.card,
        fontFamily: changeOrderFontMono,
        fontSize: changeOrderType.size.small,
        color: pressed ? changeOrderStatus.accent : changeOrderInk.muted,
        whiteSpace: 'nowrap',
        transition: DRAFT_TRANSITION,
        '&:hover': { borderColor: pressed ? changeOrderStatus.accent : changeOrderInk.subtle },
        '&:focus-visible': FOCUS_RING,
        ...PRESS,
      }}
    >
      {label}
    </Box>
  );
}

export interface LeaveOutButtonProps {
  onClick: () => void;
  /** Says which variants, to a screen reader: the visible label is the bare verb. */
  ariaLabel: string;
}

/** "Leave out": a link-styled action in the accent, as the design's notes carry it. */
export function LeaveOutButton({ onClick, ariaLabel }: LeaveOutButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      sx={{
        all: 'unset',
        cursor: 'pointer',
        fontSize: changeOrderType.size.small,
        fontWeight: changeOrderType.weight.semibold,
        color: changeOrderStatus.accent,
        borderRadius: `${changeOrderShape.radius.sm}px`,
        transition: DRAFT_TRANSITION,
        '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
        '&:focus-visible': FOCUS_RING,
      }}
    >
      {draftCopy.path.leaveOut}
    </Box>
  );
}

/** A resource the promotion would clone into a variant: the base's configuration at the end, marked added. */
interface CloneRowProps {
  unit: DraftCardUnit & { clone: DraftClone };
  spaceName: string;
  spaceHref: string | undefined;
  baseSpaceId: string | undefined;
  /** Ask again for the clone's content, when its read failed. */
  onRetry: (() => void) | undefined;
}

function CloneRow({ unit, spaceName, spaceHref, baseSpaceId, onRetry }: CloneRowProps) {
  const { clone } = unit;
  const kind = useMemo(() => parseUnitData(clone.data).get('kind'), [clone.data]);
  const text = clone.data?.trimEnd();
  return (
    <Box>
      <UnitHeaderRow sx={{ cursor: 'default' }} data-testid={`draft-clone-${clone.spaceId}-${clone.baseUnitId}`}>
        <DataObjectIcon sx={{ fontSize: 15, color: componentTheme.fgMuted, flexShrink: 0 }} />
        {baseSpaceId !== undefined ? (
          <UnitSlug href={unitConfigHref(baseSpaceId, clone.baseUnitId)} target="_blank" rel="noopener noreferrer">
            {clone.slug}
          </UnitSlug>
        ) : (
          <Box component="span" sx={{ fontFamily: componentTheme.fontMono, fontSize: 14, fontWeight: 600 }}>
            {clone.slug}
          </Box>
        )}
        {spaceHref !== undefined ? (
          <TagBadgeLink href={spaceHref} target="_blank" rel="noopener noreferrer">
            {spaceName}
          </TagBadgeLink>
        ) : (
          <TagBadge>{spaceName}</TagBadge>
        )}
        {kind !== undefined ? <TagBadge>{kind}</TagBadge> : null}
        <TagBadge
          sx={{ color: changeOrderStatus.accent, background: changeOrderStatus.accentSoft, borderColor: changeOrderStatus.accentLine }}
        >
          {draftCopy.path.added}
        </TagBadge>
      </UnitHeaderRow>
      {clone.dataStatus === 'failed' ? (
        <Box sx={{ padding: '6px 16px 10px' }}>
          <CouldNotEstablish onRetry={onRetry} retryWhat={draftCopy.page.retryWhat.dryRun} />
        </Box>
      ) : text === undefined ? (
        <Box sx={{ padding: '6px 16px 10px' }}>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="45%" />
        </Box>
      ) : (
        // A resource added whole has no path changes: the document is the change, as the detail view shows one.
        <Box
          component="pre"
          data-testid="draft-clone-document"
          sx={{
            margin: 0,
            padding: '8px 16px',
            fontFamily: componentTheme.fontMono,
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: componentTheme.success,
          }}
        >
          {text}
        </Box>
      )}
    </Box>
  );
}

/** The skeleton of "What this promotion writes" while the dry run is out: the bar, then two cards. */
function WritesSkeleton() {
  return (
    <Box aria-hidden="true" data-testid="draft-writes-loading">
      <Skeleton variant="rounded" height={10} sx={{ borderRadius: `${changeOrderShape.radius.sm}px` }} />
      <Skeleton variant="text" width={260} sx={{ marginTop: '6px', marginBottom: '10px' }} />
      {[0, 1].map((i) => (
        <Skeleton key={i} variant="rounded" height={74} sx={{ borderRadius: `${changeOrderCardTokens.radius}px`, marginBottom: '14px' }} />
      ))}
    </Box>
  );
}

export interface DraftStageCardProps {
  stageId: string;
  /** The heading: the stage's name. */
  title: string;
  /** The in-scope variants the stage selects. */
  spaceIds: readonly string[];
  /** The gates into the stage, all not evaluated. `undefined` for a stage gates do not apply to (no workflow). */
  gates: ChangeOrderGate[] | undefined;
  /** The stage's gates are those of the first stage, which has no previous stage. */
  isFirst: boolean;
  preview: DraftPreview;
  /** The preview of this stage, once `preview.status` is `resolved`. */
  stagePreview: DraftStagePreview | undefined;
  componentSlug: string | undefined;
  baseSpaceId: string | undefined;
  /** For each card's "Links" badge: the Links of this update type the change travels over. */
  updateType: string;
  regionBySpaceId: ReadonlyMap<string, string | undefined>;
  /** A variant to show in its card, as after an outlier's "Show": the cards open with it as its group's representative. */
  shownSpaceId: string | undefined;
  columns: DraftDiffColumns;
  /** Where a variant's resource sits in the change's order (by its base resource); lower first. */
  unitRank: (unitId: string) => number;
  /** The variants in scope, in the scope's order: the order chips are listed in. */
  inScopeSpaceIds: readonly string[];
  /** Each variant's slug, for the header's names. */
  slugBySpaceId: ReadonlyMap<string, string>;
  /** Move focus to this variant's chip once it is drawn, then call `onFocused`. */
  focusSpaceId?: string;
  onFocused?: () => void;
  /** Ask for the dry run again, offered beside "Could not establish". */
  onRetry?: () => void;
  /** Leave variants out of the scope: offered for the variants nobody could read. */
  onLeaveOut?: (spaceIds: readonly string[]) => void;
}

/**
 * The selected stage of a draft: its gates, all not evaluated, and what the dry run says
 * promoting into it would write, as the detail view's stage card says it, with the members of
 * each outcome as chips that choose the variant whose resources the card opens.
 */
export function DraftStageCard({
  stageId,
  title,
  spaceIds,
  gates,
  isFirst,
  preview,
  stagePreview,
  componentSlug,
  baseSpaceId,
  updateType,
  regionBySpaceId,
  shownSpaceId,
  columns,
  unitRank,
  inScopeSpaceIds,
  slugBySpaceId,
  focusSpaceId,
  onFocused,
  onRetry,
  onLeaveOut,
}: DraftStageCardProps) {
  const [gatesOpen, setGatesOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(shownSpaceId !== undefined);
  const [chosen, setChosen] = useState<Partial<Record<ChangeOrderOutcomeKind, string>>>({});
  // A new "Show" opens the cards on that variant, whatever the reader did with them before.
  const [lastShown, setLastShown] = useState(shownSpaceId);
  if (lastShown !== shownSpaceId) {
    setLastShown(shownSpaceId);
    if (shownSpaceId !== undefined) {
      setCardsOpen(true);
      setChosen({});
    }
  }

  const nameOf = (spaceId: string) => preview.nameBySpaceId.get(spaceId) ?? '';
  // A few variants are named; more are counted.
  let right: ReactNode;
  if (spaceIds.length > 3) right = draftCopy.path.variants(spaceIds.length);
  else if (spaceIds.length > 0) {
    right = (
      <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
        {inScopeOrder(spaceIds, inScopeSpaceIds)
          .map((spaceId) => slugBySpaceId.get(spaceId) ?? nameOf(spaceId))
          .join(', ')}
      </Box>
    );
  }

  const outcome = stagePreview?.outcome;
  const comparable = useMemo(() => comparableGroupsOf(outcome?.groups ?? []), [outcome]);
  const unknownGroup = outcome?.groups.find((group) => group.kind === 'unknown');

  const representativeOverrides = useMemo(() => {
    const overrides: Partial<Record<ChangeOrderOutcomeKind, string>> = {};
    for (const group of comparable) {
      const own = chosen[group.kind];
      if (own !== undefined) overrides[group.kind] = own;
      else if (shownSpaceId !== undefined && group.spaceIds.includes(shownSpaceId)) overrides[group.kind] = shownSpaceId;
    }
    return overrides;
  }, [comparable, chosen, shownSpaceId]);

  const members = useMemo(() => new Set(spaceIds), [spaceIds]);
  const units = useMemo((): DraftCardUnit[] => {
    const own = [...preview.currentDataByUnitId.entries()]
      .filter(([, unit]) => members.has(unit.spaceId))
      .map(([unitId, unit]) => ({ unitId, spaceId: unit.spaceId, slug: unit.slug }));
    const clones = preview.clones
      .filter((clone) => members.has(clone.spaceId))
      .map((clone) => ({ unitId: cloneUnitId(clone), spaceId: clone.spaceId, slug: clone.slug, clone }));
    const all: DraftCardUnit[] = [...own, ...clones];
    return all.sort((a, b) => unitRank(a.clone?.baseUnitId ?? a.unitId) - unitRank(b.clone?.baseUnitId ?? b.unitId));
  }, [preview.currentDataByUnitId, preview.clones, members, unitRank]);

  const groupsByUnitId = useMemo(() => {
    const byId = new Map<string, Pick<ChangeOrderChangeGroup, 'fieldDiffs' | 'determinable' | 'conflicts' | 'diff' | 'allPaths' | 'resourceKind'>>(
      (stagePreview?.groups ?? []).map((group) => [group.unitId, group]),
    );
    for (const unit of units) {
      if (unit.clone === undefined) continue;
      // A clone whose content has not been read yet is not "unchanged": it is not determined yet.
      byId.set(unit.unitId, {
        fieldDiffs: unit.clone.data === undefined ? [] : computeFieldDiffs(undefined, unit.clone.data),
        determinable: unit.clone.dataStatus === 'resolved' && unit.clone.data !== undefined,
        conflicts: undefined,
      });
    }
    return byId;
  }, [stagePreview, units]);

  const spaceHrefOf = (spaceId: string) => componentSpaceDeepLink(componentSlug, spaceId) ?? undefined;

  const renderUnit = (unit: DraftCardUnit, card: OutcomeCardContext) => {
    if (unit.clone !== undefined) {
      return (
        <CloneRow
          key={unit.unitId}
          unit={{ ...unit, clone: unit.clone }}
          spaceName={nameOf(unit.spaceId)}
          spaceHref={spaceHrefOf(unit.spaceId)}
          baseSpaceId={baseSpaceId}
          onRetry={retryPreview}
        />
      );
    }
    const group = groupsByUnitId.get(unit.unitId);
    const fieldDiffs = group?.fieldDiffs ?? [];
    return (
      <Box key={unit.unitId}>
        <ChangeOrderUnitHeader
          unitId={unit.unitId}
          spaceId={unit.spaceId}
          slug={unit.slug}
          resourceKind={group?.resourceKind}
          spaceName={nameOf(unit.spaceId)}
          written={false}
          undetermined={group?.determinable === false}
          unchanged={fieldDiffs.length === 0}
          spaceHref={spaceHrefOf(unit.spaceId)}
          linksHref={unitLinksHref(unit.spaceId, unit.unitId, { updateType, otherSpacesOnly: true, direction: 'from' })}
        />
        <OutcomeUnitDiff unitId={unit.unitId} group={group} columns={columns.columns} keyPrefix={`draft-group-${card.groupKey}`} />
      </Box>
    );
  };

  const choose = (kind: ChangeOrderOutcomeKind, spaceId: string) => {
    setChosen((prev) => ({ ...prev, [kind]: spaceId }));
    setCardsOpen(true);
  };

  // After a retry, focus goes to this card's heading once the retry is gone with the answer.
  const retryPreview = useMemo(
    () => (onRetry === undefined ? undefined : retryKeepingFocus(onRetry, writesHeadingId(stageId))),
    [onRetry, stageId],
  );

  const regionOf = (spaceId: string) => regionBySpaceId.get(spaceId) ?? draftCopy.page.scope.noRegion;
  /** The chip a variant is on: its own, or its region's when the group has too many to list. */
  const chipIdOf = (spaceId: string) => {
    const group = comparable.find((candidate) => candidate.spaceIds.includes(spaceId));
    return group !== undefined && group.spaceIds.length > MAX_VARIANT_CHIPS
      ? regionChipId(stageId, group.kind, regionOf(spaceId))
      : variantChipId(stageId, spaceId);
  };
  // The chip a "Show" names is drawn in the render the "Show" causes (stage, cards, pressed
  // chip), so focus waits for it; asked again only when the groups the chips belong to land.
  // Only the card of the variant's own stage answers: the card on screen when "Show" is pressed
  // may be another stage's, which the "Show" is about to replace.
  const focusChipId =
    focusSpaceId === undefined || comparable.length === 0 || !spaceIds.includes(focusSpaceId)
      ? undefined
      : chipIdOf(focusSpaceId);
  const cancelFocus = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (focusChipId === undefined) return;
    cancelFocus.current = focusWhenDrawn(focusChipId);
    onFocused?.();
  }, [focusChipId, onFocused]);
  // A card that goes (another stage is selected before the chip is drawn) takes its focus request with it.
  useEffect(() => () => cancelFocus.current?.(), []);

  const headerExtra = (card: OutcomeCardContext) => {
    const { group, representativeSpaceId } = card;
    const members = inScopeOrder(group.spaceIds, inScopeSpaceIds);
    if (members.length <= MAX_VARIANT_CHIPS) {
      return members.map((spaceId) => (
        <VariantChip
          key={spaceId}
          label={nameOf(spaceId)}
          pressed={cardsOpen && spaceId === representativeSpaceId}
          onClick={() => choose(group.kind, spaceId)}
          id={variantChipId(stageId, spaceId)}
        />
      ));
    }
    const byRegion = new Map<string, string[]>();
    for (const spaceId of members) {
      const region = regionOf(spaceId);
      byRegion.set(region, [...(byRegion.get(region) ?? []), spaceId]);
    }
    return [...byRegion.entries()].map(([region, ids]) => (
      <VariantChip
        key={region}
        label={
          <>
            <Box component="span" sx={{ fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>
              {region}
            </Box>
            <Box component="span" sx={{ fontFamily: 'inherit' }}>
              {ids.length}
            </Box>
          </>
        }
        pressed={cardsOpen && ids.includes(representativeSpaceId)}
        onClick={() => choose(group.kind, ids[0])}
        id={regionChipId(stageId, group.kind, region)}
      />
    ));
  };

  let writes: ReactNode;
  if (spaceIds.length === 0) {
    writes = <Box sx={NOTE_SX}>{draftCopy.path.noVariants}</Box>;
  } else if (preview.status === 'loading') {
    writes = <WritesSkeleton />;
  } else if (preview.status !== 'resolved' || outcome === undefined) {
    // Unavailable (MergeUnits) is a fact about the draft, not a failed read: nothing to retry.
    writes = (
      <CouldNotEstablish
        testId="draft-writes-unknown"
        reason={preview.reason}
        onRetry={preview.status === 'failed' ? retryPreview : undefined}
        retryWhat={draftCopy.page.retryWhat.dryRun}
      />
    );
  } else {
    writes = (
      <>
        {unknownGroup !== undefined ? (
          <>
            <OutcomeUnknownNote
              variants={unknownGroup.spaceIds.map((spaceId) => ({ spaceId, label: nameOf(spaceId) }))}
              hrefFor={(spaceId) => componentSpaceDeepLink(componentSlug, spaceId)}
            />
            {onLeaveOut !== undefined ? (
              // Under the note's chips, as the design's note carries it: leaving out what nobody could read.
              <Box sx={{ margin: '-4px 0 10px 36px' }}>
                <LeaveOutButton
                  onClick={() => onLeaveOut(unknownGroup.spaceIds)}
                  ariaLabel={draftCopy.path.leaveOutNamed(unknownGroup.spaceIds.map(nameOf).join(', '))}
                />
              </Box>
            ) : null}
          </>
        ) : null}
        {comparable.length >= 2 ? (
          <OutcomeBreakdown segments={outcomeSegments(comparable)} variantCount={outcome.variantCount} />
        ) : null}
        <OutcomeGroupCards
          stageId={stageId}
          groups={comparable}
          units={units}
          groupsByUnitId={groupsByUnitId}
          skippedUnits={{}}
          representativeOverrides={representativeOverrides}
          expanded={cardsOpen}
          onToggle={() => setCardsOpen((open) => !open)}
          renderUnit={renderUnit}
          subtitle={(card) => draftCopy.path.variants(card.group.spaceIds.length)}
          headerExtra={headerExtra}
        />
      </>
    );
  }

  return (
    <Box component="section" role="region" aria-label={draftCopy.path.stageRegion(title)} data-testid="draft-stage-card" sx={CARD_SX}>
      <CardHead title={title} right={right} />
      <Box sx={{ padding: '18px 20px 22px', minWidth: 0 }}>
        {gates !== undefined && (gates.length > 0 || isFirst) ? (
          <GateDisclosure
            state="unknown"
            summary={draftGateSummary(gates)}
            bodyId={`draft-gate-list-${stageId}`}
            expanded={gatesOpen}
            onToggle={() => setGatesOpen((open) => !open)}
          >
            <ChangeOrderGateList stageId={stageId} gates={gates} isSource={false} />
          </GateDisclosure>
        ) : null}
        <Box component="section" role="region" aria-label={draftCopy.path.writes} sx={{ marginTop: gates === undefined ? 0 : '18px' }}>
          <Box
            component="h3"
            id={writesHeadingId(stageId)}
            tabIndex={-1}
            sx={{
              fontSize: changeOrderType.size.prose,
              lineHeight: changeOrderType.lineHeight.heading,
              fontWeight: changeOrderType.weight.semibold,
              margin: '0 0 10px',
              '&:focus': { outline: 'none' },
            }}
          >
            {draftCopy.path.writes}
          </Box>
          {writes}
        </Box>
      </Box>
    </Box>
  );
}

/** The Complete step of a draft: the workflow's Final prerequisites, none of them evaluated. */
export interface DraftCompleteCardProps {
  gates: ChangeOrderGate[];
}

export function DraftCompleteCard({ gates }: DraftCompleteCardProps) {
  return (
    <Box component="section" role="region" aria-label={COMPLETE_STEP_LABEL} data-testid="draft-complete-card" sx={CARD_SX}>
      <CardHead title={COMPLETE_STEP_LABEL} />
      <Box sx={{ padding: '18px 20px 22px', minWidth: 0 }}>
        <Box sx={{ border: `1px solid ${changeOrderBorder.default}`, borderRadius: `${changeOrderShape.radius.md}px`, overflow: 'hidden' }}>
          <ChangeOrderGateList stageId={COMPLETE_STAGE_ID} gates={gates} isSource={false} />
        </Box>
      </Box>
    </Box>
  );
}

/** The source node of a draft: the change itself, which the full diff above shows. */
export function DraftSourceCard() {
  return (
    <Box component="section" role="region" aria-label={draftCopy.path.source} data-testid="draft-source-card" sx={CARD_SX}>
      <CardHead title={draftCopy.path.source} />
      <Box sx={{ padding: '18px 20px 22px' }}>
        <Box sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted, marginTop: '6px' }}>{draftCopy.path.sourceFoot}</Box>
      </Box>
    </Box>
  );
}
