// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The View explorer's row panel of a Unit, without a browser: the class of a
 * row, the conflict split, the verdict's headline, primary action, causes and
 * other actions, the group counts, the next Unit that needs attention, and
 * the panel's keys.
 */
import { expect, test } from '@playwright/test';

import type { ExtendedRevisionRead, ExtendedUnitRead } from '@confighub/rtk-query';

import { buildGroupTree, type GroupLevel } from '../src/pages/x/view-explorer/model/grouping';
import type { StatusKind } from '../src/pages/x/view-explorer/model/types';
import {
  CHECKING_GATE,
  attentionOf,
  failingGates,
  isChecking,
  isServerDescription,
  needsAttention,
  rowClass,
  type RowClass,
  rowFacts,
  type RowFacts,
  unreleasedCount,
} from '../src/pages/x/view-explorer/unit-panel/attention';
import { conflictClass, splitConflicts } from '../src/pages/x/view-explorer/unit-panel/conflicts';
import { CAUSE, count, DETAIL, FACT, GROUP, relativeTime, revRange } from '../src/pages/x/view-explorer/unit-panel/copy';
import { detailsFromUnit, gateDetail, releaseLive, revisionAuthor } from '../src/pages/x/view-explorer/unit-panel/details';
import {
  countStatuses,
  type GroupSummary,
  groupLabel,
  groupName,
  nextProblemIndex,
  summarizeGroup,
} from '../src/pages/x/view-explorer/unit-panel/group-context';
import { componentsHref, panelLinks } from '../src/pages/x/view-explorer/unit-panel/links';
import { type PanelKeyEvent, panelKeyAction } from '../src/pages/x/view-explorer/unit-panel/keys';
import type { GateCheck } from '../src/pages/x/view-explorer/unit-panel/gate-check';
import { panelResourceLabel } from '../src/pages/x/view-explorer/unit-panel/view/diff-layout';
import { isStalePreview, previewEntry, upgradeBlock, upgradePreviewArgs, upgradePreviewRequest } from '../src/pages/x/view-explorer/unit-panel/upgrade-preview';
import { buildVerdict, type FetchedDetails, type VerdictContext, type VerdictInput } from '../src/pages/x/view-explorer/unit-panel/verdict';

const NOW = Date.parse('2026-10-25T12:00:00Z');

/** A healthy Unit: targeted, released at its head, no upstream, no gate. */
function row(overrides: Partial<RowFacts> = {}): RowFacts {
  return {
    slug: 'checkout-web',
    unitId: 'u1',
    spaceId: 's1',
    spaceSlug: 'payments-prod',
    targetId: 't1',
    targetSlug: 'prod-us-east-1',
    head: 9,
    released: 9,
    gateNames: [],
    checking: false,
    upstreamRev: 0,
    ...overrides,
  };
}

const READY: FetchedDetails = { status: 'ready' };
const CONTEXT: VerdictContext = { nextProblem: null, selectionEnabled: true, pickedCount: 0, isPicked: false, now: NOW };

function verdict(r: Partial<RowFacts> = {}, fetched: FetchedDetails = READY, context: Partial<VerdictContext> = {}) {
  const input: VerdictInput = { row: row(r), fetched, context: { ...CONTEXT, ...context } };
  return buildVerdict(input);
}

const GATED = { gateNames: ['ps/vet-replicas/vet-celexpr'], head: 43, released: 41 };
const UNRELEASED = { head: 43, released: 41 };
const UPGRADABLE = { upstreamRev: 38, upstreamHead: 47, upstreamSlug: 'checkout-web', upstreamSpaceSlug: 'payments-staging' };
const SPACE_OK = { releaseTargetId: 't1', componentId: 'c1', componentSlug: 'payments' };

function unit(fields: Partial<NonNullable<ExtendedUnitRead['Unit']>>, upstreamHead?: number): ExtendedUnitRead {
  return {
    Unit: { UnitID: 'u', Slug: 'x', SpaceID: 's', TargetID: 't', HeadRevisionNum: 3, LastReleasedRevisionNum: 3, ...fields },
    UpstreamUnit: upstreamHead === undefined ? undefined : { HeadRevisionNum: upstreamHead },
  } as ExtendedUnitRead;
}

test.describe('the class of a Unit row', () => {
  test('a failing gate wins over every other state, so a Unit counts once', () => {
    expect(attentionOf(unit({ ValidationErrors: { 'a/b/vet': true }, TargetID: undefined }))).toBe('gated');
    expect(attentionOf(unit({ ValidationErrors: { 'a/b/vet': true }, HeadRevisionNum: 5 }))).toBe('gated');
    expect(attentionOf(unit({ TargetID: undefined, HeadRevisionNum: 5 }))).toBe('untargeted');
    expect(attentionOf(unit({ HeadRevisionNum: 5, UpstreamRevisionNum: 1 }, 4))).toBe('unreleased');
    expect(attentionOf(unit({ UpstreamRevisionNum: 1 }, 4))).toBe('upgradable');
    expect(attentionOf(unit({}))).toBe('released');
  });

  test('the same order as the headline: a clone with no Target whose upstream is ahead needs attention', () => {
    const clone = unit({ TargetID: undefined, UpstreamRevisionNum: 1 }, 4);
    expect(attentionOf(clone)).toBe('upgradable');
    expect(needsAttention(clone)).toBe(true);
    expect(verdict(rowFacts(clone)).headline).toBe('Upgrade available: upstream is at rev 4');
    // The table says "Not targeted"; the group counts it there, and as needing attention.
    expect(rowClass(clone)).toEqual({ status: 'untargeted', gated: false, needs: true });
    const gatedClone = unit({ TargetID: undefined, ValidationErrors: { 'a/b/vet': true } });
    expect(rowClass(gatedClone)).toEqual({ status: 'untargeted', gated: true, needs: true });
    expect(rowClass(unit({ TargetID: undefined }))).toEqual({ status: 'untargeted', gated: false, needs: false });
  });

  test('the gates pseudo-gate means "being checked", never "fails"', () => {
    const checking = { [CHECKING_GATE]: true };
    expect(failingGates(checking)).toEqual([]);
    expect(isChecking(checking)).toBe(true);
    expect(attentionOf(unit({ ValidationErrors: checking }))).toBe('released');
    expect(failingGates({ [CHECKING_GATE]: true, 'z/t/vet': true, 'a/t/vet': true })).toEqual(['a/t/vet', 'z/t/vet']);
    expect(failingGates(undefined)).toEqual([]);
  });

  test('a Unit with no Target has no unreleased revisions and does not need attention', () => {
    const untargeted = unit({ TargetID: undefined, HeadRevisionNum: 7, LastReleasedRevisionNum: 0 });
    expect(unreleasedCount(untargeted)).toBe(0);
    expect(needsAttention(untargeted)).toBe(false);
    expect(rowFacts(untargeted).targetId).toBeUndefined();
    expect(needsAttention(unit({ HeadRevisionNum: 5 }))).toBe(true);
    expect(needsAttention(unit({}))).toBe(false);
  });
});

