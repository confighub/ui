// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Fragment, memo, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import type { ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import type { DiffComments } from '@/components/config-diff/diffComments';
import { ChangeOrderUnitHeader } from '../../x/apps/change-order/ChangeOrderUnitHeader';
import { componentSpaceDeepLink } from '../../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import type { MergedUnit } from '../../x/apps/componentTypes';
import { cardSpaceLabel, type CardSpaceLabelSource } from '../changeOrderCard';
import { ChangeOrderBlockedResources } from '../changeOrderRefusals';
import { OutcomeUnitDiff } from '../components/OutcomeUnitDiff';
import type { ReviewDiffTarget } from '../review-comments/reviewCommentsContext';
import {
  STAGE_DIFF_ID,
  stageDiffCopy,
  type StageDiffBarSegment,
  type StageDiffModel,
  type StageDiffSection,
} from './stageDiffSections';
import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { diffAnchorId, spaceHref } from './stageLinks';
import type { StageDiffAnchor, StageDiffHighlight } from './useStageDiff';

/** What the page already holds for drawing one Unit's diff. */
export interface StageDiffUnitDeps {
  groupsByUnitId: ReadonlyMap<string, ChangeOrderChangeGroup>;
  spaceIdByUnitId: ReadonlyMap<string, string>;
  spaceNameBySpaceId: ReadonlyMap<string, string>;
  writtenUnitIds: ReadonlySet<string>;
  undeterminedUnitIds: ReadonlySet<string>;
  scopedSpaces: readonly CardSpaceLabelSource[] | null;
  componentName: string | undefined;
  /** A resource's Links the change travels over, or `undefined` for none. */
  unitLinksHrefFor: (unit: { spaceId: string; unitId: string }, direction: 'from' | 'to') => string | undefined;
  /** Shared with every other diff on the page, so their columns line up. */
  diffColumns: ConfigDiffColumns;
  fallbackColumnStyle: CSSProperties;
  diffCommentsFor: (target: ReviewDiffTarget | undefined) => DiffComments | undefined;
  rowKeyByUnitId: ReadonlyMap<string, string> | undefined;
  unitIdsByRowKey: ReadonlyMap<string, readonly string[]>;
}

export interface StageOutcomeBoxesProps {
  model: StageDiffModel<MergedUnit>;
  deps: StageDiffUnitDeps;
  /** Every box is open or every box is closed (`useStageDiff`). */
  open: boolean;
  onToggle: () => void;
  highlight: StageDiffHighlight | null;
  boxesRef?: RefObject<HTMLElement>;
  /** A same-as line's Unit links jump through this; without it they are plain in-page links. */
  onShowInDiff?: (anchor: StageDiffAnchor) => void;
}

