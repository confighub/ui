// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment } from '../../componentTypes';
import {
  type ConditionKind,
  WAVE_CONDITIONS,
  type WaveCondition,
  cardSeverity,
  conditionsOf,
} from './deploymentCondition';
import {
  CARD_CAP,
  FOLD_THRESHOLD,
  GROUP_OFF,
  RECOVERED_HOLD_MS,
  WAVE_MIN_COUNT,
  WAVE_MIN_SHARE,
} from './foldConstants';
import { type QuietGroup, groupByOptions, groupQuiet } from './groupBy';

/** Whether `?graphGroup=` asks for the unfolded layout, in any letter case. */
export function isGroupOff(groupParam: string | null | undefined): boolean {
  return groupParam?.toLowerCase() === GROUP_OFF;
}

/**
 * Whether a Component's graph folds. The user's choice wins: `?graphGroup=off`
 * (in any letter case) never folds, and a key the Group by menu offers always
 * folds. A value that is not an offered key is no choice: the graph could
 * only fall back to the default key, so the threshold decides, as with no
 * value at all. With no choice, the Component folds at FOLD_THRESHOLD
 * Deployments or more.
 *
 * @param groupParam `?graphGroup=` as the URL holds it
 * @param offeredKeys the Group by keys on offer; read from `deployments` when
 *   omitted, but a caller that adds derived data (Release ages) passes its own
 */
export function shouldFold(
  deployments: readonly ComponentDeployment[],
  groupParam?: string | null,
  offeredKeys?: readonly string[],
): boolean {
  if (isGroupOff(groupParam)) return false;
  if (groupParam) {
    const offered = offeredKeys ?? groupByOptions(foldMembers(deployments)).map((o) => o.key);
    if (offered.includes(groupParam)) return true;
  }
  return deployments.filter((d) => d.type === 'Deployment').length >= FOLD_THRESHOLD;
}

/** A config condition on most of a Base's members, shown once on its fold. */
export interface Wave {
  condition: WaveCondition;
  count: number;
  memberIds: string[];
}

/** A member shown as a full card, and why. */
export interface FoldCard {
  id: string;
  /**
   * - `exception`: it needs attention (within the card cap).
   * - `recovered`: it was an exception and recovered; it stays a card for a
   *   short hold so a poll does not pull it away from the user.
   * - `selected`: it is selected; a selected card never folds.
   */
  reason: 'exception' | 'recovered' | 'selected';
  /** From `cardSeverity`: 5 (Degraded) to 1 (Unreleased changes), 0 when quiet. */
  severity: number;
}

/** The folded view of one Base: its leaf children as cards and stacks. */
export interface BaseFold {
  baseId: string;
  /** The Base's leaf children, in slug order (the tree's child order). */
  memberIds: string[];
  /** In the order stale, unreleased, gated. */
  waves: Wave[];
  waveSet: ReadonlySet<WaveCondition>;
  /** Exceptions worst first (at most CARD_CAP), then held and selected cards. */
  cards: FoldCard[];
  /** Exceptions past the card cap; they stay in stacks with a coloured mark. */
  overCapIds: string[];
  groups: QuietGroup[];
  /** Members that are not cards. */
  quietCount: number;
}

/** Where a fold member is drawn. */
export type DeploymentLocation =
  | { baseId: string; kind: 'card' }
  | { baseId: string; kind: 'loose' | 'stack'; groupId: string };

export interface FoldModel {
  groupKey: string | null;
  /** Keyed by Base id; only nodes with at least one leaf child. */
  bases: ReadonlyMap<string, BaseFold>;
  /** Keyed by Deployment id; only fold members (leaf children of a Base). */
  location: ReadonlyMap<string, DeploymentLocation>;
  /** Keyed by Deployment id; every node. */
  conditions: ReadonlyMap<string, Record<ConditionKind, boolean>>;
}

const bySlug = (a: ComponentDeployment, b: ComponentDeployment): number =>
  a.slug.localeCompare(b.slug);

/**
 * The leaf children of every node that has any, keyed by that node's id.
 * Only leaves fold: a child with children of its own is a Base in the tree,
 * and folding it would hide the Deployments below it.
 */
export function foldBaseMembers(
  deployments: readonly ComponentDeployment[],
): Map<string, ComponentDeployment[]> {
  const children = new Map<string, ComponentDeployment[]>();
  for (const d of deployments) {
    if (d.parentDeploymentId === null) continue;
    const list = children.get(d.parentDeploymentId);
    if (list) list.push(d);
    else children.set(d.parentDeploymentId, [d]);
  }
  const members = new Map<string, ComponentDeployment[]>();
  for (const [parentId, kids] of children) {
    const leaves = kids.filter((k) => !children.has(k.deploymentId)).sort(bySlug);
    if (leaves.length > 0) members.set(parentId, leaves);
  }
  return members;
}