test.describe('conflicts', () => {
  test('a local override is kept; anything else, or an unknown reason, waits for a decision', () => {
    expect(conflictClass({ Reason: 'ProtectedPath' })).toBe('kept');
    expect(conflictClass({ Reason: 'Subtracted' })).toBe('kept');
    for (const reason of ['Guarded', 'GuardWithheld', 'DeleteShadowed', 'UnresolvedPath', 'SomethingNew', undefined])
      expect(conflictClass({ Reason: reason })).toBe('withheld');
    const split = splitConflicts([{ Reason: 'Subtracted', Path: 'a' }, { Reason: 'Guarded', Path: 'b' }]);
    expect(split.kept.map((c) => c.Path)).toEqual(['a']);
    expect(split.withheld.map((c) => c.Path)).toEqual(['b']);
  });

  test('kept conflicts are a fact, never a cause', () => {
    const v = verdict({}, { status: 'ready', conflicts: [{ Reason: 'ProtectedPath', Path: 'spec.replicas' }] });
    expect(v.causes).toEqual([]);
    expect(v.facts.map((f) => f.kind)).toEqual(['kept']);
    expect(v.headline).toBe('Nothing to do: rev 9 is released');
  });
});

test.describe('the headline, first rule that matches', () => {
  test('while the details load, a row that looks healthy says "Checking…", never "Nothing to do"', () => {
    const v = verdict({}, { status: 'loading' });
    expect(v.headline).toBe('Checking…');
    expect(v.tone).toBe('muted');
    expect(v.provisional).toBe(true);
  });

  test('while the details load, what the row already shows stays', () => {
    expect(verdict(GATED, { status: 'loading' }).headline).toBe('Blocked: rev 43 cannot release');
  });

  test('withheld conflicts', () => {
    const v = verdict(GATED, { status: 'ready', conflicts: [{ Reason: 'Guarded' }, { Reason: 'UnresolvedPath' }] });
    expect(v.headline).toBe('Needs a decision: 2 changes were not applied');
    expect(v.tone).toBe('blocked');
    expect(verdict({}, { status: 'ready', conflicts: [{ Reason: 'Guarded' }] }).headline).toBe('Needs a decision: 1 change was not applied');
  });

  test('a failed last action on the head revision', () => {
    const v = verdict({}, { status: 'ready', event: { status: 'Failed', revisionNum: 9, action: 'InvokeFunctions', message: 'boom' } });
    expect(v.headline).toBe('Last action failed on rev 9');
    expect(v.causes[0].kind).toBe('failed');
    // The message is said once, as the verdict's detail; the line says what failed, and the primary where to look.
    expect(v.detail).toBe('boom');
    expect(v.causes[0].title).toBe('InvokeFunctions failed on rev 9');
    expect(v.causes[0].detail).toBeUndefined();
    expect(v.causes[0].fix).toBeUndefined();
    expect(v.primary?.id).toBe('see-events');
    const at = verdict({}, { status: 'ready', event: { status: 'Failed', revisionNum: 9, action: 'Apply', at: '2026-10-25T11:55:00Z' } });
    expect(at.causes[0].title).toBe('Apply failed on rev 9 · 5 min ago');
    expect(at.detail).toBe('It left no message.');
    expect(verdict({}, { status: 'ready', event: { status: 'Failed' } }).headline).toBe('Last action failed on rev 9');
  });

  test('a failed event on an older revision is a fact only', () => {
    const v = verdict({}, { status: 'ready', event: { status: 'Failed', revisionNum: 4 } });
    expect(v.causes).toEqual([]);
    expect(v.facts.map((f) => f.kind)).toEqual(['failed-earlier']);
    expect(v.headline).toBe('Nothing to do: rev 9 is released');
  });

  test('a gate fails, blocking a release when revisions wait', () => {
    const v = verdict(GATED);
    expect(v.headline).toBe('Blocked: rev 43 cannot release');
    // The design system's gated amber, not red: its words tell it from Unreleased.
    expect(v.tone).toBe('gated');
    expect(v.causes.find((c) => c.kind === 'gate')?.tone).toBe('gated');
    expect(v.detail).toBe('1 gate fails. When it passes, 2 revisions are ready to release.');
    expect(v.section).toBe('Why it is not released');
    const released = verdict({ gateNames: ['a', 'b'] });
    expect(released.headline).toBe('2 gates fail on rev 9');
    expect(released.detail).toBe('2 gates fail.');
    expect(released.section).toBe('What needs a fix');
    expect(verdict({ gateNames: ['a'] }).headline).toBe('A gate fails on rev 9');
    expect(verdict({ gateNames: ['a', 'b'], head: 10 }).detail).toBe('2 gates fail. When they pass, 1 revision is ready to release.');
  });

  test('gates being checked', () => {
    const v = verdict({ checking: true });
    expect(v.headline).toBe('Checking gates on rev 9');
    expect(v.tone).toBe('info');
  });

  test('needs that are not met', () => {
    const v = verdict({}, { status: 'ready', linkFindings: [{ Reason: 'NeededNotFound', Path: 'spec.x' }] });
    expect(v.headline).toBe('Needs from upstream are not met');
    expect(v.tone).toBe('attention');
  });

  test('unreleased revisions', () => {
    const v = verdict(UNRELEASED);
    expect(v.headline).toBe('Ready to release: rev 43 is not released');
    expect(v.detail).toBe('No gate fails. Revisions 42–43 are not released yet.');
    expect(v.tone).toBe('attention');
  });

  test('an upstream that is ahead', () => {
    const v = verdict(UPGRADABLE);
    expect(v.headline).toBe('Upgrade available: upstream is at rev 47');
    expect(v.tone).toBe('upgrade');
    expect(v.detail).toBe('No gate fails. This Unit merged rev 38; upstream is 9 revisions ahead.');
  });

  test('no Target and nothing else', () => {
    const v = verdict({ targetId: undefined, released: 0 });
    expect(v.headline).toBe('Not targeted: no Release includes this Unit');
    expect(v.causes).toEqual([]);
  });

  test('healthy, with its upstream and last change', () => {
    const v = verdict({
      upstreamRev: 5,
      upstreamHead: 5,
      upstreamSlug: 'ledger-db',
      upstreamSpaceSlug: 'payments-base',
      lastChange: { description: 'Bump storage', at: '2026-10-23T11:00:00Z' },
    });
    expect(v.headline).toBe('Nothing to do: rev 9 is released');
    expect(v.tone).toBe('ok');
    expect(v.section).toBe('Status');
    expect(v.detail).toBe('No gate fails. It matches upstream payments-base/ledger-db rev 5. Last change 2 days ago: "Bump storage".');
    expect(v.revs).toEqual({ head: 9, released: 9, targeted: true });
  });

  test('a change described only by its kind is not quoted, and is drawn quieter', () => {
    const facts = rowFacts(unit({ HeadRevisionNum: 4, LastReleasedRevisionNum: 3, LastChangeDescription: 'UpdateUnit', UpdatedAt: '2026-10-25T11:59:40Z' }));
    expect(facts.lastChange).toEqual({ source: 'UpdateUnit', at: '2026-10-25T11:59:40Z' });
    const cause = verdict(facts).causes.find((c) => c.kind === 'unreleased');
    expect(cause?.detail).toBe('last change just now (UpdateUnit)');
    expect(cause?.detailMuted).toBe(true);
    expect(DETAIL.lastChange('2 days ago', undefined, 'a.chen', 'UpdateUnit')).toBe('Last change 2 days ago by a.chen (UpdateUnit).');
    const described = rowFacts(unit({ LastChangeDescription: 'Bump storage', UpdatedAt: '2026-10-25T11:59:40Z' }));
    expect(described.lastChange).toEqual({ description: 'Bump storage', at: '2026-10-25T11:59:40Z' });
    expect(verdict({ ...described, head: 4, released: 3 }).causes.find((c) => c.kind === 'unreleased')?.detailMuted).toBe(false);
  });

  test('a description the server wrote itself is not quoted either, whatever its form', () => {
    for (const d of [
      'No Data',
      'Self-Resolve',
      'Self-Resolve and invoked triggers: vet-x',
      'MergeExternal; from helm:charts/web',
      'UpdateUnit; from oci://registry/app',
      'Cloned from 1b2c/web',
      'Refreshed from Target',
      'Set path protection',
      'Applied 2 withheld merge changes',
      'Dismissed 1 merge conflict',
      'Transformed from revision 4 of unit ps/web',
      'Insert',
      'Upsert',
      'TransformPaths',
    ])
      expect(isServerDescription(d), d).toBe(true);
    for (const d of ['Bump storage', 'Fix; from review', 'No Data please', 'cloned from prod by hand']) expect(isServerDescription(d), d).toBe(false);
    const facts = rowFacts(unit({ HeadRevisionNum: 4, LastReleasedRevisionNum: 3, LastChangeDescription: 'Cloned from 1b2c/web', UpdatedAt: '2026-10-25T11:59:40Z' }));
    expect(facts.lastChange).toEqual({ source: 'Cloned from 1b2c/web', at: '2026-10-25T11:59:40Z' });
    const cause = verdict(facts).causes.find((c) => c.kind === 'unreleased');
    expect(cause?.detail).toBe('last change just now (Cloned from 1b2c/web)');
    expect(cause?.detail).not.toContain('"');
    expect(cause?.detailMuted).toBe(true);
    expect(verdict(rowFacts(unit({ LastChangeDescription: 'No Data', UpdatedAt: '2026-10-25T11:59:40Z' }))).detail).toBe('No gate fails. Last change just now (No Data).');
  });

  test('healthy, but the details could not be read', () => {
    const v = verdict({}, { status: 'error' });
    expect(v.headline).toBe('Could not confirm: details did not load');
    expect(v.headline).not.toContain('Nothing to do');
  });
});

