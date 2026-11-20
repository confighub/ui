// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// explainField turns what the server recorded about one field into the tokens the details and
// the row card draw (PLAN.md U1, contract sections 6 and 8). Pure and total: one case per state.
import type { BlameField, UnitPathReport } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { factsFromPath } from '../src/components/field-diagnosis/adapters';
import { explainField, shortAgo } from '../src/components/field-diagnosis/explainField';
import type { ExplainContext, FieldRef, FieldView } from '../src/components/field-diagnosis/fieldDiagnosis.types';
import {
  PENDING_VALUE,
  SEED,
  gatePath,
  inherited,
  linkSet,
  longest,
  many,
  override,
  pending,
  plain,
  requirement,
} from './fixtures/field-diagnosis/states';

const HOUR = 3_600_000;

/** "Now" is two hours after the last change of the report, so the time token is stable. */
function nowAfter(report: UnitPathReport, ms = 2 * HOUR): number {
  const whens = (report.Changes ?? []).map((c) => Date.parse(c.Origin?.When ?? '')).filter((t) => !Number.isNaN(t));
  return Math.max(...whens) + ms;
}

function explain(report: UnitPathReport, ctx: ExplainContext = {}): FieldView {
  return explainField(factsFromPath(report), { now: nowAfter(report), ...ctx });
}

const labels = (refs: (string | FieldRef)[]) => refs.map((p) => (typeof p === 'string' ? p : p.label)).join('');

test.describe('s1-plain', () => {
  test('value, set-by, nothing else', () => {
    const view = explain(plain());
    expect(view.state).toBe('ready');
    expect(view.value).toBe('7');
    expect(view.path).toBe('spec.replicas');
    expect(view.setBy?.who).toBe('admin');
    expect(view.setBy?.when).toBe('2h ago');
    expect(view.setBy?.reason).toBeUndefined(); // "Functions: set-replicas" is the server's text
    expect(view.chain).toBeUndefined();
    expect(view.needs).toEqual([]);
    expect(view.guards).toEqual([]);
  });

  test('the server\'s own "UpdateUnit" is no reason', () => {
    const report = plain();
    const origin = report.Changes?.[0]?.Origin;
    if (origin) origin.Description = 'UpdateUnit';
    expect(explain(report).setBy?.reason).toBeUndefined();
  });

  // The server appends "| Functions: <names>" to a revision's description (fd-prod/web
  // spec.replicas, `cub unit path --history`, 2026-11-19): only the author's words are the reason.
  for (const [raw, want] of [
    ['Prod runs 8 for Black Friday| Functions: set-replicas', 'Prod runs 8 for Black Friday'],
    ['Scale in after load test | Functions: set-replicas, set-image', 'Scale in after load test'],
    ['Back to Black Friday capacity|Functions:', 'Back to Black Friday capacity'],
    ['Functions: set-replicas', undefined],
  ] as const) {
    test(`reason of ${JSON.stringify(raw)}`, () => {
      const report = plain();
      const origin = report.Changes?.[0]?.Origin;
      if (origin) origin.Description = raw;
      expect(explain(report).setBy?.reason).toBe(want);
      report.History = [{ Value: '8\n', Origin: { Description: raw, RevisionNum: 9 } }];
      expect(explain(report).history[0]?.reason).toBe(want);
    });
  }

  test("the author's reason, without the server's Functions suffix", () => {
    const report = plain();
    const origin = report.Changes?.[0]?.Origin;
    if (origin) origin.Description = 'Prod runs 6 for Black Friday | Functions: set-replicas';
    expect(explain(report).setBy?.reason).toBe('Prod runs 6 for Black Friday');
  });

  test('the time token links to the revision that set the value', () => {
    expect(explain(plain()).setBy?.whenRef).toEqual({
      kind: 'revision',
      label: '2h ago',
      spaceId: SEED.baseSpaceId,
      unitId: SEED.baseWebId,
      num: 3,
      peek: ['rev 3', 'admin · 2h ago'],
    });
  });

  test('the user is a plain token with the full name for its peek', () => {
    expect(explain(plain()).setBy?.whoRef).toEqual({
      kind: 'user',
      label: 'admin',
      user: 'admin@local.confighub.dev',
      peek: ['admin@local.confighub.dev', 'rev 3'],
    });
  });
});

