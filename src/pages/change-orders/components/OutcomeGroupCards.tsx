// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import Box from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { cardRepresentativeSpaceId, cardRepresentativeUnits, outcomeGroupKey } from '../changeOrderCard';
import type { ChangeOrderOutcomeGroup, ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { ChangeOrderBlockedResources } from '../changeOrderRefusals';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderKindLine,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { partitionSourceUnitsByChange } from '../useChangeOrderConsoleChanges';
import { OUTCOME_BADGE, OUTCOME_META } from './outcomeMeta';

export interface OutcomeGroupCardProps {
  kind: ChangeOrderOutcomeKind;
  /**
   * Changed fields across the resources the card lists: its representative
   * variant's, not the whole group's. The rows below are the representative's,
   * so a group-wide total would count rows the reader cannot see, and for
   * `differs` no single group-wide figure is true of every member.
   */
  fieldCount: number;
  /** Variants in the group. */
  memberCount: number;
  /** `id` of the body, which the toggle's `aria-controls` points at. */
  bodyId: string;
  expanded: boolean;
  onToggle: () => void;
  /** The line under the label. Nothing is drawn without one. */
  subtitle?: ReactNode;
  /**
   * Content beside the label, such as the members as chips. It may be
   * interactive: with it, the header is a click target for the pointer and the
   * Open control alone is the button, so no control nests inside another.
   */
  headerExtra?: ReactNode;
  /** The card's body, mounted only while it is open. */
  children: ReactNode;
}

const HEADER_SX = {
  boxSizing: 'border-box',
  width: '100%',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  padding: '10px 12px',
  background: changeOrderSurface.sunk,
  '&:hover': { background: changeOrderSurface.inset },
} as const;

/** Drawn inside the header, which the card's `overflow: hidden` would otherwise clip. */
const FOCUS_RING_INSET = { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: '-2px' } as const;

const TOGGLE_SX = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: changeOrderType.size.small,
  fontWeight: changeOrderType.weight.semibold,
  color: changeOrderInk.muted,
} as const;

/**
 * One outcome group: a badge counting the fields its representative variant
 * changes, the outcome's name, and the representative's resources behind
 * Open/Hide.
 *
 * Bordered in the outcome's own tint, so a divergent group reads as such from
 * its edge before its label is read. The badge reuses `OUTCOME_META`'s tones:
 * `adds` and `unknown` stay neutral, because "could not establish" is not a
 * failure and a bold colour block would assert that it is.
 */