test.describe('the causes', () => {
  test('come in a fixed order, and kept conflicts and warnings are never among them', () => {
    const v = verdict(
      { ...GATED, ...UPGRADABLE, checking: true, lastChange: { description: 'Pin image tag', at: '2026-10-25T11:42:00Z' } },
      {
        status: 'ready',
        conflicts: [{ Reason: 'Guarded' }, { Reason: 'Subtracted' }],
        event: { status: 'Failed', revisionNum: 43 },
        linkFindings: [{ Reason: 'ResolveFailed' }],
        warnings: ['w'],
      },
    );
    expect(v.causes.map((c) => c.kind)).toEqual(['conflicts', 'failed', 'gate', 'checking', 'needs', 'unreleased', 'upstream']);
    expect(v.facts.map((f) => f.kind)).toEqual(['kept', 'warnings']);
    const unreleased = v.causes.find((c) => c.kind === 'unreleased');
    expect(unreleased?.title).toBe('2 unreleased revisions, 42–43');
    expect(unreleased?.detail).toBe('last: "Pin image tag", 18 min ago');
    expect(v.causes.find((c) => c.kind === 'upstream')?.detail).toBe('payments-staging/checkout-web');
  });

  test('one line per failing gate, with a fix that names it; Check again only with its Trigger', () => {
    const v = verdict({ gateNames: ['payments-prod/t1/vet', 'shared/t2/vet'] }, { status: 'ready', triggerIds: { 'payments-prod/t1/vet': 'tr1' } });
    const gates = v.causes.filter((c) => c.kind === 'gate');
    // A Trigger of the Unit's own Space is named without the Space.
    expect(gates.map((g) => g.subject)).toEqual(['vet', 'vet']);
    expect(gates.map((g) => g.subjectContext)).toEqual(['t1', 'shared/t2']);
    expect(gates[0].fix).toEqual({ action: 'check-gate', label: 'Check again', name: 'Check again, gate t1/vet', arg: 'payments-prod/t1/vet' });
    expect(gates[1].fix?.action).toBe('edit-config');
  });
});

test('See diff is on the unreleased line only with a released revision to compare with', () => {
  expect(verdict(UNRELEASED).causes.find((c) => c.kind === 'unreleased')?.fix).toMatchObject({ action: 'see-diff', label: 'See diff' });
  expect(verdict({ head: 3, released: 0 }).causes.find((c) => c.kind === 'unreleased')?.fix).toBeUndefined();
});