/** Every fold member of a Component: the input to the Group by options. */
export function foldMembers(
  deployments: readonly ComponentDeployment[],
): ComponentDeployment[] {
  return [...foldBaseMembers(deployments).values()].flat();
}

function wavesOf(
  members: readonly ComponentDeployment[],
  conditions: ReadonlyMap<string, Record<ConditionKind, boolean>>,
): Wave[] {
  const waves: Wave[] = [];
  for (const condition of WAVE_CONDITIONS) {
    const memberIds = members
      .filter((m) => conditions.get(m.deploymentId)?.[condition])
      .map((m) => m.deploymentId);
    const count = memberIds.length;
    if (count >= WAVE_MIN_COUNT && count >= WAVE_MIN_SHARE * members.length) {
      waves.push({ condition, count, memberIds });
    }
  }
  return waves;
}

export interface BuildFoldModelInput {
  deployments: readonly ComponentDeployment[];
  groupKey: string | null;
  /** Members whose recovered hold has not run out; they stay cards while quiet. */
  recoveredIds?: ReadonlySet<string>;
  /** Selected members that were cards; a selected card never folds. */
  keepAsCardIds?: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Decide, for every Base with leaf children, which members are full cards,
 * which conditions are waves, and how the quiet rest stacks.
 */
export function buildFoldModel({
  deployments,
  groupKey,
  recoveredIds = NO_IDS,
  keepAsCardIds = NO_IDS,
}: BuildFoldModelInput): FoldModel {
  const conditions = new Map<string, Record<ConditionKind, boolean>>();
  for (const d of deployments) conditions.set(d.deploymentId, conditionsOf(d));

  const bases = new Map<string, BaseFold>();
  const location = new Map<string, DeploymentLocation>();

  for (const [baseId, members] of foldBaseMembers(deployments)) {
    const waves = wavesOf(members, conditions);
    const waveSet: ReadonlySet<WaveCondition> = new Set(waves.map((w) => w.condition));
    const severity = new Map(
      members.map((m) => [
        m.deploymentId,
        cardSeverity(conditions.get(m.deploymentId) ?? conditionsOf(m), waveSet),
      ]),
    );
    const sev = (m: ComponentDeployment) => severity.get(m.deploymentId) ?? 0;

    const exceptions = members
      .filter((m) => sev(m) > 0)
      .sort((a, b) => sev(b) - sev(a) || a.displayName.localeCompare(b.displayName));
    const cards: FoldCard[] = exceptions
      .slice(0, CARD_CAP)
      .map((m) => ({ id: m.deploymentId, reason: 'exception', severity: sev(m) }));
    let overCap = exceptions.slice(CARD_CAP);

    // Held and selected cards sit after the capped list and do not count
    // towards the cap: they are there for the user's continuity, not because
    // they need attention.
    const isCard = new Set(cards.map((c) => c.id));
    for (const m of members) {
      if (isCard.has(m.deploymentId)) continue;
      if (recoveredIds.has(m.deploymentId) && sev(m) === 0) {
        cards.push({ id: m.deploymentId, reason: 'recovered', severity: 0 });
        isCard.add(m.deploymentId);
      }
    }
    for (const m of members) {
      if (isCard.has(m.deploymentId)) continue;
      if (keepAsCardIds.has(m.deploymentId)) {
        cards.push({ id: m.deploymentId, reason: 'selected', severity: sev(m) });
        isCard.add(m.deploymentId);
      }
    }
    overCap = overCap.filter((m) => !isCard.has(m.deploymentId));

    const quiet = members.filter((m) => !isCard.has(m.deploymentId));
    const groups = groupQuiet(baseId, quiet, groupKey);

    for (const c of cards) location.set(c.id, { baseId, kind: 'card' });
    for (const g of groups) {
      const kind = g.kind === 'loose' ? 'loose' : 'stack';
      for (const id of g.memberIds) location.set(id, { baseId, kind, groupId: g.id });
    }

    bases.set(baseId, {
      baseId,
      memberIds: members.map((m) => m.deploymentId),
      waves,
      waveSet,
      cards,
      overCapIds: overCap.map((m) => m.deploymentId),
      groups,
      quietCount: quiet.length,
    });
  }

  return { groupKey, bases, location, conditions };
}

/** Stacks drawn over all Bases; a loose card is not a stack. */
export function countStacks(model: FoldModel): number {
  let n = 0;
  for (const base of model.bases.values()) {
    n += base.groups.filter((g) => g.kind === 'stack' || g.kind === 'other').length;
  }
  return n;
}

/**
 * The distinct values the stacks and loose cards of all Bases show, a merged
 * stack counted by the values it holds. It counts what is drawn: a value held
 * only by Deployments that are cards has no stack, so it is not counted, and
 * the Group by menu then agrees with the canvas.
 */
export function countDrawnValues(model: FoldModel): number {
  const values = new Set<string>();
  for (const base of model.bases.values()) {
    for (const g of base.groups) {
      if (g.kind === 'other') for (const label of g.mergedLabels ?? []) values.add(label);
      else values.add(g.label);
    }
  }
  return values.size;
}

/** Full cards drawn over all Bases (not counting loose quiet cards). */
export function countCards(model: FoldModel): number {
  let n = 0;
  for (const base of model.bases.values()) n += base.cards.length;
  return n;
}

/**
 * Where a Deployment lives, in words, for search results: "prod Base › retail
 * stack". Search must say this because a folded Deployment has no card to
 * point at until its stack opens.
 */
export function locationText(
  id: string,
  model: FoldModel,
  deploymentsById: ReadonlyMap<string, ComponentDeployment>,
): string {
  const loc = model.location.get(id);
  if (!loc) return deploymentsById.get(id)?.displayName ?? id;
  const base = `${deploymentsById.get(loc.baseId)?.displayName ?? loc.baseId} Base`;
  if (loc.kind === 'card') return `${base} › card`;
  const group = model.bases.get(loc.baseId)?.groups.find((g) => g.id === loc.groupId);
  const label = group?.label ?? '';
  return loc.kind === 'loose' ? `${base} › quiet card, ${label}` : `${base} › ${label} stack`;
}

/** A member's card severity in a model, with its Base's waves; 0 when not a member. */
function severityIn(model: FoldModel, id: string): number {
  const loc = model.location.get(id);
  const c = model.conditions.get(id);
  const base = loc && model.bases.get(loc.baseId);
  if (!c || !base) return 0;
  return cardSeverity(c, base.waveSet);
}

const NO_WAVES: ReadonlySet<WaveCondition> = new Set();

/**
 * Whether a member has no card-earning condition at all, waves included. A
 * card whose condition became a wave on its Base is quiet on the canvas, but
 * it did not recover: the Base got worse.
 */
function clearedIn(model: FoldModel, id: string): boolean {
  const c = model.conditions.get(id);
  return !!c && cardSeverity(c, NO_WAVES) === 0;
}

export interface UpdateRecoveredHoldsInput {
  previous: FoldModel | null;
  next: FoldModel;
  /** Deployment id -> time (ms) the hold runs out. */
  holds: ReadonlyMap<string, number>;
  now: number;
}

/**
 * Keep a card that just recovered on screen for RECOVERED_HOLD_MS, so a
 * status poll does not fold it away while the user is looking at it. A hold
 * ends when it runs out or when the Deployment needs attention again (then it
 * is an exception card in its own right). A card whose condition joined a
 * wave folds at once: it did not recover, and "Recovered" would say it did.
 *
 * Returns the same map when nothing changed, so a caller that keeps the holds
 * in state does not re-render on every poll.
 */
export function updateRecoveredHolds({
  previous,
  next,
  holds,
  now,
}: UpdateRecoveredHoldsInput): ReadonlyMap<string, number> {
  let out: Map<string, number> | null = null;
  const edit = (): Map<string, number> => {
    if (!out) out = new Map(holds);
    return out;
  };

  for (const [id, until] of holds) {
    if (until <= now || !next.location.has(id) || severityIn(next, id) > 0) edit().delete(id);
  }
  if (previous) {
    for (const base of previous.bases.values()) {
      for (const card of base.cards) {
        if (card.reason !== 'exception' || (out ?? holds).has(card.id)) continue;
        if (!next.location.has(card.id) || !clearedIn(next, card.id)) continue;
        edit().set(card.id, now + RECOVERED_HOLD_MS);
      }
    }
  }
  return out ?? holds;
}

/** The selected Deployments that were cards, so they stay cards in the next model. */
export function keepSelectedCards(
  previous: FoldModel | null,
  selectedIds: ReadonlySet<string>,
): Set<string> {
  const keep = new Set<string>();
  if (!previous) return keep;
  for (const id of selectedIds) {
    if (previous.location.get(id)?.kind === 'card') keep.add(id);
  }
  return keep;
}

/**
 * The closed stack that hides a Deployment, or null when it has a card on
 * screen (or is not a fold member). A Deployment focused from outside the
 * canvas (a link, the side pane, a new variant) has no card to pan to until
 * this stack opens.
 */
export function closedStackOf(
  model: FoldModel | null,
  id: string,
  expandedGroupIds: ReadonlySet<string>,
): string | null {
  const loc = model?.location.get(id);
  if (loc?.kind !== 'stack' || expandedGroupIds.has(loc.groupId)) return null;
  return loc.groupId;
}

/**
 * The closed stacks that hide any of these Deployments, each once. A compare
 * deep link names Deployments that may be quiet, so their stacks open for
 * them to get a card and a letter on the canvas.
 */
export function closedStacksOf(
  model: FoldModel | null,
  ids: Iterable<string>,
  expandedGroupIds: ReadonlySet<string>,
): string[] {
  const groups = new Set<string>();
  for (const id of ids) {
    const groupId = closedStackOf(model, id, expandedGroupIds);
    if (groupId) groups.add(groupId);
  }
  return [...groups];
}