/** List links: secondary ink, underlined on hover. */
const LIST_LINK_SX = {
  color: 'text.secondary',
  textDecoration: 'none',
  '&:hover': { color: 'text.primary', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px', borderRadius: '2px' },
} as const;

/** Links inside a sentence: the sentence's ink, always underlined. */
const PROSE_LINK_SX = {
  color: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: 'var(--t3)',
  textUnderlineOffset: '2px',
  '&:hover': { color: 'text.primary', textDecorationColor: 'var(--t1)' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px', borderRadius: '2px' },
} as const;

/** Tints a jump's box header or fallback Unit block in the tone set on the boxes. */
const TINT_SX = {
  background: 'var(--diff-highlight-bg)',
  boxShadow: 'inset 0 1px 0 var(--diff-highlight-bd), inset 0 -1px 0 var(--diff-highlight-bd)',
} as const;

const TONE_VARS: Record<StageDiffHighlight['tone'], CSSProperties> = {
  warning: { '--diff-highlight-bg': 'var(--amber-bg)', '--diff-highlight-bd': 'var(--amber-bd)' } as CSSProperties,
  error: { '--diff-highlight-bg': 'var(--red-bg)', '--diff-highlight-bd': 'var(--red-bd)' } as CSSProperties,
};

/**
 * One Unit of a section: its header band, then what the promotion writes to it as
 * the app's diff tree, with the values it keeps drawn as rows. A Unit whose change
 * is already in place says so in place of an empty tree.
 */
function StageDiffUnit({
  unit,
  section,
  deps,
  highlightPath,
}: {
  unit: MergedUnit;
  section: StageDiffSection<MergedUnit>;
  deps: StageDiffUnitDeps;
  highlightPath: string | undefined;
}) {
  const g = deps.groupsByUnitId.get(unit.unitId);
  // The Space by its Variant label, the name it has inside its Component; the slug reads as plumbing.
  const spaceLabel = cardSpaceLabel(section.representativeSpaceId, deps.scopedSpaces, deps.spaceNameBySpaceId);
  const fieldDiffs = g?.fieldDiffs ?? [];
  const rowKey = deps.rowKeyByUnitId?.get(unit.unitId);
  // Comments on a drawn row belong to every member Space's Unit for the same resource.
  const memberUnitIds =
    rowKey === undefined
      ? undefined
      : (deps.unitIdsByRowKey.get(rowKey) ?? []).filter((unitId) => {
          const spaceId = deps.spaceIdByUnitId.get(unitId);
          return spaceId !== undefined && section.spaceIds.includes(spaceId);
        });
  return (
    <>
      <ChangeOrderUnitHeader
        unitId={unit.unitId}
        spaceId={unit.spaceId}
        slug={unit.slug}
        resourceKind={g?.resourceKind}
        spaceName={spaceLabel}
        written={deps.writtenUnitIds.has(unit.unitId)}
        undetermined={deps.undeterminedUnitIds.has(unit.unitId)}
        unchanged={fieldDiffs.length === 0}
        spaceHref={componentSpaceDeepLink(deps.componentName, unit.spaceId) ?? undefined}
        // A promotion reaches a stage's resource over the Links from it.
        linksHref={deps.unitLinksHrefFor(unit, 'from')}
      />
      <OutcomeUnitDiff
        unitId={unit.unitId}
        group={g}
        columns={deps.diffColumns}
        fallbackColumnStyle={deps.fallbackColumnStyle}
        keyPrefix={`change-order-group-${section.groupKey}`}
        comments={deps.diffCommentsFor({ unitId: unit.unitId, spaceId: unit.spaceId, memberUnitIds })}
        highlightPath={highlightPath}
        empty={
          <Typography variant="body2" color="text.secondary" sx={{ padding: '4px 16px 10px' }}>
            {stageDiffCopy.noFields}
          </Typography>
        }
      />
    </>
  );
}

function SpaceLinks({ spaceIds, nameOf }: { spaceIds: readonly string[]; nameOf: (spaceId: string) => string }) {
  return (
    <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.8, color: 'text.secondary', px: '12px', pt: 1, pb: 1 }}>
      {spaceIds.map((spaceId, i) => (
        <Fragment key={spaceId}>
          {i > 0 ? ', ' : null}
          <Link
            component={RouterLink}
            to={spaceHref(spaceId)}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ ...LIST_LINK_SX, font: 'inherit', overflowWrap: 'anywhere' }}
          >
            {nameOf(spaceId)}
          </Link>
        </Fragment>
      ))}
    </Box>
  );
}

function SectionBody({
  section,
  deps,
  highlight,
  onShowInDiff,
}: {
  section: StageDiffSection<MergedUnit>;
  deps: StageDiffUnitDeps;
  highlight: StageDiffHighlight | null;
  onShowInDiff?: (anchor: StageDiffAnchor) => void;
}) {
  if (section.body !== 'units') {
    const text =
      section.body === 'unknown'
        ? stageDiffCopy.unknown(section.spaceIds.length)
        : section.body === 'alreadyHolds'
          ? stageDiffCopy.alreadyHolds(section.spaceIds.length)
          : stageDiffCopy.noResources;
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: '12px', pb: 1.5 }}>
        {text}
      </Typography>
    );
  }
  const target = highlight?.target;
  const renderUnit = (unit: MergedUnit) => {
    const blockId = diffAnchorId({ groupKind: section.kind, unitId: unit.unitId });
    const hit = target?.blockId === blockId;
    return (
      <Box
        key={unit.unitId}
        id={blockId}
        data-highlighted={hit && highlight?.unitFallback === true ? 'true' : undefined}
        sx={{
          scrollMarginTop: 24,
          // The field's row is not drawn (a fallback tree, or a folder closed by hand): tint the Unit's header band.
          ...(hit && highlight?.unitFallback === true ? { [`& [data-testid="change-order-unit-${unit.unitId}"]`]: TINT_SX } : {}),
        }}
      >
        <StageDiffUnit
          unit={unit}
          section={section}
          deps={deps}
          highlightPath={hit && highlight?.unitFallback !== true ? target?.path : undefined}
        />
      </Box>
    );
  };
  return (
    <>
      {section.changedUnits.map(renderUnit)}
      {section.blockedUnits.length > 0 ? (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <ChangeOrderBlockedResources units={section.blockedUnits} renderUnit={renderUnit} />
        </Box>
      ) : null}
      {section.sameAs.length > 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="stage-diff-same-as" sx={{ padding: '6px 12px 12px' }}>
          {section.sameAs.map(({ unit, target: sameTarget }, i) => {
            const href = `#${diffAnchorId({ groupKind: 'same', unitId: sameTarget.unitId })}`;
            return (
              <Fragment key={unit.unitId}>
                {i === 0 ? null : i === section.sameAs.length - 1 ? ' and ' : ', '}
                <Link
                  href={href}
                  sx={{ ...PROSE_LINK_SX, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  onClick={
                    onShowInDiff === undefined
                      ? undefined
                      : (event: MouseEvent) => {
                          event.preventDefault();
                          onShowInDiff({ groupKind: 'same', unitId: sameTarget.unitId });
                        }
                  }
                >
                  {unit.slug}
                </Link>
              </Fragment>
            );
          })}
          :{stageDiffCopy.sameAsTail}
        </Typography>
      ) : null}
    </>
  );
}