test.describe('the Release the Space runs', () => {
  const LIVE = { num: 18, status: 'Synced · Healthy', tone: 'ok' as const, reporter: 'argo-cd', observedAt: '2026-10-25T11:58:00Z' };

  test('is a fact, said to be the Release\'s, with when it was reported', () => {
    const v = verdict({}, { status: 'ready', release: LIVE });
    expect(v.causes).toEqual([]);
    expect(v.facts).toEqual([
      {
        key: 'release',
        kind: 'release',
        tone: 'ok',
        title: 'Release 18 of payments-prod: Synced · Healthy',
        detail: 'reported by argo-cd for the Release, not for this Unit',
        meta: '2 min ago',
      },
    ]);
    expect(verdict({}, { status: 'ready', release: { ...LIVE, reporter: undefined } }).facts[0].detail).toBe('reported for the Release, not for this Unit');
  });

  test('comes from the running Release only when its tool reported on it, in the table\'s tones', () => {
    expect(releaseLive(undefined)).toBeUndefined();
    expect(releaseLive({ releaseNum: 3, liveStatus: null })).toBeUndefined();
    expect(releaseLive({ releaseNum: 3, liveStatus: { Sync: 'Synced', Health: 'Healthy', Reporter: 'argobot', ObservedAt: 't' } })).toEqual({
      num: 3,
      status: 'Synced · Healthy',
      tone: 'ok',
      reporter: 'argobot',
      observedAt: 't',
    });
    expect(releaseLive({ releaseNum: 3, liveStatus: { Sync: 'Synced', Health: 'Degraded' } })?.tone).toBe('blocked');
    expect(releaseLive({ releaseNum: 3, liveStatus: { Sync: 'OutOfSync', Health: 'Healthy' } })?.tone).toBe('attention');
    expect(releaseLive({ releaseNum: 3, liveStatus: { Operation: 'Running' } })?.tone).toBe('info');
    expect(releaseLive({ releaseNum: 3, liveStatus: { Message: 'nothing yet' } })?.tone).toBe('muted');
  });
});

test.describe('the read of the open Unit', () => {
  test('gives conflicts, the latest event, link findings, the failing path of each gate, and warnings', () => {
    const d = detailsFromUnit(
      {
        Unit: {
          Slug: 'u',
          Conflicts: [{ Reason: 'Guarded', Path: 'spec.replicas' }],
          LinkFindings: [{ Reason: 'NeededNotFound', Path: 'a.b' }],
          ValidationErrors: { 'ps/vet-replicas/vet-celexpr': true, 'awaiting/triggers': true },
          ValidationWarnings: { 'ps/warn-x/vet-x': true, 'ps/off/vet-y': false },
          ValidationResults: {
            'ps/vet-replicas/vet-celexpr': [
              { Index: 0, Passed: true },
              { Index: 1, Passed: false, FailedAttributes: [{ Path: 'spec.replicas', Issues: [{ Message: 'replicas must be at least 3' }] }] },
            ],
            'ps/warn-x/vet-x': [{ Index: 0, Passed: false, Details: ['ignored: a warning is not a gate'] }],
          },
        },
        LatestUnitEvent: { Status: 'Failed', Action: 'InvokeFunctions', RevisionNum: 4, Message: 'boom' },
      } as ExtendedUnitRead,
      'ps',
    );
    expect(d.conflicts).toEqual([{ Reason: 'Guarded', Path: 'spec.replicas' }]);
    expect(d.linkFindings).toEqual([{ Reason: 'NeededNotFound', Path: 'a.b' }]);
    expect(d.event).toEqual({ status: 'Failed', action: 'InvokeFunctions', revisionNum: 4, message: 'boom' });
    expect(d.gateDetails).toEqual({ 'ps/vet-replicas/vet-celexpr': { path: 'spec.replicas', message: 'replicas must be at least 3' } });
    expect(d.warnings).toEqual(['warn-x/vet-x']);
    expect(d.triggerIds).toEqual({});
    const withTrigger = detailsFromUnit({ Unit: { ValidationTriggerIDs: { 'ps/vet-replicas/vet-celexpr': 'tr1' } } } as ExtendedUnitRead, 'ps');
    expect(withTrigger.triggerIds).toEqual({ 'ps/vet-replicas/vet-celexpr': 'tr1' });
  });

  test('a gate\'s message falls back from its path to the result, then to its details', () => {
    expect(gateDetail([{ Index: 0, Passed: false, Issues: [{ Message: 'm' }] }])).toEqual({ path: undefined, message: 'm' });
    expect(gateDetail([{ Index: 0, Passed: false, Details: ['', 'd'] }])).toEqual({ path: undefined, message: 'd' });
    expect(gateDetail([{ Index: 0, Passed: true }])).toBeUndefined();
    expect(gateDetail(undefined)).toBeUndefined();
  });

  test('an event with no revision names none, and the author is the revision\'s user', () => {
    expect(detailsFromUnit({ LatestUnitEvent: { Status: 'Completed', RevisionNum: 0 } } as ExtendedUnitRead, '').event).toEqual({
      status: 'Completed',
      action: undefined,
      revisionNum: undefined,
      message: undefined,
    });
    expect(detailsFromUnit({} as ExtendedUnitRead, '').event).toBeUndefined();
    expect(revisionAuthor({ User: { DisplayName: 'Priya N', Username: 'priya.n' } } as ExtendedRevisionRead)).toBe('Priya N');
    expect(revisionAuthor({ User: { Username: 'priya.n' } } as ExtendedRevisionRead)).toBe('priya.n');
    expect(revisionAuthor(undefined)).toBeUndefined();
  });
});

test.describe('where the link actions go', () => {
  const search = 'view=v1&t=2';
  const back = `explorer=${encodeURIComponent(search)}`;

  test('the Unit page tabs, each with the way back to this explorer tab', () => {
    const links = panelLinks(row({ spaceId: 's1', unitId: 'u1' }), undefined, search);
    expect(links).toEqual({
      'review-conflicts': `/units/s1/u1?tab=2&${back}`,
      'see-events': `/units/s1/u1?tab=0&${back}`,
      'edit-config': `/units/s1/u1?tab=1&${back}`,
      'open-links': `/units/s1/u1?tab=3&${back}`,
      'restore-history': `/units/s1/u1?tab=2&${back}`,
    });
    // The Components view does not read the way back, so its link does not carry it.
    expect(panelLinks(row(), 'payments', search)['release-space']).toBe('/components?app=payments&space=s1');
    expect(panelLinks(row({ spaceId: '', unitId: 'u1' }), 'c', search)).toEqual({});
  });

  test('Release opens the Space on the Components view, once the Component\'s slug is known', () => {
    expect(componentsHref('pay ments', 's1')).toBe('/components?app=pay%20ments&space=s1');
    expect(panelLinks(row(), 'payments', search)['release-space']).not.toContain('explorer=');
  });
});

