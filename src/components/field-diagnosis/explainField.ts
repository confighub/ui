// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// explainField: what the server recorded about one field -> the tokens the details and the row
// card draw (PLAN.md U1). Pure and total: it never throws and never reads a cache. A fact that is
// not in the record is left out. The rules are the approved spike's (951538b, viewFromReport):
//   - needs: blocks first (failing gates, Link findings), then what waits (withheld changes, an
//     incoming upgrade), then warnings;
//   - the chain shows only when the value came from another Unit, oldest hop first;
//   - a Link that resolved the value names the set-by; the upgrade Link that only carried it
//     does not.
// Gates on a field come only from the field's own Validation entries (team-lead decision on D3:
// the Unit's other failing gates are in the pane's Gates tab, never in the field details).
import type { BlameOrigin, BlamePathChange, BlameValidation, MutationConflict } from '@confighub/rtk-query';

import { authoredDescription } from '@/utility/authored-description';
import { OVERRIDE_GUARD_KEY } from '@/utility/override-guard';

import type {
  ChainHop,
  ExplainContext,
  FieldFacts,
  FieldGuard,
  FieldHistoryEntry,
  FieldNeed,
  FieldSetBy,
  FieldState,
  FieldView,
  GateRef,
  GuardKind,
  LinkRef,
  NeedPart,
  NeedTone,
  RevisionRef,
  UnitRef,
} from './fieldDiagnosis.types';