export function OutcomeGroupCard({
  kind,
  fieldCount,
  memberCount,
  bodyId,
  expanded,
  onToggle,
  subtitle,
  headerExtra,
  children,
}: OutcomeGroupCardProps) {
  const meta = OUTCOME_META[kind];
  const badge = OUTCOME_BADGE[kind];
  // Nothing to change has no fields to count: its badge says so, rather than "0 fields".
  const counted = kind !== 'nothing';
  let unit = '';
  if (counted) unit = fieldCount === 1 ? 'field' : 'fields';
  const toggleLabel = (
    <>
      {expanded ? 'Hide' : 'Open'}
      <ExpandMoreIcon
        aria-hidden="true"
        sx={{
          fontSize: 18,
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform .15s ease',
        }}
      />
    </>
  );
  const headerContent = (
    <>
      {/*
        The numeral carries its own unit: beside "Adds resources" a bare "0"
        would read as "no resources added", the reverse of what the card says.
      */}
      <Box aria-hidden="true" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
        <Box
          data-testid="outcome-group-badge"
          sx={{
            // 40px including the padding, so a one-digit count is 40 wide, not 58.
            boxSizing: 'border-box',
            minWidth: 40,
            padding: '4px 9px',
            borderRadius: `${changeOrderShape.radius.lg}px`,
            background: badge.bg,
            color: badge.fg,
            fontFamily: changeOrderFontMono,
            fontVariantNumeric: 'tabular-nums',
            fontSize: changeOrderType.size.cardFigure,
            fontWeight: changeOrderType.weight.strong,
            letterSpacing: '-.02em',
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          {counted ? fieldCount : '—'}
        </Box>
        <Box
          data-testid="outcome-group-badge-unit"
          sx={{
            fontSize: changeOrderType.size.micro,
            lineHeight: changeOrderType.lineHeight.body,
            color: changeOrderInk.muted,
            letterSpacing: '.02em',
          }}
        >
          {unit}
        </Box>
      </Box>
      {/*
        Label and hint stack, so the hint reads as the label's explanation. With
        nothing beside them they take the free width, keeping Open at the far
        edge until the row wraps.
      */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          flex: headerExtra === undefined ? '1 1 auto' : '0 1 auto',
          textAlign: 'left',
        }}
      >
        <Box
          component="h4"
          sx={{
            fontSize: changeOrderType.size.prose,
            lineHeight: changeOrderType.lineHeight.heading,
            fontWeight: changeOrderType.weight.semibold,
            margin: 0,
          }}
        >
          {meta.label}
        </Box>
        {subtitle === undefined ? null : (
          <Box
            sx={{
              fontSize: changeOrderType.size.small,
              lineHeight: changeOrderType.lineHeight.body,
              fontWeight: changeOrderType.weight.regular,
              color: changeOrderInk.muted,
            }}
          >
            {subtitle}
          </Box>
        )}
      </Box>
    </>
  );
  return (
    <Box
      role="group"
      aria-label={`${counted ? `${fieldCount} changed ${unit}, ` : ''}${meta.label}, ${memberCount} ${memberCount === 1 ? 'variant' : 'variants'}`}
      sx={{
        border: `1px solid ${changeOrderKindLine[kind]}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
        background: changeOrderSurface.card,
        marginBottom: '14px',
        overflow: 'hidden',
      }}
    >
      {headerExtra === undefined ? (
        <Box
          component="button"
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          sx={{
            all: 'unset',
            ...HEADER_SX,
            borderBottom: expanded ? `1px solid ${changeOrderBorder.default}` : 'none',
            '&:focus-visible': FOCUS_RING_INSET,
          }}
        >
          {headerContent}
          <Box sx={TOGGLE_SX}>{toggleLabel}</Box>
        </Box>
      ) : (
        <Box
          onClick={onToggle}
          sx={{ ...HEADER_SX, borderBottom: expanded ? `1px solid ${changeOrderBorder.default}` : 'none' }}
        >
          {headerContent}
          <Box
            onClick={(event: MouseEvent) => event.stopPropagation()}
            sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: 0, cursor: 'auto' }}
          >
            {headerExtra}
          </Box>
          <Box
            component="button"
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              onToggle();
            }}
            sx={{
              all: 'unset',
              cursor: 'pointer',
              ...TOGGLE_SX,
              '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: '2px' },
            }}
          >
            {toggleLabel}
          </Box>
        </Box>
      )}
      {expanded ? <Box id={bodyId}>{children}</Box> : null}
    </Box>
  );
}

/** What a card tells its callbacks about itself. */
export interface OutcomeCardContext {
  group: ChangeOrderOutcomeGroup;
  kind: ChangeOrderOutcomeKind;
  /** `outcomeGroupKey(stageId, kind)`: unique per card on the page. */
  groupKey: string;
  /** The variant whose resources the card shows. */
  representativeSpaceId: string;
}

export interface OutcomeGroupCardsProps<TUnit extends { unitId: string; spaceId: string }> {
  stageId: string;
  /** The comparable groups, in display order. `unknown` is a note, not a card. */
  groups: readonly ChangeOrderOutcomeGroup[];
  /** Every resource of the stage, across its variants. */
  units: readonly TUnit[];
  groupsByUnitId: ReadonlyMap<string, Pick<ChangeOrderChangeGroup, 'fieldDiffs' | 'determinable' | 'conflicts'>>;
  /** Resources the change passed over: never listed on a card. */
  skippedUnits: Readonly<Record<string, string>>;
  /**
   * Which variant each group shows, by outcome. A variant outside its group is
   * ignored and the group's own representative is shown.
   */
  representativeOverrides?: Readonly<Partial<Record<ChangeOrderOutcomeKind, string>>>;
  /** One switch for every card: opening one opens them all. */
  expanded: boolean;
  onToggle: () => void;
  /** One resource row, rendered the same above the blocked block and inside it. Keyed by the caller. */
  renderUnit: (unit: TUnit, card: OutcomeCardContext) => ReactNode;
  /** The line under a card's label. Nothing is drawn without one. */
  subtitle?: (card: OutcomeCardContext) => ReactNode;
  /** Content beside a card's label, such as the members as chips. */
  headerExtra?: (card: OutcomeCardContext) => ReactNode;
}

/**
 * ONE CARD PER OUTCOME, NOT PER VARIANT. Members of a group take the same
 * change by construction, so a group renders one variant's resources once and
 * says how many variants it stands for; repeating identical trees would bury
 * the divergence among the repetition.
 *
 * A card lists the resources the promote rewrites, then, apart, the ones it
 * tried to alter and could not. Resources it leaves alone are not listed: the
 * card reports what the change does.
 */
export function OutcomeGroupCards<TUnit extends { unitId: string; spaceId: string }>({
  stageId,
  groups,
  units,
  groupsByUnitId,
  skippedUnits,
  representativeOverrides,
  expanded,
  onToggle,
  renderUnit,
  subtitle,
  headerExtra,
}: OutcomeGroupCardsProps<TUnit>) {
  const cards = useMemo(
    () =>
      groups.map((group) => {
        const representativeSpaceId = cardRepresentativeSpaceId(group, representativeOverrides?.[group.kind]);
        const { changedUnits, blockedUnits } = partitionSourceUnitsByChange(
          cardRepresentativeUnits(units, representativeSpaceId, skippedUnits),
          groupsByUnitId,
        );
        const fieldCount = changedUnits.reduce(
          (total, unit) => total + (groupsByUnitId.get(unit.unitId)?.fieldDiffs.length ?? 0),
          0,
        );
        const context: OutcomeCardContext = {
          group,
          kind: group.kind,
          groupKey: outcomeGroupKey(stageId, group.kind),
          representativeSpaceId,
        };
        return { group, context, changedUnits, blockedUnits, fieldCount };
      }),
    [groups, representativeOverrides, units, skippedUnits, groupsByUnitId, stageId],
  );

  return (
    <>
      {cards.map(({ group, context, changedUnits, blockedUnits, fieldCount }) => {
        const render = (unit: TUnit) => renderUnit(unit, context);
        return (
          <OutcomeGroupCard
            key={group.kind}
            kind={group.kind}
            fieldCount={fieldCount}
            memberCount={group.spaceIds.length}
            bodyId={`group-body-${context.groupKey}`}
            expanded={expanded}
            onToggle={onToggle}
            subtitle={subtitle?.(context)}
            headerExtra={headerExtra?.(context)}
          >
            {changedUnits.length + blockedUnits.length === 0 ? (
              <Box sx={{ padding: '4px 0' }}>
                <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
                  {changeOrderCopy.noResourcesYet}
                </Box>
              </Box>
            ) : (
              <>
                {changedUnits.length > 0 ? <Box sx={{ padding: '4px 0' }}>{changedUnits.map(render)}</Box> : null}
                <Box sx={{ padding: '0 12px' }}>
                  <ChangeOrderBlockedResources units={blockedUnits} renderUnit={render} />
                </Box>
              </>
            )}
          </OutcomeGroupCard>
        );
      })}
    </>
  );
}