test.describe('the primary action, first rule that matches', () => {
  test('disabled "Checking…" while the details load, whatever the row shows', () => {
    expect(verdict(GATED, { status: 'loading' }).primary).toEqual({ id: null, label: 'Checking…', why: "Reading the Unit's details.", enabled: false });
    // A healthy row's way on waits too: the read may find a cause first.
    expect(verdict({}, { status: 'loading' }, { nextProblem: { id: 'u2', slug: 'ledger-api' } }).primary).toMatchObject({ id: null, enabled: false });
  });

  test('disabled after a read that failed, too, and nothing for a Unit that is gone', () => {
    expect(verdict(UNRELEASED, { status: 'error', space: SPACE_OK }).primary).toEqual({
      id: null,
      label: 'Unavailable',
      why: "The Unit's details could not be read, so the next step is not known.",
      enabled: false,
    });
    expect(verdict({}, { status: 'error' }, { nextProblem: { id: 'u2', slug: 'ledger-api' } }).primary?.enabled).toBe(false);
    expect(verdict(UNRELEASED, { status: 'error', gone: true }).primary).toBeNull();
  });

  test('Review conflicts', () => {
    expect(verdict(GATED, { status: 'ready', conflicts: [{ Reason: 'Guarded' }] }).primary?.id).toBe('review-conflicts');
  });

  test('See events, with Restore the first other action', () => {
    const v = verdict(UNRELEASED, { status: 'ready', event: { status: 'Failed', revisionNum: 43 } });
    expect(v.primary?.id).toBe('see-events');
    expect(v.secondary[0].id).toBe('restore');
  });

  test('Check again, when a failing gate has its Trigger', () => {
    const v = verdict(GATED, { status: 'ready', triggerIds: { [GATED.gateNames[0]]: 'tr' } });
    expect(v.primary).toMatchObject({ id: 'check-gate', label: 'Check again', why: 'The gate is the first blocker.', enabled: true });
    const two = verdict({ ...GATED, gateNames: ['ps/a/vet', 'ps/b/vet'] }, { status: 'ready', triggerIds: { 'ps/a/vet': 'tr1', 'ps/b/vet': 'tr2' } });
    expect(two.primary?.label).toBe('Check again');
    expect(two.primary?.why).toBe('The gates are the first blockers.');
  });

  test('Check again is off while its check runs, and the gate line shows each result in place of its link', () => {
    const fetched: FetchedDetails = { status: 'ready', triggerIds: { [GATED.gateNames[0]]: 'tr' } };
    const gate = GATED.gateNames[0];
    const running = buildVerdict({ row: row(GATED), fetched, context: CONTEXT, checks: { [gate]: { state: 'running' } } });
    expect(running.primary).toMatchObject({ id: 'check-gate', label: 'Checking the gate…', enabled: false });
    expect(running.causes[0].check).toEqual({ state: 'running', text: 'Checking…' });
    expect(running.causes[0].fix).toBeUndefined();
    const line = (check: GateCheck) => buildVerdict({ row: row(GATED), fetched, context: CONTEXT, checks: { [gate]: check } }).causes[0];
    expect(line({ state: 'passed' }).check).toEqual({ state: 'passed', text: 'Passes now. The stored result stays until the Unit next changes.' });
    expect(line({ state: 'failed', message: 'replicas must be at least 3' }).check?.text).toBe('Still fails: replicas must be at least 3');
    expect(line({ state: 'error', message: 'forbidden' }).check?.text).toBe('Could not check: forbidden');
    // The reason the line already gives is not said twice.
    const withDetail = buildVerdict({
      row: row(GATED),
      fetched: { ...fetched, gateDetails: { [gate]: { message: 'replicas must be at least 3' } } },
      context: CONTEXT,
      checks: { [gate]: { state: 'failed', message: 'replicas must be at least 3' } },
    }).causes[0];
    expect(withDetail.detail).toBe('replicas must be at least 3');
    expect(withDetail.check?.text).toBe('Still fails');
    // A check that ended gives the link back, for the gate it names.
    expect(line({ state: 'failed' }).fix).toMatchObject({ action: 'check-gate', arg: gate });
    // Display only: a pass does not clear the gate, so the verdict still names it.
    expect(buildVerdict({ row: row(GATED), fetched, context: CONTEXT, checks: { [gate]: { state: 'passed' } } }).headline).toBe('Blocked: rev 43 cannot release');
  });

  test('Edit config, at the failing path when known', () => {
    expect(verdict(GATED).primary).toMatchObject({ id: 'edit-config', label: 'Edit config' });
    const v = verdict(GATED, { status: 'ready', gateDetails: { [GATED.gateNames[0]]: { path: 'spec.replicas', message: 'too few' } } });
    expect(v.primary?.label).toBe('Edit at spec.replicas');
    expect(v.causes[0].detail).toBe('too few');
    expect(v.secondary.map((a) => a.id)).not.toContain('edit-config');
  });

  test('Release the Space, only when it can release', () => {
    expect(verdict(UNRELEASED, { status: 'ready', space: SPACE_OK }).primary).toMatchObject({ id: 'release-space', label: 'Release payments-prod' });
    // With the reach known: how many Units the Release takes.
    expect(verdict(UNRELEASED, { status: 'ready', space: SPACE_OK }, { releaseReach: 3 }).primary?.label).toBe('Release payments-prod (3 Units)');
    expect(verdict(UNRELEASED, { status: 'ready', space: SPACE_OK }, { releaseReach: 1 }).primary?.label).toBe('Release payments-prod (1 Unit)');
    expect(verdict(UNRELEASED, { status: 'ready', space: { ...SPACE_OK, componentId: undefined } }).primary).toBeNull();
    expect(verdict(UNRELEASED).primary).toBeNull();
  });

  test('a Component that could not be read: Release says why, and the headline\'s cause has no primary', () => {
    const space = { releaseTargetId: 't1', componentId: 'c1', componentError: true };
    const v = verdict({ ...UNRELEASED, ...UPGRADABLE }, { status: 'ready', space });
    // The headline is about the revisions to release, so the upgrade stays among the other actions.
    expect(v.primary).toBeNull();
    expect(v.secondary.map((a) => a.id)).toContain('upgrade');
    expect(v.secondary.find((a) => a.id === 'release-space')).toMatchObject({ enabled: false, reason: 'could not read the Component for this Space' });
    expect(verdict(UNRELEASED, { status: 'ready', space }).primary).toBeNull();
  });

  test('the primary is the action of the first cause, whatever else the Unit has', () => {
    const TRIGGERS = { [GATED.gateNames[0]]: 'tr' };
    const NEEDS = [{ Reason: 'NeededNotFound' }];
    const FAILED = { status: 'Failed', revisionNum: 43 };
    const pairs: Array<[string, Partial<RowFacts>, FetchedDetails, string | null]> = [
      ['needs before unreleased', UNRELEASED, { status: 'ready', space: SPACE_OK, linkFindings: NEEDS }, 'open-links'],
      ['needs before an upgrade', UPGRADABLE, { status: 'ready', linkFindings: NEEDS }, 'open-links'],
      ['a gate before an upgrade', { ...GATED, ...UPGRADABLE }, { status: 'ready', triggerIds: TRIGGERS }, 'check-gate'],
      ['a gate before unreleased', GATED, { status: 'ready', space: SPACE_OK }, 'edit-config'],
      ['a failure before unreleased', UNRELEASED, { status: 'ready', space: SPACE_OK, event: FAILED }, 'see-events'],
      ['a failure before a gate', GATED, { status: 'ready', triggerIds: TRIGGERS, event: FAILED }, 'see-events'],
      ['conflicts before a failure', UNRELEASED, { status: 'ready', conflicts: [{ Reason: 'Guarded' }], event: FAILED }, 'review-conflicts'],
      ['unreleased before an upgrade', { ...UNRELEASED, ...UPGRADABLE }, { status: 'ready', space: SPACE_OK }, 'release-space'],
      ['gates being checked, before unreleased', { ...UNRELEASED, checking: true }, { status: 'ready', space: SPACE_OK }, null],
      ['gates being checked, before an upgrade', { ...UPGRADABLE, checking: true }, READY, null],
    ];
    for (const [name, r, fetched, id] of pairs) {
      const v = verdict(r, fetched);
      expect(v.causes[0].kind, name).toBeTruthy();
      expect(v.primary?.id ?? null, name).toBe(id);
    }
    // Needs first: the headline and the primary agree, and the other causes' actions stay listed.
    const needsFirst = verdict({ ...UNRELEASED, ...UPGRADABLE }, { status: 'ready', space: SPACE_OK, linkFindings: NEEDS });
    expect(needsFirst.headline).toBe('Needs from upstream are not met');
    expect(needsFirst.secondary.map((a) => a.id)).toEqual(expect.arrayContaining(['upgrade', 'release-space']));
  });

  test('Preview upgrade', () => {
    expect(verdict(UPGRADABLE).primary?.id).toBe('preview-upgrade');
  });

  test('Open Links', () => {
    expect(verdict({}, { status: 'ready', linkFindings: [{ Reason: 'NeededNotFound' }] }).primary?.id).toBe('open-links');
  });

  test('a healthy Unit goes to the next one that needs attention', () => {
    const v = verdict({}, READY, { nextProblem: { id: 'u2', slug: 'ledger-api' } });
    expect(v.primary).toMatchObject({ id: 'next-problem', label: 'Go to ledger-api', enabled: true });
    expect(verdict({ targetId: undefined }, READY, { nextProblem: { id: 'u2', slug: 'ledger-api' } }).primary?.id).toBe('next-problem');
  });

  test('nothing to do and nothing else needs attention', () => {
    expect(verdict().primary).toBeNull();
  });
});