test.describe('s2-inherited', () => {
  test('the chain names each Space, oldest first, and ends with this Unit', () => {
    const view = explain(inherited());
    expect(view.chain?.map((h) => h.label)).toEqual(['fd-base', 'fd-staging', 'this Unit']);
    expect(view.chain?.[2]?.this).toBe(true);
  });

  test('each hop is a Unit ref to the same field there', () => {
    const [base, staging] = explain(inherited()).chain ?? [];
    expect(base?.ref).toEqual({ kind: 'unit', label: 'fd-base', spaceId: SEED.baseSpaceId, unitId: SEED.baseWebId });
    expect(staging?.ref).toEqual({ kind: 'unit', label: 'fd-staging', spaceId: SEED.stagingSpaceId, unitId: SEED.stagingWebId });
  });

  test('set-by names the person in the base; server texts are no reason', () => {
    const view = explain(inherited());
    expect(view.setBy?.who).toBe('admin');
    expect(view.setBy?.reason).toBeUndefined(); // "MergeExternal; from ..."
    expect(view.setBy?.whenRef).toMatchObject({ kind: 'revision', spaceId: SEED.baseSpaceId, num: 2 });
  });
});

test.describe('s5-override', () => {
  const ctx: ExplainContext = {
    upstream: { spaceId: SEED.stagingSpaceId, unitId: SEED.stagingWebId, revisionNum: SEED.prodUpstreamRevisionNum },
  };

  test('the wanted value peeks its revision, the upstream Unit and the value', () => {
    const parts = explain(override(), { upstream: { ...ctx.upstream, label: 'fd-staging/web' } }).needs[0]?.parts ?? [];
    const rev = parts.find((p): p is FieldRef => typeof p !== 'string' && p.kind === 'revision');
    expect(rev?.peek).toEqual(['rev 3', 'fd-staging/web', '7']);
  });

  test('one wait need: Upstream wants 7, held by Override', () => {
    const view = explain(override(), ctx);
    expect(view.needs).toHaveLength(1);
    const need = view.needs[0];
    expect(need?.kind).toBe('conflict');
    expect(need?.tone).toBe('wait');
    expect(need?.text).toBe('Upstream wants 7 · held by Override');
    expect(labels(need?.parts ?? [])).toBe(need?.text);
    expect(need?.action).toBe('Apply');
    expect(need?.secondary).toBe('Dismiss');
    expect(need?.conflict?.Reason).toBe('Guarded');
  });

  test('"Upstream" is the source Unit; 7 is the upstream revision (D4)', () => {
    const parts = explain(override(), ctx).needs[0]?.parts ?? [];
    const refs = parts.filter((p): p is FieldRef => typeof p !== 'string');
    expect(refs).toEqual([
      { kind: 'unit', label: 'Upstream', spaceId: SEED.stagingSpaceId, unitId: SEED.stagingWebId },
      { kind: 'revision', label: '7', spaceId: SEED.stagingSpaceId, unitId: SEED.stagingWebId, num: 3, peek: ['rev 3', '7'] },
    ]);
  });

  test('no revision link when the conflict did not come from the upstream Unit', () => {
    const parts = explain(override(), { upstream: { unitId: 'another-unit', revisionNum: 9 } }).needs[0]?.parts ?? [];
    expect(parts.some((p) => typeof p !== 'string' && p.kind === 'revision')).toBe(false);
  });

  test('the Override guard: edits allowed, merges held', () => {
    expect(explain(override(), ctx).guards).toEqual([
      expect.objectContaining({ key: 'Override', value: 'Upstream', kind: 'override', edits: true, merges: false, inherited: false }),
    ]);
  });

  test('a value set in this Unit has no chain', () => {
    expect(explain(override(), ctx).chain).toBeUndefined();
  });
});

test.describe('s6-requirement', () => {
  test('the requirement guard blocks edits and merges', () => {
    expect(explain(requirement()).guards).toEqual([
      expect.objectContaining({ key: 'RunAsRoot', value: 'LegacyImage', kind: 'requirement', edits: false, merges: false }),
    ]);
  });

  test('no gate need without a per-path Validation entry (D3: no text heuristic)', () => {
    expect(explain(requirement()).needs).toEqual([]);
  });

  test('a per-path gate is one block need with its Trigger', () => {
    const view = explain(gatePath());
    expect(view.needs).toHaveLength(1);
    const need = view.needs[0];
    expect(need?.kind).toBe('gate');
    expect(need?.tone).toBe('block');
    expect(need?.text).toBe('Gate no-root-user fails');
    expect(need?.triggerId).toBe(SEED.noRootUserTriggerId);
    expect(need?.parts).toContainEqual({
      kind: 'gate',
      label: 'no-root-user',
      triggerId: SEED.noRootUserTriggerId,
      gate: 'fd-prod/no-root-user/vet-celexpr',
      // The message is in the peek, not on the line (team-lead Q1 (b)).
      peek: ['no-root-user', 'vet-celexpr · fail · 1 issue', 'runAsUser must not be 0'],
    });
    expect(need?.meaning).toContain('runAsUser must not be 0');
  });
});

