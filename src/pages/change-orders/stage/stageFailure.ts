// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A promotion or release of the stage that did not finish, and who promoted or
 * released it: read from this browser's last result and from the ChangeOrder's
 * own records.
 */

import type { ChangeOrderPromotion, ChangeOrderPromotionFailure } from '@confighub/rtk-query';

import { parseGateName } from '../../../utility/name-format-functions';
import type { HistoryEntry } from '../changeOrderHistory';
import type { ChangeOrderStageVerdict } from '../../x/apps/change-order/changeOrderTypes';
import { stageCardCopy } from './stageCardCopy';
import type { ActionFailedSpace, StageByline, StageFailedSpace, StageFailure, StageFailureItem } from './stageTypes';

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
// A Unit refused because gates hold it
// ---------------------------------------------------------------------------

/** How the server starts its refusal to release (or apply) a Unit that has gates. */
const GATED_MESSAGE = 'outstanding ValidationErrors';

/** The gate that holds a Unit while its Triggers still run; it has no Trigger of its own. */
export const AWAITING_TRIGGERS_GATE = 'awaiting/triggers';

/**
 * The gates a failed item names, when the server refused the Unit because of its
 * gates; `undefined` for any other failure. The server lists them comma-joined after
 * "Validation Errors:" in the message's metadata, which both a release's 422 answer
 * and a promotion record carry. A message without that list names none, and the
 * line then says only that the Unit is gated.
 */
export function gateNamesOf(message: string): string[] | undefined {
  if (!message.includes(GATED_MESSAGE)) return undefined;
  const listed = /Validation Errors:\s*(\S+)/.exec(message)?.[1] ?? '';
  return [...new Set(listed.split(',').map((name) => name.trim()).filter((name) => name !== ''))];
}

/**
 * The names a reader sees for these gates, one per Trigger: the Trigger's
 * DisplayName when it is known, else its slug from the gate's name. The
 * function's name is left out, since it says nothing about what is wrong.
 */
export function gateLabels(gateNames: readonly string[], displayNameOf: (gateName: string) => string | undefined = () => undefined): string[] {
  const labels = gateNames.map((gate) => {
    if (gate === AWAITING_TRIGGERS_GATE) return stageCardCopy.problem.triggersStillRun;
    const shown = displayNameOf(gate)?.trim();
    return shown !== undefined && shown !== '' ? shown : parseGateName(gate).triggerSlug;
  });
  return [...new Set(labels)];
}

/** The Units of one failed Space that gates hold, each with the gates named, and the Space's other items. */
export interface GatedItems<Item extends StageFailureItem> {
  /** One per Unit, in the order the items name them; a Unit the failure does not name has no `unitSlug`. */
  gated: { unitSlug?: string; unitId?: string; gates: string[]; messages: string[] }[];
  others: Item[];
}

/** Splits a failed Space's items into the Units gates hold, grouped by Unit, and every other failure. */
export function splitGatedItems<Item extends StageFailureItem>(items: readonly Item[]): GatedItems<Item> {
  const byUnit = new Map<string, GatedItems<Item>['gated'][number]>();
  const others: Item[] = [];
  for (const item of items) {
    const gates = gateNamesOf(item.message);
    if (gates === undefined) {
      others.push(item);
      continue;
    }
    const key = item.unitSlug ?? '';
    const unit = byUnit.get(key) ?? {
      ...(item.unitSlug === undefined ? {} : { unitSlug: item.unitSlug }),
      ...(item.unitId === undefined ? {} : { unitId: item.unitId }),
      gates: [],
      messages: [],
    };
    for (const gate of gates) if (!unit.gates.includes(gate)) unit.gates.push(gate);
    if (!unit.messages.includes(item.message)) unit.messages.push(item.message);
    byUnit.set(key, unit);
  }
  return { gated: [...byUnit.values()], others };
}

/**
 * Each gate's Trigger DisplayName, found by the Trigger ID the gated Units record
 * for it (`ValidationTriggerIDs`), not by the slugs in its name: a Trigger renamed
 * or moved since keeps its ID, and two Spaces may each have a Trigger of one slug.
 * A gate with no recorded ID, or whose Trigger is gone, has no name here.
 */
export function triggerNamesByGate(
  units: readonly { ValidationTriggerIDs?: Readonly<Record<string, string>> }[],
  triggers: readonly { TriggerID?: string; DisplayName?: string }[],
): Map<string, string> {
  const nameById = new Map<string, string>();
  for (const trigger of triggers) {
    const name = trigger.DisplayName?.trim();
    if (trigger.TriggerID !== undefined && name !== undefined && name !== '') nameById.set(trigger.TriggerID, name);
  }
  const names = new Map<string, string>();
  for (const unit of units) {
    for (const [gate, triggerId] of Object.entries(unit.ValidationTriggerIDs ?? {})) {
      const name = nameById.get(triggerId);
      if (name !== undefined) names.set(gate, name);
    }
  }
  return names;
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