test.describe('the other actions', () => {
  test('come in a fixed order after the actions of the causes', () => {
    const v = verdict({ ...GATED, ...UPGRADABLE }, { status: 'ready', space: SPACE_OK, triggerIds: { [GATED.gateNames[0]]: 'tr' } });
    expect(v.primary?.id).toBe('check-gate');
    expect(v.secondary.map((a) => a.id)).toEqual(['upgrade', 'run-function', 'edit-config', 'restore', 'release-space']);
    // Without a Trigger to check again, Edit config is the primary, and is not listed twice.
    const edit = verdict({ ...GATED, ...UPGRADABLE }, { status: 'ready', space: SPACE_OK });
    expect(edit.primary?.id).toBe('edit-config');
    expect(edit.secondary.map((a) => a.id)).toEqual(['upgrade', 'run-function', 'restore', 'release-space']);
  });

  test('Upgrade shows only with an upstream ahead', () => {
    expect(verdict().secondary.map((a) => a.id)).not.toContain('upgrade');
    expect(verdict(UPGRADABLE).secondary.find((a) => a.id === 'upgrade')).toMatchObject({ hint: '38 → 47 · preview first', key: 'u' });
  });

  test('Restore names the released revision when there is one to go back to, else opens the revisions', () => {
    expect(verdict(UNRELEASED).secondary.find((a) => a.key === 'r')).toMatchObject({
      id: 'restore',
      label: 'Restore rev 41',
      hint: 'The released revision; undoes 42–43',
    });
    expect(verdict().secondary.find((a) => a.key === 'r')).toMatchObject({ id: 'restore-history', label: 'Restore a revision…' });
    expect(verdict({ head: 3, released: 0 }).secondary.find((a) => a.key === 'r')?.id).toBe('restore-history');
  });

  test('Release shows only with unreleased revisions and a known Space, and says why it cannot run', () => {
    expect(verdict(UNRELEASED).secondary.map((a) => a.id)).not.toContain('release-space');
    expect(verdict({}, { status: 'ready', space: SPACE_OK }).secondary.map((a) => a.id)).not.toContain('release-space');
    const reason = (r: Partial<RowFacts>, space: FetchedDetails['space']) =>
      verdict(r, { status: 'ready', space }).secondary.find((a) => a.id === 'release-space');
    expect(reason(UNRELEASED, { componentId: 'c1' })).toMatchObject({ enabled: false, reason: 'this Space has no release Target' });
    expect(reason(UNRELEASED, { releaseTargetId: 't1' })).toMatchObject({ enabled: false, reason: 'this Space is not a Component' });
    expect(reason(UNRELEASED, { ...SPACE_OK, releaseTargetId: 't2' })).toMatchObject({ enabled: false, reason: "this Unit's Target is not the release Target" });
    expect(reason(GATED, SPACE_OK)).toMatchObject({ enabled: false, reason: 'blocked by the gate' });
    expect(reason(UNRELEASED, { ...SPACE_OK, componentSlug: undefined, componentError: true })).toMatchObject({
      enabled: false,
      reason: 'could not read the Component for this Space',
    });
  });

  test('Run a Function says what it runs on, and is off outside the Table layout', () => {
    const run = (context: Partial<VerdictContext>) => verdict({}, READY, context).secondary.find((a) => a.id === 'run-function');
    expect(run({})).toMatchObject({ enabled: true, hint: 'Opens the Functions panel for this Unit', key: 'f' });
    expect(run({ pickedCount: 2, isPicked: false })?.hint).toBe('Adds this Unit to the 2 picked, then opens Functions');
    expect(run({ pickedCount: 3, isPicked: true })?.hint).toBe('Opens the Functions panel for the 3 picked Units');
    expect(run({ selectionEnabled: false })).toMatchObject({ enabled: false, reason: 'Use the Table layout' });
    // A Unit a filter hides cannot be picked, so nothing promises to add it.
    const hidden = run({ hidden: true, pickedCount: 2 });
    expect(hidden).toMatchObject({ enabled: false, reason: 'Hidden by the filter', hint: 'Only a Unit the table shows can be picked' });
    expect(hidden?.hint).not.toContain('Adds');
  });
});