test.describe('s8-pending', () => {
  test('the pane edit shows; the rest is the saved field', () => {
    const view = explain(pending(), { pending: PENDING_VALUE });
    expect(view.pending).toBe('9');
    expect(view.value).toBe('7');
    expect(view.chain?.map((h) => h.label)).toEqual(['fd-base', 'this Unit']);
    expect(view.setBy?.who).toBe('admin'); // the upgrade Link only carried it; the base set it
  });

  test('without an edit, no pending token', () => {
    expect(explain(pending()).pending).toBeUndefined();
  });

  test('an edit equal to the saved value is no pending edit', () => {
    expect(explain(pending(), { pending: '7' }).pending).toBeUndefined();
  });
});

test.describe('s12-many', () => {
  test('needs sorted block, then wait, then warn', () => {
    const view = explain(many());
    expect(view.needs.map((n) => [n.kind, n.tone])).toEqual([
      ['gate', 'block'],
      ['finding', 'block'],
      ['conflict', 'wait'],
      ['warning', 'warn'],
    ]);
  });

  test('need keys are unique', () => {
    const keys = explain(many()).needs.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('guards keep the inherited mark', () => {
    const tenant = explain(many()).guards.find((g) => g.key === 'Tenant');
    expect(tenant?.inherited).toBe(true);
    expect(explain(many()).guards.find((g) => g.key === 'Link')?.kind).toBe('link');
  });
});

test.describe('link-set', () => {
  test('set-by is the Link; the chain hop is the provider Unit at metadata.name', () => {
    const view = explain(linkSet());
    expect(view.setBy?.who).toBe('Link web-to-ns');
    expect(view.setBy?.whoRef).toMatchObject({
      kind: 'link',
      label: 'Link web-to-ns',
      name: 'web-to-ns',
      providerUnitId: SEED.prodNsId,
      spaceId: SEED.prodSpaceId,
      attribute: 'resource-name',
    });
    expect(view.chain?.map((h) => h.label)).toEqual(['ns', 'this Unit']);
    expect(view.chain?.[0]?.ref).toMatchObject({ kind: 'unit', unitId: SEED.prodNsId, field: 'metadata.name' });
  });
});

test.describe('overflow', () => {
  test('the long image is kept whole', () => {
    expect(explain(longest()).value).toBe('registry.example.com/legacy/web:1.4.2');
  });
});

test.describe('incoming upgrade', () => {
  test('one wait need: Upstream has 9 · rev 4', () => {
    const view = explain(pending(), {
      incomingUpgrade: { value: '9', revisionNum: 4, spaceId: SEED.baseSpaceId, unitId: SEED.baseWebId },
    });
    const need = view.needs.find((n) => n.kind === 'upgrade');
    expect(need?.tone).toBe('wait');
    expect(need?.text).toBe('Upstream has 9 · rev 4');
    expect(need?.action).toBe('Upgrade'); // D9: ticks the row's upgrade checkbox
    expect(need?.parts.filter((p) => typeof p !== 'string')).toEqual([
      { kind: 'unit', label: '9', spaceId: SEED.baseSpaceId, unitId: SEED.baseWebId },
      { kind: 'revision', label: 'rev 4', spaceId: SEED.baseSpaceId, unitId: SEED.baseWebId, num: 4, peek: ['rev 4', '9'] },
    ]);
  });

  test('no need when the upstream value equals this value', () => {
    const view = explain(pending(), { incomingUpgrade: { value: '7', revisionNum: 4 } });
    expect(view.needs.some((n) => n.kind === 'upgrade')).toBe(false);
  });
});

test.describe('edge states', () => {
  const withField = (field: Partial<BlameField>): UnitPathReport => {
    const report = plain();
    report.Field = { ...report.Field, ...field };
    return report;
  };

  test('absent', () => {
    expect(explain(withField({ Absent: true })).state).toBe('absent');
  });

  test('deleted', () => {
    expect(explain(withField({ Deleted: true })).state).toBe('deleted');
  });

  test('resource row (empty Path)', () => {
    expect(explain(withField({ Path: '' })).state).toBe('resource');
  });

  test('loading, and error wins over loading', () => {
    expect(explain(plain(), { loading: true }).state).toBe('loading');
    expect(explain(plain(), { loading: true, error: new Error('x') }).state).toBe('error');
  });

  test('stale is passed through, never blank', () => {
    const view = explain(plain(), { stale: true });
    expect(view.stale).toBe(true);
    expect(view.value).toBe('7');
  });

  test('a Validation entry with no Issues and no Path still makes one need', () => {
    const view = explain(withField({ Validation: [{ Gate: 'fd-prod/policy/vet' }] }));
    expect(view.needs).toHaveLength(1);
    expect(view.needs[0]?.text).toBe('Gate policy fails');
  });

  test('no When gives the time token —', () => {
    const report = plain();
    const origin = report.Changes?.[0]?.Origin;
    if (origin) delete origin.When;
    expect(explain(report).setBy?.when).toBe('—');
  });

  test('no recorded change gives no set-by', () => {
    const report = plain();
    report.Changes = [];
    expect(explain(report).setBy).toBeUndefined();
  });

  test('no user is "automation"', () => {
    const report = plain();
    const origin = report.Changes?.[0]?.Origin;
    if (origin) delete origin.User;
    expect(explain(report).setBy?.who).toBe('automation');
  });
});

test.describe('history and used by', () => {
  test('history rows come only from the report History, current marked', () => {
    const report = override();
    report.History = [
      { Value: '5\n', Origin: { User: 'admin@local.confighub.dev', When: report.Changes?.[0]?.Origin?.When, RevisionNum: 3 } },
      { Value: '3\n', Origin: { User: 'bob@example.com', When: report.Changes?.[0]?.Origin?.When, RevisionNum: 2 } },
    ];
    const view = explain(report);
    expect(view.history.map((h) => [h.value, h.who, h.current, h.revisionNum])).toEqual([
      ['5', 'admin', true, 3],
      ['3', 'bob', false, 2],
    ]);
    expect(explain(override()).history).toEqual([]);
  });

  test('each history row links its revision and names the function or Link that set it', () => {
    const report = override();
    const when = report.Changes?.[0]?.Origin?.When;
    report.History = [
      {
        Value: '8\n',
        Origin: {
          SpaceID: SEED.prodSpaceId,
          UnitID: SEED.prodWebId,
          RevisionNum: 9,
          User: 'admin@local.confighub.dev',
          When: when,
          Description: 'Prod runs 8 for Black Friday| Functions: set-replicas',
          Function: 'set-replicas',
          SetBy: 'set-replicas',
        },
      },
      { Value: 'ns\n', Origin: { RevisionNum: 6, Link: 'web-to-ns', Source: 'NeedsProvides', SetBy: 'link web-to-ns' } },
      { Value: '3\n', Origin: { RevisionNum: 2, SetBy: 'merge from fd-staging/web', Source: 'CloneUnit' } },
    ];
    const [byFunction, byLink, byMerge] = explain(report).history;
    expect(byFunction?.revision).toMatchObject({ kind: 'revision', label: 'rev 9', spaceId: SEED.prodSpaceId, unitId: SEED.prodWebId, num: 9 });
    expect(byFunction?.revision?.peek?.[0]).toBe('rev 9');
    expect(byFunction?.revision?.peek?.[2]).toBe('Prod runs 8 for Black Friday');
    expect(byFunction?.reason).toBe('Prod runs 8 for Black Friday');
    // The reason says why; the function's name would only repeat it (team-lead, History polish).
    expect(byFunction?.setBy).toBeUndefined();
    expect(byLink?.setBy).toBe('Link web-to-ns');
    expect(byMerge?.setBy).toBeUndefined(); // a merge or a clone is not a reason of its own
  });

  test('history is newest first, whatever order the server sends', () => {
    const report = override();
    report.History = [2, 12, 3, 9].map((n) => ({ Value: `${n}\n`, Origin: { RevisionNum: n } }));
    expect(explain(report).history.map((h) => h.revisionNum)).toEqual([12, 9, 3, 2]);
  });

  test('a row names its function only when it has no reason', () => {
    const report = override();
    report.History = [
      { Value: '8\n', Origin: { RevisionNum: 9, Description: 'Black Friday', Function: 'set-replicas' } },
      { Value: '5\n', Origin: { RevisionNum: 3, Function: 'set-replicas' } },
    ];
    expect(explain(report).history.map((h) => [h.revisionNum, h.setBy])).toEqual([
      [9, undefined],
      [3, 'set-replicas'],
    ]);
  });

  test('used by lists the provided attributes', () => {
    const view = explain(
      (() => {
        const report = plain();
        report.Field = { ...report.Field, Provided: [{ AttributeName: 'resource-name', ResourceType: 'v1/Namespace' }] };
        return report;
      })(),
    );
    expect(view.provided).toEqual([{ attribute: 'resource-name', resourceType: 'v1/Namespace' }]);
  });
});

test.describe('shortAgo', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  for (const [iso, want] of [
    ['2026-11-19T11:59:30Z', 'just now'],
    ['2026-11-19T11:53:00Z', '7m ago'],
    ['2026-11-19T10:00:00Z', '2h ago'],
    ['2026-11-16T12:00:00Z', '3d ago'],
    [undefined, '—'],
    ['not a date', '—'],
    ['2026-11-19T12:05:00Z', 'just now'],
  ] as const) {
    test(`${iso} -> ${want}`, () => {
      expect(shortAgo(iso, now)).toBe(want);
    });
  }
});
