// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ChangeOrderOutcomeGroup, ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderSurface } from '../changeOrdersTokens';

/** How one outcome kind reads: its tone and its name. */
export interface OutcomeMeta {
  tone: string;
  label: string;
}

/** An outcome badge's fill and ink. */
export interface OutcomeBadgeTone {
  bg: string;
  fg: string;
}

/**
 * Outcome tones and wording.
 *
 * `unknown` is deliberately NOT a failure tone and not a reassuring one — it is
 * its own thing, because "we could not establish this" is neither good news nor
 * bad. Rendering it as either would assert something the data does not support.
 *
 * `adds` MEANS BOTH HALVES OF WHAT IT SAYS — the change brings this resource,
 * and this variant does not hold it — WHENEVER THE AUTHORED CHANGE IS KNOWN.
 * `kindForSpace` then weighs only the rows that change carries, so a variant is
 * never grouped here for holding different resources the promote never mentions.
 * Until the base has been read there is no authored change to weigh against and
 * no row is excluded, so the label falls back to its second half alone. That is
 * the noisier reading, never the quieter one.
 */
export const OUTCOME_META: Record<ChangeOrderOutcomeKind, OutcomeMeta> = {
  same: { tone: changeOrderStatus.success, label: 'Same change' },
  differs: { tone: changeOrderStatus.warn, label: 'Differs' },
  adds: { tone: changeOrderInk.muted, label: 'Adds resources' },
  unknown: { tone: changeOrderInk.subtle, label: 'Could not establish' },
  nothing: { tone: changeOrderBorder.strong, label: 'Nothing to change here' },
};

/**
 * The group-card badge's own soft fill, one step separate from
 * `OUTCOME_META.tone`. `same`/`differs` get the reference's real soft tint
 * (`--ok-soft`/`--wait-soft`) because `OUTCOME_META.tone` already agrees with
 * the reference there. `adds`/`unknown` stay neutral (`changeOrderSurface.inset`)
 * rather than the reference's literal blue/red: "could not establish" is not a
 * failure, and a bold colour block would assert that it is.
 */
export const OUTCOME_BADGE: Record<ChangeOrderOutcomeKind, OutcomeBadgeTone> = {
  same: { bg: changeOrderStatus.successGround, fg: changeOrderStatus.success },
  differs: { bg: changeOrderStatus.warnSoft, fg: changeOrderStatus.warn },
  adds: { bg: changeOrderSurface.inset, fg: changeOrderInk.muted },
  unknown: { bg: changeOrderSurface.inset, fg: changeOrderInk.subtle },
  nothing: { bg: changeOrderSurface.sunk, fg: changeOrderInk.subtle },
};

/** One outcome's share of a stage: how many variants came out this way. */
export interface OutcomeBarSegment {
  kind: ChangeOrderOutcomeKind;
  /** Variants with this outcome. The segment's width is its share of the sum. */
  count: number;
}

/** The bar's segments for a set of outcome groups, in the groups' order. */
export function outcomeSegments(groups: readonly ChangeOrderOutcomeGroup[]): OutcomeBarSegment[] {
  return groups.map((group) => ({ kind: group.kind, count: group.spaceIds.length }));
}