test.describe('copy', () => {
  test('plurals, ranges and relative times', () => {
    expect(count(1, 'gate')).toBe('1 gate');
    expect(count(2, 'gate')).toBe('2 gates');
    expect(revRange(43, 43)).toBe('43');
    expect(revRange(42, 43)).toBe('42–43');
    expect(CAUSE.unreleased(43, 43)).toBe('1 unreleased revision, 43');
    expect(FACT.warnings(1)).toBe('1 gate warning, which does not block');
    expect(FACT.warnings(2)).toBe('2 gate warnings, which do not block');
    expect(relativeTime('2026-10-25T11:59:40Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-25T09:00:00Z', NOW)).toBe('3 h ago');
    expect(relativeTime('2026-10-24T11:00:00Z', NOW)).toBe('1 day ago');
    expect(relativeTime('0001-01-01T00:00:00Z', NOW)).toBe('');
    expect(relativeTime(undefined, NOW)).toBe('');
  });
});

interface R {
  id: string;
  space: string;
  c: RowClass;
}

const SPACE_LEVEL: GroupLevel<R> = { field: 'Space', value: (r) => r.space };
/** A row by its table status, `+gate` when a gate blocks it, `*` when it needs attention otherwise. */
const rowsOf = (spec: Array<[string, string, string]>): R[] =>
  spec.map(([id, space, kind]) => {
    const status = kind.replace(/\+gate|\*/g, '') as StatusKind;
    const gated = kind.includes('+gate');
    return { id, space, c: { status, gated, needs: gated || kind.includes('*') || status === 'unreleased' || status === 'upgradable' } };
  });
const classOf = (r: R) => r.c;

test.describe('group context', () => {
  const rows = rowsOf([
    ['p1', 'prod', 'unreleased+gate'],
    ['p2', 'prod', 'unreleased'],
    ['p3', 'prod', 'released'],
    ['p4', 'prod', 'untargeted'],
    ['s1', 'staging', 'released'],
    ['s2', 'staging', 'upgradable'],
  ]);
  const tree = buildGroupTree(rows, [SPACE_LEVEL]);
  const label = (f: string) => (f === 'Labels.app' ? 'app' : f);

  test('counts the innermost group by the table\'s statuses, with the ones a gate blocks; untargeted Units do not need attention', () => {
    const g = summarizeGroup({ tree, shown: rows, row: rows[2], classOf, fieldLabel: label });
    expect(g).toEqual({
      key: 'Space=prod',
      label: 'In prod',
      total: 4,
      counts: {
        unreleased: { count: 2, gated: 1 },
        upgradable: { count: 0, gated: 0 },
        untargeted: { count: 1, gated: 0 },
        released: { count: 1, gated: 0 },
      },
      needing: 2,
    });
    expect(GROUP.gated(1)).toBe('(1 blocked by a gate)');
    expect(GROUP.needing(1, 5)).toBe('1 of 5 needs attention');
    expect(GROUP.needing(2, 5)).toBe('2 of 5 need attention');
  });

  test('a group is counted once per set of rows', () => {
    const cache = new Map<string, GroupSummary>();
    let calls = 0;
    const counting = (r: R) => {
      calls += 1;
      return r.c;
    };
    const first = summarizeGroup({ tree, shown: rows, row: rows[0], classOf: counting, fieldLabel: label, cache });
    const again = summarizeGroup({ tree, shown: rows, row: rows[3], classOf: counting, fieldLabel: label, cache });
    expect(again).toBe(first);
    expect(calls).toBe(4);
    summarizeGroup({ tree, shown: rows, row: rows[4], classOf: counting, fieldLabel: label, cache });
    expect(calls).toBe(6);
  });

  test('an ungrouped view counts every shown row, as "In this view"', () => {
    const g = summarizeGroup({ tree: [], shown: rows, row: rows[0], classOf, fieldLabel: label });
    expect(g?.label).toBe('In this view');
    expect(g?.total).toBe(6);
  });

  test('labels: a place reads "In <value>", another field "<label>: <value>", an empty group "Not set"', () => {
    expect(groupLabel({ field: 'Target', value: 'prod-us' }, label)).toBe('In prod-us');
    expect(groupLabel({ field: 'Labels.app', value: 'checkout' }, label)).toBe('app: checkout');
    expect(groupLabel({ field: 'Space', value: '(empty)' }, label)).toBe('Space: Not set');
    expect(groupLabel(undefined, label)).toBe('In this view');
    expect(groupName({ field: 'Space', value: 'prod' }, label)).toBe('prod');
    expect(groupName({ field: 'Labels.app', value: 'checkout' }, label)).toBe('app checkout');
  });

  test('countStatuses leaves no status out', () => {
    const none = { count: 0, gated: 0 };
    expect(countStatuses([], classOf)).toEqual({ counts: { unreleased: none, upgradable: none, untargeted: none, released: none }, needing: 0 });
  });

  test('the next problem: in table order, across groups, wrapping, never the row itself', () => {
    const needs = (r: R) => r.c.needs;
    expect(nextProblemIndex(rows, 1, 1, needs)).toBe(5);
    expect(nextProblemIndex(rows, 5, 1, needs)).toBe(0);
    expect(nextProblemIndex(rows, 0, -1, needs)).toBe(5);
    expect(nextProblemIndex(rows, 3, -1, needs)).toBe(1);
    // The row is not shown: the first (or last) that needs attention.
    expect(nextProblemIndex(rows, -1, 1, needs)).toBe(0);
    expect(nextProblemIndex(rows, -1, -1, needs)).toBe(5);
    const alone = rowsOf([['a', 'x', 'released+gate'], ['b', 'x', 'released']]);
    expect(nextProblemIndex(alone, 0, 1, needs)).toBeNull();
    expect(nextProblemIndex(alone, 1, 1, needs)).toBe(0);
    expect(nextProblemIndex([], 0, 1, needs)).toBeNull();
  });
});