/** The count tile's fill and ink, by outcome: the same change reads as good news, a different one as a warning. */
const TILE_TONE: Record<ChangeOrderOutcomeKind, { bgcolor: string; color: string }> = {
  same: { bgcolor: 'var(--green-bg)', color: 'success.main' },
  differs: { bgcolor: 'var(--amber-bg)', color: 'warning.dark' },
  adds: { bgcolor: 'var(--bg-hover)', color: 'text.secondary' },
  unknown: { bgcolor: 'var(--bg-hover)', color: 'text.secondary' },
  // A draft's own outcome, never a stage's; neutral wherever it is drawn.
  nothing: { bgcolor: 'var(--bg-hover)', color: 'text.secondary' },
};

/** The bar's segment colours. `adds` stays neutral: holding nothing yet is not a failure. */
const BAR_TONE: Record<ChangeOrderOutcomeKind, string> = {
  same: 'success.main',
  differs: 'warning.main',
  adds: 'var(--t3)',
  unknown: 'var(--bd2)',
  nothing: 'var(--bd2)',
};

/** How the stage's Spaces divide between the outcomes, with a legend that says it in words. */
function OutcomeBar({ segments, total }: { segments: readonly StageDiffBarSegment[]; total: number }) {
  return (
    <Box role="group" aria-label={stageDiffCopy.barLabel(total)} data-testid="stage-outcome-bar">
      <Box aria-hidden sx={{ display: 'flex', gap: '2px', height: 8, borderRadius: '4px', overflow: 'hidden' }}>
        {segments.map((segment) => (
          <Box key={segment.kind} sx={{ flexGrow: segment.count, flexBasis: 0, bgcolor: BAR_TONE[segment.kind] }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', mt: 1 }}>
        {segments.map((segment) => (
          <Typography key={segment.kind} component="span" variant="body2" sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: BAR_TONE[segment.kind] }} />
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
              {segment.count}
            </Box>
            {segment.label}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/**
 * One outcome group as a box: how many fields its representative Space changes,
 * the outcome's name and what it means, how many Spaces it stands for, and Open.
 * Open, it names the Spaces and draws the app's diff tree for the group.
 */
function OutcomeBox({
  section,
  open,
  onToggle,
  tinted,
  children,
  nameOf,
}: {
  section: StageDiffSection<MergedUnit>;
  open: boolean;
  onToggle: () => void;
  /** A jump named this group but no Unit in it. */
  tinted: boolean;
  children: ReactNode;
  nameOf: (spaceId: string) => string;
}) {
  const bodyId = `${section.headingId}-body`;
  const tone = TILE_TONE[section.kind];
  return (
    <Box
      data-testid="stage-outcome-box"
      data-kind={section.kind}
      sx={{ border: '1px solid var(--bd0)', borderRadius: 'var(--r-sm)', overflow: 'hidden', bgcolor: 'background.paper', scrollMarginTop: 24 }}
    >
      <Box
        component="button"
        type="button"
        id={section.headingId}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        data-testid="stage-outcome-toggle"
        data-highlighted={tinted ? 'true' : undefined}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          p: '10px 12px',
          cursor: 'pointer',
          bgcolor: 'var(--bg)',
          transition: 'background-color .3s',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '&:hover': { bgcolor: 'var(--bg-hover)' },
          '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '-2px' },
          ...(open ? { borderBottom: '1px solid var(--bd0)' } : {}),
          ...(tinted ? TINT_SX : {}),
        }}
      >
        <Box aria-hidden sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <Box
            sx={{
              boxSizing: 'border-box',
              minWidth: 40,
              p: '4px 9px',
              borderRadius: 'var(--r-sm)',
              bgcolor: tone.bgcolor,
              color: tone.color,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1,
              textAlign: 'center',
            }}
          >
            {section.fieldCount ?? '?'}
          </Box>
          <Box component="span" sx={{ fontSize: '10.5px', color: 'text.secondary', lineHeight: 1.2 }}>
            {section.fieldCount === null ? stageDiffCopy.unknownTile : stageDiffCopy.fields(section.fieldCount)}
          </Box>
        </Box>
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h5" component="h4" sx={{ m: 0, color: 'text.primary' }}>
              {section.label}
            </Typography>
            <Chip size="small" label={stageDiffCopy.spaceCount(section.spaceIds.length)} />
          </Box>
          {/* The Spaces, by name, before the box is opened: one or two read at a glance. */}
          {open || section.spaceIds.length > 2 ? null : (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'var(--font-mono)', fontSize: '11.5px', overflowWrap: 'anywhere' }}>
              {section.spaceIds.map(nameOf).join(', ')}
            </Typography>
          )}
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, fontSize: '11.5px', fontWeight: 600, color: 'text.secondary' }}>
          {open ? stageDiffCopy.close : stageDiffCopy.open}
          <ExpandMoreIcon aria-hidden sx={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
        </Box>
      </Box>
      {open ? (
        <Box id={bodyId}>
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * What the promotion writes, as one box per outcome group: closed, a box says
 * how the group comes out; open, it draws the app's diff tree for it, with a
 * Unit header band per Unit. With two or more comparable outcomes a bar shows
 * how the Spaces divide between them.
 */
function StageOutcomeBoxesView({ model, deps, open, onToggle, highlight, boxesRef, onShowInDiff }: StageOutcomeBoxesProps) {
  const nameOf = (spaceId: string) => deps.spaceNameBySpaceId.get(spaceId) ?? spaceId;
  const groupJump = highlight !== null && highlight.target.unitId === undefined ? highlight.target.kind : undefined;
  const total = model.sections.reduce((n, section) => n + section.spaceIds.length, 0);

  return (
    <Box
      ref={boxesRef}
      id={STAGE_DIFF_ID}
      data-testid="stage-diff"
      style={TONE_VARS[highlight?.tone ?? 'warning']}
      sx={{ display: 'grid', gap: 1, p: '12px 16px 16px', scrollMarginTop: 16, '@media (max-width: 759.98px)': { p: '12px' } }}
    >
      {model.oneVariant ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {stageDiffCopy.oneVariant}
        </Typography>
      ) : null}
      {model.bar === null ? null : <OutcomeBar segments={model.bar} total={total} />}
      {model.sections.map((section) => (
        <OutcomeBox key={section.kind} section={section} open={open} onToggle={onToggle} tinted={groupJump === section.kind} nameOf={nameOf}>
          <SpaceLinks spaceIds={section.spaceIds} nameOf={nameOf} />
          <SectionBody section={section} deps={deps} highlight={highlight} onShowInDiff={onShowInDiff} />
        </OutcomeBox>
      ))}
    </Box>
  );
}

/** Every field the same value: `deps` is often built inline from values that are each stable. */
function sameFields<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * Memoised: open, the boxes draw every tree of the stage, and the page re-renders
 * on every poll, announcement and toast. They draw again only when what they show
 * changes.
 */
export const StageOutcomeBoxes = memo(
  StageOutcomeBoxesView,
  (prev, next) =>
    prev.model === next.model &&
    prev.open === next.open &&
    prev.onToggle === next.onToggle &&
    prev.highlight === next.highlight &&
    prev.boxesRef === next.boxesRef &&
    prev.onShowInDiff === next.onShowInDiff &&
    sameFields(prev.deps, next.deps),
);