/** How long ago `iso` was: "just now", "7m ago", "2h ago", "3d ago"; "—" when there is no time. */
export function shortAgo(iso: string | undefined, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** Descriptions the server writes itself. They say how, not why, so they are no reason. */
const SERVER_TEXT = /^(Functions:|Replayed revision|MergeExternal|Resolve with|Cloned from|UpdateUnit$)/;

/** The author's reason for a change, or undefined when the description is the server's own text. */
function reasonOf(description: string | undefined): string | undefined {
  const text = authoredDescription(description);
  return text && !SERVER_TEXT.test(text) ? text : undefined;
}

/** "admin@local.confighub.dev" -> "admin"; no user -> "automation". */
const person = (user: string | undefined) => (user ? user.split('@')[0] : 'automation');

/** YAML scalars end with a newline; the token does not. */
const trimValue = (value: string | undefined) => (value ?? '').replace(/\n$/, '');

/** "fd-prod/no-root-user/vet-celexpr" -> "no-root-user" (the Trigger). */
function gateName(gate: string | undefined): string {
  const parts = (gate ?? '').split('/');
  return parts.length >= 2 ? parts[1] : gate || 'gate';
}

const join = (parts: NeedPart[]) => parts.map((p) => (typeof p === 'string' ? p : p.label)).join('');

function need(n: Omit<FieldNeed, 'text'>): FieldNeed {
  return { ...n, text: join(n.parts) };
}

function guardOf(key: string, value: string, inherited: boolean): FieldGuard {
  if (key === OVERRIDE_GUARD_KEY) {
    return {
      key,
      value,
      kind: 'override',
      inherited,
      edits: true,
      merges: false,
      meaning: `${key}=${value}: a merge from upstream leaves this value alone. Your edits go through.`,
    };
  }
  const kind: GuardKind = key === 'Link' ? 'link' : key === 'Trigger' ? 'trigger' : 'requirement';
  const meaning =
    kind === 'requirement'
      ? `${key}=${value}: the value is on purpose. An edit asks you to confirm the guard; a merge is held back.`
      : `${key}=${value}: a ${key} writes this value. An edit asks you to confirm the guard; a merge is held back.`;
  return { key, value, kind, inherited, edits: false, merges: false, meaning };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function gateNeed(v: BlameValidation, index: number, tone: 'block' | 'warn'): FieldNeed {
  const message = v.Issues?.[0]?.Message ?? v.Details?.[0];
  const fn = v.Function || (v.Gate ?? '').split('/')[2];
  const issues = v.Issues?.length || v.Details?.length || 0;
  const ref: GateRef = {
    kind: 'gate',
    label: gateName(v.Gate),
    triggerId: v.TriggerID,
    gate: v.Gate,
    // The gate's own message is in its peek only (no prose on the line).
    peek: [gateName(v.Gate), [fn, tone === 'block' ? 'fail' : 'warn', issues ? plural(issues, 'issue') : ''].filter(Boolean).join(' · '), message ?? ''].filter(Boolean),
  };
  const block = tone === 'block';
  return need({
    kind: block ? 'gate' : 'warning',
    key: `${block ? 'gate' : 'warning'}-${index}`,
    tone,
    parts: block ? ['Gate ', ref, ' fails'] : ['Warning ', ref],
    meaning: [v.Gate, message, block ? 'A failed gate blocks a Release of this Unit.' : 'A warning does not block a Release.']
      .filter(Boolean)
      .join(': '),
    action: block ? 'Open gate' : 'Open',
    triggerId: v.TriggerID,
  });
}

function conflictNeed(c: MutationConflict, index: number, ctx: ExplainContext): FieldNeed {
  const guard = (c.Guards ?? (c.Guard ? [c.Guard] : [])).map((g) => g.Key).filter(Boolean).join(', ');
  const value = trimValue(c.Source?.Value);
  const fromUpstream = Boolean(c.UnitID) && c.UnitID === ctx.upstream?.unitId;
  const source: UnitRef = { kind: 'unit', label: 'Upstream', spaceId: fromUpstream ? ctx.upstream?.spaceId : undefined, unitId: c.UnitID };
  // D4: MutationConflict has no revision. A change from the upstream Unit is at the Unit's
  // UpstreamRevisionNum; a change from anywhere else gets no revision link.
  const revisionNum = fromUpstream ? ctx.upstream?.revisionNum : undefined;
  const wanted: NeedPart =
    revisionNum !== undefined
      ? {
          kind: 'revision',
          label: value,
          spaceId: ctx.upstream?.spaceId,
          unitId: c.UnitID,
          num: revisionNum,
          peek: [`rev ${revisionNum}`, ctx.upstream?.label ?? '', value].filter(Boolean),
        }
      : value;
  return need({
    kind: 'conflict',
    key: `conflict-${index}`,
    tone: 'wait',
    parts: [source, ' wants ', wanted, ` · held by ${guard}`],
    meaning: `A merge from upstream brought this value. The ${guard} guard kept the value of this Unit.`,
    action: 'Apply',
    secondary: 'Dismiss',
    conflict: c,
  });
}

function upgradeNeed(up: NonNullable<ExplainContext['incomingUpgrade']>): FieldNeed {
  const value: UnitRef = { kind: 'unit', label: up.value, spaceId: up.spaceId, unitId: up.unitId };
  const rev: RevisionRef = {
    kind: 'revision',
    label: `rev ${up.revisionNum}`,
    spaceId: up.spaceId,
    unitId: up.unitId,
    num: up.revisionNum,
    peek: [`rev ${up.revisionNum}`, up.value],
  };
  return need({
    kind: 'upgrade',
    key: 'upgrade-0',
    tone: 'wait',
    parts: ['Upstream has ', value, ' · ', rev],
    meaning: 'The upstream Unit has a newer value. Upgrade stages it, as the row checkbox does.',
    action: 'Upgrade',
  });
}

const TONE_ORDER: Record<NeedTone, number> = { block: 0, wait: 1, warn: 2 };

function needsOf(facts: FieldFacts, ctx: ExplainContext, value: string): FieldNeed[] {
  const f = facts.field;
  const validation = f.Validation ?? [];
  const needs: FieldNeed[] = [];
  validation.filter((v) => !v.Warning).forEach((v, i) => needs.push(gateNeed(v, i, 'block')));
  (f.Findings ?? []).forEach((finding, i) => {
    const linkName = f.Needed?.find((n) => n.BoundLink)?.BoundLink;
    needs.push(
      need({
        kind: 'finding',
        key: `finding-${i}`,
        tone: 'block',
        parts: [`Link finding: ${finding.Details ?? finding.Reason ?? ''}`],
        meaning: `${finding.Reason ?? 'Finding'}: the Link ${linkName ?? ''} cannot set this field until it resolves.`,
        action: 'Open Link',
      }),
    );
  });
  (f.Conflicts ?? []).forEach((c, i) => needs.push(conflictNeed(c, i, ctx)));
  if (ctx.incomingUpgrade && ctx.incomingUpgrade.value !== value) needs.push(upgradeNeed(ctx.incomingUpgrade));
  validation.filter((v) => v.Warning).forEach((v, i) => needs.push(gateNeed(v, i, 'warn')));
  // Stable sort: blocks first, then what waits, then warnings.
  return needs.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

const unitKey = (o: BlameOrigin) => `${o.SpaceSlug ?? ''}/${o.UnitSlug ?? ''}`;

/** The Units the value came through, oldest first, ending with this Unit; undefined when set here. */
function chainOf(facts: FieldFacts, here: string, hereSpace: string | undefined): ChainHop[] | undefined {
  const { hops, field } = facts;
  const origin = hops[hops.length - 1];
  if (!origin?.SpaceSlug || unitKey(origin) === here) return undefined;

  const first = hops[0];
  const linkFirst = first?.Source === 'NeedsProvides' ? first : undefined;
  const needed = field.Needed?.[0];
  // A hop in another Space is named by its Space; a hop in this Space (a Link's provider) by its Unit.
  const label = (o: BlameOrigin) => (o.SpaceSlug === hereSpace ? o.UnitSlug ?? '' : o.SpaceSlug ?? '');

  const upstream = hops
    .filter((o) => unitKey(o) !== here)
    .reverse()
    .map((o): ChainHop => {
      const ref: UnitRef = { kind: 'unit', label: label(o), spaceId: o.SpaceID, unitId: o.UnitID };
      // A NeedsProvides resource-name attribute is the provider's metadata.name.
      const provider = Boolean(linkFirst?.LinkUpstreamUnitID) && o.UnitID === linkFirst?.LinkUpstreamUnitID;
      if (provider && needed?.AttributeName === 'resource-name') {
        ref.field = 'metadata.name';
        ref.fres = `${needed.Details?.BoundProvidedProperties?.ResourceType ?? ''}|`;
      }
      return { label: ref.label, ref };
    });
  return [...upstream, { label: 'this Unit', this: true }];
}

function setByOf(facts: FieldFacts, now: number): FieldSetBy | undefined {
  const { hops, field } = facts;
  if (hops.length === 0) return undefined;
  const first = hops[0];
  const origin = hops[hops.length - 1];
  // A Link that resolved the value (NeedsProvides), not the upgrade Link that merged it from upstream.
  const linkHop = first.Link && first.Source !== 'UpgradeUnit' ? first : undefined;
  const at = linkHop ?? origin;
  const when = shortAgo(at.When, now);

  const reason = reasonOf(origin.Description);
  let whoRef: FieldSetBy['whoRef'];
  if (linkHop) {
    const ref: LinkRef = {
      kind: 'link',
      label: `Link ${linkHop.Link}`,
      peek: [
        `Link ${linkHop.Link}`,
        `${linkHop.LinkUpstream ?? '?'} → this Unit`,
        field.Needed?.[0]?.AttributeName ?? '',
        (field.Findings ?? []).length > 0 ? 'finding' : 'resolved',
      ].filter(Boolean),
      name: linkHop.Link ?? '',
      linkId: linkHop.LinkID,
      providerUnitId: linkHop.LinkUpstreamUnitID,
      spaceId: linkHop.SpaceID,
      attribute: field.Needed?.[0]?.AttributeName,
      resourceType: field.Needed?.[0]?.Details?.BoundProvidedProperties?.ResourceType,
    };
    whoRef = ref;
  } else {
    whoRef = {
      kind: 'user',
      label: person(origin.User),
      user: origin.User,
      peek: [origin.User ?? 'automation', origin.RevisionNum !== undefined ? `rev ${origin.RevisionNum}` : ''].filter(Boolean),
    };
  }

  const changeOrder = origin.ChangeOrders?.[0] ?? first.ChangeOrders?.[0];
  const coSlash = changeOrder?.lastIndexOf('/') ?? -1;
  return {
    who: whoRef.label,
    whoRef,
    when,
    whenRef:
      at.RevisionNum !== undefined
        ? {
            kind: 'revision',
            label: when,
            spaceId: at.SpaceID,
            unitId: at.UnitID,
            num: at.RevisionNum,
            peek: [`rev ${at.RevisionNum}`, `${person(at.User)} · ${when}`, reasonOf(at.Description) ?? ''].filter(Boolean),
          }
        : undefined,
    reason,
    changeOrder: changeOrder
      ? {
          kind: 'changeOrder',
          label: coSlash >= 0 ? changeOrder.slice(coSlash + 1) : changeOrder,
          space: coSlash >= 0 ? changeOrder.slice(0, coSlash) : undefined,
          slug: coSlash >= 0 ? changeOrder.slice(coSlash + 1) : changeOrder,
        }
      : undefined,
  };
}

/**
 * The field's History, newest first (the latest change is what a person looks for first). A row
 * names its function or Link only when it has no reason: the reason already says why.
 */
function historyOf(history: BlamePathChange[] | undefined, value: string, now: number): FieldHistoryEntry[] {
  const rows = (history ?? []).map((h) => {
    const v = trimValue(h.Value);
    const o = h.Origin ?? {};
    const reason = reasonOf(o.Description);
    return {
      value: v,
      who: person(o.User),
      when: shortAgo(o.When, now),
      reason,
      revisionNum: o.RevisionNum,
      revision:
        o.RevisionNum !== undefined
          ? {
              kind: 'revision',
              label: `rev ${o.RevisionNum}`,
              spaceId: o.SpaceID,
              unitId: o.UnitID,
              num: o.RevisionNum,
              peek: [`rev ${o.RevisionNum}`, `${person(o.User)} · ${shortAgo(o.When, now)}`, reasonOf(o.Description) ?? ''].filter(Boolean),
            }
          : undefined,
      setBy: reason ? undefined : o.Link ? `Link ${o.Link}` : o.Function || undefined,
      current: v === value,
    } satisfies FieldHistoryEntry;
  });
  // Stable: rows with no revision keep their place relative to each other, after the numbered ones.
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (b.row.revisionNum ?? -1) - (a.row.revisionNum ?? -1) || a.i - b.i)
    .map(({ row }) => row);
}

function stateOf(facts: FieldFacts, ctx: ExplainContext): FieldState {
  if (ctx.error) return 'error';
  if (ctx.loading) return 'loading';
  if (facts.field.Absent) return 'absent';
  if (facts.field.Deleted) return 'deleted';
  if (!facts.field.Path) return 'resource';
  return 'ready';
}

/** The view of one field. */
export function explainField(facts: FieldFacts, ctx: ExplainContext = {}): FieldView {
  const now = ctx.now ?? Date.now();
  const f = facts.field;
  const hereSpace = f.SpaceSlug ?? facts.hops[0]?.SpaceSlug;
  const here = `${hereSpace ?? ''}/${f.UnitSlug ?? facts.hops[0]?.UnitSlug ?? ''}`;
  const value = trimValue(f.Value);
  const inherited = new Set(f.InheritedGuards ?? []);

  return {
    state: stateOf(facts, ctx),
    stale: Boolean(ctx.stale),
    path: f.Path ?? '',
    ref: f.Ref,
    resourceType: f.ResourceType,
    resourceName: f.ResourceName,
    value,
    pending: ctx.pending !== undefined && ctx.pending !== value ? ctx.pending : undefined,
    setBy: setByOf(facts, now),
    chain: chainOf(facts, here, hereSpace),
    needs: needsOf(facts, ctx, value),
    guards: Object.entries(f.Guards ?? {}).map(([key, v]) => guardOf(key, v, inherited.has(key))),
    history: historyOf(facts.history, value, now),
    provided: (f.Provided ?? []).flatMap((p) =>
      p.AttributeName ? [{ attribute: p.AttributeName, ...(p.ResourceType ? { resourceType: p.ResourceType } : {}) }] : [],
    ),
  };
}