test.describe('panel keys', () => {
  const key = (k: string, over: Partial<PanelKeyEvent> = {}) =>
    panelKeyAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, fromPanel: true, onContainer: false, textEntry: false, modalOpen: false, ...over });

  test('map rows, problems and actions', () => {
    expect(key('j')).toBe('next');
    expect(key('ArrowDown')).toBe('next');
    expect(key('k')).toBe('previous');
    expect(key('ArrowUp')).toBe('previous');
    expect(key('J', { shiftKey: true })).toBe('next-problem');
    expect(key('K', { shiftKey: true })).toBe('previous-problem');
    expect(key('u')).toBe('upgrade');
    expect(key('e')).toBe('edit-config');
    expect(key('r')).toBe('restore');
    expect(key('f')).toBe('run-function');
    expect(key('n')).toBeNull();
    expect(key('p')).toBeNull();
    expect(key('Escape')).toBeNull();
  });

  test('Shift is read from the event: Caps Lock does not turn j into ⇧J, and ⇧ with any other key is the browser\'s', () => {
    expect(key('J')).toBe('next');
    expect(key('K')).toBe('previous');
    expect(key('E')).toBe('edit-config');
    // The page's Functions toggle takes a lower-case f only, so the panel does too.
    expect(key('F')).toBeNull();
    expect(key('ArrowDown', { shiftKey: true })).toBeNull();
    expect(key('ArrowUp', { shiftKey: true })).toBeNull();
    expect(key('Enter', { shiftKey: true, onContainer: true })).toBeNull();
    expect(key('E', { shiftKey: true })).toBeNull();
    expect(key('F', { shiftKey: true })).toBeNull();
  });

  test('Enter runs the primary only from the panel itself', () => {
    expect(key('Enter', { onContainer: true })).toBe('primary');
    expect(key('Enter')).toBeNull();
  });

  test('nothing in a field, with a modifier, with a dialog open, or from a dialog portalled out of the panel', () => {
    expect(key('j', { textEntry: true })).toBeNull();
    expect(key('j', { metaKey: true })).toBeNull();
    expect(key('j', { ctrlKey: true })).toBeNull();
    expect(key('j', { altKey: true })).toBeNull();
    expect(key('j', { modalOpen: true })).toBeNull();
    expect(key('ArrowDown', { fromPanel: false })).toBeNull();
  });
});

test.describe('the upgrade preview', () => {
  const upgradable = row({ upstreamUnitId: 'up1', upstreamRev: 3, upstreamHead: 5, upstreamSlug: 'web', upstreamSpaceSlug: 'staging' });

  test('asks for the dry run over the Space and the upstream, keyed on the revisions', () => {
    const request = upgradePreviewRequest(upgradable);
    expect(request).toEqual({ spaceId: 's1', unitId: 'u1', slug: 'checkout-web', upstreamUnitId: 'up1', from: 3, to: 5, upstream: 'staging/web' });
    expect(upgradePreviewArgs(request!)).toEqual({ spaceIds: ['s1'], upstreamUnitIds: ['up1'], include: 'Diff', basis: 'u1:3:5' });
  });

  test('a Unit with nothing to upgrade, or no known upstream, has no preview', () => {
    expect(upgradePreviewRequest(row())).toBeNull();
    expect(upgradePreviewRequest({ ...upgradable, upstreamHead: 3 })).toBeNull();
    expect(upgradePreviewRequest({ ...upgradable, upstreamHead: undefined })).toBeNull();
    expect(upgradePreviewRequest({ ...upgradable, upstreamUnitId: undefined })).toBeNull();
  });

  test("picks this Unit's entry from an answer that covers its siblings", () => {
    const answer = [{ Unit: { UnitID: 'sibling' } }, { Unit: { UnitID: 'u1' }, Conflicts: [] }];
    expect(previewEntry(answer, 'u1')).toBe(answer[1]);
    expect(previewEntry(answer, 'other')).toBeUndefined();
    expect(previewEntry(undefined, 'u1')).toBeUndefined();
  });

  test('Upgrade… goes on only once the dry run answered for this Unit without an error, for the revisions it has now', () => {
    const ok = { stale: false, failed: false, answered: true, entry: {} };
    expect(upgradeBlock(ok)).toBeNull();
    expect(upgradeBlock({ ...ok, answered: false, entry: undefined })).toBe('loading');
    expect(upgradeBlock({ ...ok, failed: true })).toBe('failed');
    expect(upgradeBlock({ ...ok, entry: undefined })).toBe('missing');
    expect(upgradeBlock({ ...ok, entry: { Error: { Message: 'boom' } } })).toBe('refused');
    expect(upgradeBlock({ ...ok, stale: true })).toBe('stale');
  });

  test('a preview is stale once the upstream or the merged revision moves, or nothing is left to upgrade', () => {
    const request = upgradePreviewRequest(upgradable)!;
    expect(isStalePreview(request, request)).toBe(false);
    expect(isStalePreview(request, { ...request, to: 6 })).toBe(true);
    expect(isStalePreview(request, { ...request, from: 4 })).toBe(true);
    expect(isStalePreview(request, null)).toBe(true);
  });
});

test.describe('the diff in the panel\'s dialogs', () => {
  test('names each document by its kind and name', () => {
    expect(panelResourceLabel({ ResourceType: 'apps/v1/Deployment', ResourceName: '/unrel' })).toBe('Deployment/unrel');
    expect(panelResourceLabel({ ResourceType: 'v1/ConfigMap', ResourceName: 'prod/settings' })).toBe('ConfigMap/prod/settings');
    // A resource that names nothing is left as the shared label has it.
    expect(panelResourceLabel({ ResourceType: 'NoSchema', ResourceName: 'NoName' })).toBe('');
    expect(panelResourceLabel({ ResourceType: 'NoSchema', ResourceName: 'policy' })).toBe('policy');
  });
});
