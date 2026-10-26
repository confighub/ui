// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A promotion or release of the stage that did not finish, and who promoted or
 * released it: read from this browser's last result and from the ChangeOrder's
 * own records.
 */

import type { ChangeOrderPromotion, ChangeOrderPromotionFailure } from '@confighub/rtk-query';

import type { HistoryEntry } from '../changeOrderHistory';
import type { ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import type { ActionFailedSpace, StageByline, StageFailedSpace, StageFailure } from './stageTypes';

// ---------------------------------------------------------------------------
// A failed promotion or release
// ---------------------------------------------------------------------------

/** What the actions hook reported for this browser's last action. */
export interface SessionResult {
  ok: boolean;
  message: string;
  action?: 'promote' | 'release';
  /** Refused because the plan was stale: nothing was written, and the confirm says so in place. */
  planStale?: boolean;
  /** Refused at the gates (409): nothing was written, and the stage is held, not failed. */
  gatesHolding?: boolean | string | null;
  failedSpaces?: readonly ActionFailedSpace[];
}

export interface StageFailureInput {
  stageId: string;
  verdict: ChangeOrderStageVerdict;
  targets: readonly string[];
  /** The Space a promotion passes over on purpose (the ChangeOrder's own). */
  baseSpaceId?: string;
  lastResult: SessionResult | null;
  /** The stage the last action was for. A result for another stage is not this stage's failure. */
  lastResultStageId?: string;
  /** The last result passed over a Space the ChangeOrder is not headed for. */
  lastResultOutOfScope?: boolean;
  promotionFailures: readonly ChangeOrderPromotionFailure[];
  promotions: readonly ChangeOrderPromotion[];
  /** Spaces holding the change (`progress.resolvedSpaceIds`). */
  resolvedSpaceIds: ReadonlySet<string>;
  /** Spaces that released it, for a release failure's count. */
  releasedSpaceIds?: ReadonlySet<string>;
  slugOf: (spaceId: string) => string;
}

const DONE_VERDICTS: ReadonlySet<ChangeOrderStageVerdict> = new Set(['promoted', 'released', 'restored', 'restore-released']);

function epoch(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? undefined : at;
}

/**
 * The failed promotion (or release) this stage shows, or `null`.
 *
 * THIS BROWSER'S RESULT FIRST, and only for the stage it was for. Then the
 * ChangeOrder's record, so a failure survives a reload. A recorded failure is
 * shown only while it is the latest word on the stage: if a promotion of the
 * stage came after it, or the stage is now promoted, someone has finished the
 * job and the record is history, not state.
 */
export function stageFailure(input: StageFailureInput): StageFailure | null {
  const session = input.lastResult;
  const sessionHeld = session !== null && session.gatesHolding !== undefined && session.gatesHolding !== null && session.gatesHolding !== false;
  if (session !== null && !session.ok && session.planStale !== true && !sessionHeld && input.lastResultStageId === input.stageId) {
    const action = session.action ?? 'promote';
    // Someone has finished the job since: the result is history, as a record would be.
    if (action === 'promote' ? DONE_VERDICTS.has(input.verdict) : input.verdict === 'released') return null;
    const failedSpaces = groupFailedSpaces(session.failedSpaces ?? []);
    const held = action === 'release' ? (input.releasedSpaceIds ?? new Set<string>()) : input.resolvedSpaceIds;
    const named = failedSpaces.length > 0;
    return finish(
      input,
      {
        action,
        source: 'session',
        failedSpaces: named ? failedSpaces : missingSpaces(input, held),
        outOfScope: input.lastResultOutOfScope === true,
        message: session.message,
      },
      held,
      named,
    );
  }

  if (DONE_VERDICTS.has(input.verdict)) return null;
  const latestPromotion = input.promotions
    .filter((p) => p.Stage === input.stageId)
    .reduce<number | undefined>((latest, p) => {
      const at = epoch(p.PromotedAt);
      return at !== undefined && (latest === undefined || at > latest) ? at : latest;
    }, undefined);
  let record: { failure: ChangeOrderPromotionFailure; at: number } | undefined;
  for (const failure of input.promotionFailures) {
    if (failure.Stage !== input.stageId) continue;
    const at = epoch(failure.FailedAt);
    if (at === undefined) continue;
    if (record === undefined || at > record.at) record = { failure, at };
  }
  if (record === undefined) return null;
  if (latestPromotion !== undefined && latestPromotion >= record.at) return null;

  const failedSpaces: StageFailedSpace[] = [];
  const lines: string[] = [];
  let outOfScope = false;
  for (const space of record.failure.Spaces ?? []) {
    if (space.SpaceID === undefined) continue;
    if (space.Action === 'Skipped' && space.SpaceID === input.baseSpaceId) continue;
    if (space.Action === 'Skipped') outOfScope = true;
    const slug = space.SpaceSlug ?? input.slugOf(space.SpaceID);
    const items = [
      ...(space.Units ?? [])
        .filter((u) => (u.Error ?? '') !== '')
        .map((u) => ({ message: u.Error ?? '', ...(u.Slug === undefined ? {} : { unitSlug: u.Slug }), ...(u.UnitID === undefined ? {} : { unitId: u.UnitID }) })),
      ...(space.Links ?? []).filter((l) => (l.Error ?? '') !== '').map((l) => ({ message: l.Error ?? '', ...(l.Slug === undefined ? {} : { unitSlug: l.Slug }) })),
    ];
    const spaceMessage = space.Error || space.Message || space.Reason || '';
    if (items.length === 0 && spaceMessage !== '') items.push({ message: spaceMessage });
    if (items.length === 0) continue;
    failedSpaces.push({ spaceId: space.SpaceID, slug, items });
    for (const item of items) lines.push(`${slug}: ${item.unitSlug === undefined ? '' : `${item.unitSlug}: `}${item.message}`);
  }
  if (failedSpaces.length === 0) return null;
  return finish(
    input,
    {
      action: 'promote',
      source: 'record',
      failedSpaces,
      outOfScope,
      message: lines.join('\n'),
      at: record.at,
      ...(record.failure.UserID === undefined ? {} : { userId: record.failure.UserID }),
    },
    input.resolvedSpaceIds,
    true,
  );
}

/**
 * The counts, from the same result as the failed Spaces, so the headline, the
 * body and the server message cannot disagree: every target the result does not
 * name as failed holds the change. Only a result that names no Space falls back
 * to the ChangeOrder's progress.
 */
function finish(
  input: StageFailureInput,
  partial: Omit<StageFailure, 'landedCount' | 'spaceCount'>,
  held: ReadonlySet<string>,
  named: boolean,
): StageFailure {
  const failedIds = new Set(partial.failedSpaces.map((s) => s.spaceId).filter((id) => id !== ''));
  const failedSlugs = new Set(partial.failedSpaces.map((s) => s.slug).filter((slug) => slug !== ''));
  const failed = (id: string) => failedIds.has(id) || failedSlugs.has(input.slugOf(id));
  const landedCount = input.targets.filter((id) => !failed(id) && (named || held.has(id))).length;
  return { ...partial, landedCount, spaceCount: input.targets.length };
}

function groupFailedSpaces(items: readonly ActionFailedSpace[]): StageFailedSpace[] {
  const bySpace = new Map<string, StageFailedSpace>();
  for (const item of items) {
    // A response may name a Space by slug only; the slug then keys it.
    const key = item.spaceId !== '' ? item.spaceId : item.spaceSlug;
    const space = bySpace.get(key) ?? { spaceId: item.spaceId, slug: item.spaceSlug, items: [] };
    space.items.push({ message: item.message, ...(item.unitSlug === undefined ? {} : { unitSlug: item.unitSlug }) });
    bySpace.set(key, space);
  }
  return [...bySpace.values()];
}

/** When a result names no Space, the targets that do not hold the change are the ones it failed in. */
function missingSpaces(input: StageFailureInput, held: ReadonlySet<string>): StageFailedSpace[] {
  return input.targets.filter((id) => !held.has(id)).map((spaceId) => ({ spaceId, slug: input.slugOf(spaceId), items: [] }));
}

/**
 * The Spaces a Retry writes into. A promote runs over every target again, since
 * it repeats nothing that already arrived. A release goes only to the Spaces whose
 * release failed (and that can be released), so a retry does not publish the
 * others a second time.
 */
export function retryTargets(
  failure: StageFailure,
  targets: readonly string[],
  releaseSpaceIds: readonly string[],
  slugOf: (spaceId: string) => string = () => '',
): string[] {
  if (failure.action !== 'release') return [...targets];
  const failedIds = new Set(failure.failedSpaces.map((s) => s.spaceId).filter((id) => id !== ''));
  const failedSlugs = new Set(failure.failedSpaces.map((s) => s.slug).filter((slug) => slug !== ''));
  return releaseSpaceIds.filter((id) => failedIds.has(id) || failedSlugs.has(slugOf(id)));
}

// ---------------------------------------------------------------------------
// Bylines
// ---------------------------------------------------------------------------

/**
 * Who promoted the stage and who released it, newest first, from the history the
 * page already reads. Either is absent when nothing records it.
 */
export function stageBylines(
  entries: readonly HistoryEntry[],
  stageId: string,
  stageSpaceIds: readonly string[],
): { promoted?: StageByline; released?: StageByline } {
  const spaces = new Set(stageSpaceIds);
  let promoted: StageByline | undefined;
  let released: StageByline | undefined;
  for (const entry of entries) {
    if (entry.kind === 'action' && entry.stage === stageId && entry.promotion !== undefined) {
      if (promoted === undefined || entry.at > promoted.at) promoted = { name: entry.person.name, isYou: entry.person.isYou, at: entry.at };
    } else if (entry.kind === 'release' && entry.release.SpaceID !== undefined && spaces.has(entry.release.SpaceID)) {
      if (released === undefined || entry.at > released.at) released = { name: entry.person.name, isYou: entry.person.isYou, at: entry.at };
    }
  }
  return { ...(promoted === undefined ? {} : { promoted }), ...(released === undefined ? {} : { released }) };
}
