// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * A FIX SAVED OUTSIDE THE CHANGEORDER, AFTER THE CHANGE ARRIVED.
 *
 * The Stage card reads how a Space took the change from what the promotion wrote, and a
 * Release of the ChangeOrder bundles what its release Tag marks. A Revision saved by hand
 * afterwards reaches neither, so:
 *
 * - a problem line goes away only once the Revision the release Tag marks has the value,
 *   because that is what a release publishes; a fix only the head has keeps the line;
 * - "Release the fix" is offered only where the server would move the release Tag to the
 *   head, so each of its refusals is asserted to give no offer;
 * - a value is read from the resource the problem names, never by position or by path alone.
 */
import { expect, test } from '@playwright/test';

import {
  documentsHold,
  fixOfferPlace,
  moveOutcome,
  moveRefusal,
  moveRequestsOf,
  parseDocuments,
  releaseFixOffer,
  sameFix,
  settlingRevisionIds,
  unitHeadOf,
  valueAtDisplayPath,
  withoutFixedProblems,
  withProblems,
  type ChangeMarks,
  type ReleaseFixInput,
  type TagMark,
  type UnitHead,
} from '../src/pages/change-orders/stage/stageFix';
import type { PropagationProblem, StagePropagation } from '../src/pages/change-orders/stage/stageTypes';
import { buildChangeOrderOutcome } from '../src/pages/change-orders/changeOrderOutcome';
import { stagePropagation } from '../src/pages/change-orders/stage/stagePropagation';
import { buildStageMatrix } from '../src/pages/x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup, ChangeOrderResourceConflict } from '../src/pages/x/apps/change-order/changeOrderTypes';

const IMAGE_PATH = 'spec.template.spec.containers.?name=webhook.image';
const OLD = 'quay.io/jetstack/cert-manager-webhook:v1.16.1';
const NEW = 'quay.io/jetstack/cert-manager-webhook:v1.17.2';
const DEPLOYMENT = 'apps/v1/Deployment';

const deployment = (name: string, image: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  template:
    spec:
      containers:
        - name: webhook
          image: ${image}
`;

const head = (over: Partial<UnitHead> = {}): UnitHead => ({
  unitId: 'u-webhook',
  spaceId: 's-prod1',
  slug: 'webhook',
  headRevisionNum: 6,
  lastReleasedRevisionNum: 3,
  gated: false,
  ...over,
});

const mark = (revisionNum: number, gated = false): TagMark => ({ revisionNum, revisionId: `rev-${revisionNum}`, gated });

/** "webhook: image tag stays as it is here, not v1.16.1 → v1.17.2", as the issue shows it. */
const stays = (resourceName = 'webhook'): Extract<PropagationProblem, { kind: 'differs' }> => ({
  kind: 'differs',
  spaceId: 's-prod1',
  unitId: 'u-webhook',
  resourceName: 'webhook',
  path: IMAGE_PATH,
  label: 'image tag',
  isImage: true,
  from: '',
  to: '',
  refFrom: OLD,
  refTo: NEW,
  refSpaceId: 's-prod2',
  resource: { type: DEPLOYMENT, name: resourceName },
});

const kept: PropagationProblem = {
  kind: 'kept',
  spaceId: 's-prod1',
  unitId: 'u-webhook',
  resourceName: 'webhook',
  path: IMAGE_PATH,
  label: 'image tag',
  value: OLD,
  valueText: 'v1.16.1',
  incoming: NEW,
  reason: 'ProtectedPath',
  resource: { type: DEPLOYMENT, name: 'webhook' },
};

const refused: PropagationProblem = { kind: 'refused', spaceId: 's-prod1', unitId: 'u-webhook', resourceName: 'webhook', reason: 'Conflict' };

const dataOf = (data: string) => (unitId: string) => (unitId === 'u-webhook' ? data : '');

test.describe('the value at a DisplayPath, in the resource the problem names', () => {
  const doc = { metadata: { 'app.kubernetes.io/name': 'x' }, items: ['a', 'b'], containers: [{ name: 'web', image: 'i:1' }, { name: 'side', image: 'i:2' }] };

  test('a merge-keyed element, an index, and a key with a dot written ~1', () => {
    expect(valueAtDisplayPath(doc, 'containers.?name=side.image')).toBe('i:2');
    expect(valueAtDisplayPath(doc, 'items.1')).toBe('b');
    expect(valueAtDisplayPath(doc, 'metadata.app~1kubernetes~1io/name')).toBe('x');
  });

  test('a path that does not resolve is undefined', () => {
    expect(valueAtDisplayPath(doc, 'containers.?name=none.image')).toBeUndefined();
    expect(valueAtDisplayPath(doc, 'items.x')).toBeUndefined();
    expect(valueAtDisplayPath(doc, '')).toBeUndefined();
  });

  test('two Deployments with the same container path: each is read as itself', () => {
    const docs = parseDocuments(`${deployment('web', NEW)}---\n${deployment('web-canary', OLD)}`) ?? [];
    expect(documentsHold(docs, { type: DEPLOYMENT, name: 'web' }, IMAGE_PATH, NEW)).toBe(true);
    expect(documentsHold(docs, { type: DEPLOYMENT, name: 'web-canary' }, IMAGE_PATH, NEW)).toBe(false);
    // The same order the other way round: the position of a document says nothing.
    const swapped = parseDocuments(`${deployment('web-canary', OLD)}---\n${deployment('web', NEW)}`) ?? [];
    expect(documentsHold(swapped, { type: DEPLOYMENT, name: 'web' }, IMAGE_PATH, NEW)).toBe(true);
  });

  test('a resource of another type or name, or none at all, holds nothing', () => {
    const docs = parseDocuments(deployment('web', NEW)) ?? [];
    expect(documentsHold(docs, { type: 'apps/v1/StatefulSet', name: 'web' }, IMAGE_PATH, NEW)).toBe(false);
    expect(documentsHold(docs, { type: DEPLOYMENT, name: 'api' }, IMAGE_PATH, NEW)).toBe(false);
  });
});

test.describe('a problem line goes away when the release would have the value', () => {
  test('dropped when the Revision the release Tag marks holds the value', () => {
    expect(withoutFixedProblems([stays(), kept], dataOf(deployment('webhook', NEW)))).toEqual([]);
  });

  test('kept while the release Revision still has the old value, whatever the head has', () => {
    expect(withoutFixedProblems([stays(), kept], dataOf(deployment('webhook', OLD)))).toEqual([stays(), kept]);
  });

  test('kept while the release Revision is not read, or cannot be parsed, or the release Tag marks none', () => {
    expect(withoutFixedProblems([stays()], dataOf(''))).toEqual([stays()]);
    expect(withoutFixedProblems([stays()], dataOf('a: ['))).toEqual([stays()]);
  });

  test('two Deployments, only one fixed: only its line goes away', () => {
    const data = `${deployment('web', NEW)}---\n${deployment('web-canary', OLD)}`;
    const web = { ...stays('web'), resourceName: 'web' };
    const canary = { ...stays('web-canary'), resourceName: 'web-canary' };
    expect(withoutFixedProblems([web, canary], dataOf(data))).toEqual([canary]);
  });

  test('a problem whose resource the diff did not name is kept: a path alone does not say which document', () => {
    const { resource: _dropped, ...noResource } = stays();
    void _dropped;
    expect(withoutFixedProblems([noResource], dataOf(deployment('webhook', NEW)))).toEqual([noResource]);
  });

  test('a problem no value answers is kept, and an unchanged list keeps its identity', () => {
    expect(withoutFixedProblems([refused, stays()], dataOf(deployment('webhook', NEW)))).toEqual([refused]);
    const untouched = [refused];
    expect(withoutFixedProblems(untouched, dataOf(deployment('webhook', NEW)))).toBe(untouched);
  });

  test('a Space with no line left is a Space that has the change, and the others keep their chip', () => {
    const other = { ...stays(), spaceId: 's-prod3', unitId: 'u-other' };
    const propagation: StagePropagation = {
      problems: [stays(), other],
      marks: new Map([
        ['s-prod1', { kind: 'differs' }],
        ['s-prod3', { kind: 'differs' }],
      ]),
      quietNotes: [],
      chainedSpaceIds: [],
      referenceSpaceId: 's-prod2',
    };
    const fixed = withProblems(propagation, [other]);
    expect(fixed.problems).toEqual([other]);
    expect(fixed.marks.get('s-prod1')).toEqual({ kind: 'hasIt' });
    expect(fixed.marks.get('s-prod3')).toEqual({ kind: 'differs' });
    expect(withProblems(propagation, propagation.problems)).toBe(propagation);
  });
});

test.describe('"Release the fix" only where the server would move the release Tag', () => {
  const marks = (release: TagMark | undefined, end: TagMark | undefined = mark(5)): ChangeMarks => ({
    release: new Map(release === undefined ? [] : [['u-webhook', release]]),
    end: new Map(end === undefined ? [] : [['u-webhook', end]]),
  });
  const input = (over: Partial<ReleaseFixInput> = {}): ReleaseFixInput => ({
    spaceIds: ['s-prod1'],
    heads: [head()],
    marks: marks(mark(5, true)),
    releasedAtTagSpaceIds: new Set(),
    problems: [],
    headDataOf: dataOf(deployment('webhook', NEW)),
    ...over,
  });
  const unit = (reason: 'gate' | 'problem') => ({ unitId: 'u-webhook', slug: 'webhook', fromRevisionNum: 5, toRevisionNum: 6, reason });

  test('a gate: the release Revision has ValidationErrors and a later head has none', () => {
    expect(moveRefusal(head(), marks(mark(5, true)))).toBeUndefined();
    expect(releaseFixOffer(input())).toEqual({ spaces: [{ spaceId: 's-prod1', units: [unit('gate')] }] });
  });

  test('a problem line: no gate, and a later head holds the value the release Revision lacks', () => {
    const offer = releaseFixOffer(input({ marks: marks(mark(5)), problems: [stays()] }));
    expect(offer).toEqual({ spaces: [{ spaceId: 's-prod1', units: [unit('problem')] }] });
  });

  test('no offer for a problem line the head does not answer either', () => {
    expect(releaseFixOffer(input({ marks: marks(mark(5)), problems: [stays()], headDataOf: dataOf(deployment('webhook', OLD)) }))).toBeUndefined();
    expect(releaseFixOffer(input({ marks: marks(mark(5)), problems: [stays('webhook-canary')] }))).toBeUndefined();
  });

  test('no offer where a Release was published at the release Tag in the Space', () => {
    expect(releaseFixOffer(input({ releasedAtTagSpaceIds: new Set(['s-prod1']) }))).toBeUndefined();
    expect(releaseFixOffer(input({ marks: marks(mark(5)), problems: [stays()], releasedAtTagSpaceIds: new Set(['s-prod1']) }))).toBeUndefined();
  });

  for (const [why, over, refusal] of [
    ['the head is the Revision the Tag marks', { heads: [head({ headRevisionNum: 5 })] }, 'notNewer'],
    ['the head is before the Revision the end Tag marks', { marks: marks(mark(4, true), mark(7)) }, 'beforeEnd'],
    ['the head is before the last released Revision', { heads: [head({ lastReleasedRevisionNum: 7 })] }, 'beforeReleased'],
    ['the head has ValidationErrors', { heads: [head({ gated: true })] }, 'gated'],
    ['the release Tag marks no Revision of the Unit', { marks: marks(undefined) }, 'notMarked'],
  ] as const) {
    test(`no offer when ${why}, for a gate or a problem line`, () => {
      const gateCase = input(over);
      expect(moveRefusal(gateCase.heads[0], gateCase.marks)).toBe(refusal);
      expect(releaseFixOffer(gateCase)).toBeUndefined();
      const problemMarks: ChangeMarks = { release: new Map([...gateCase.marks.release].map(([id, m]) => [id, { ...m, gated: false }])), end: gateCase.marks.end };
      expect(releaseFixOffer({ ...gateCase, marks: problemMarks, problems: [stays()] })).toBeUndefined();
    });
  }

  test('no offer when nothing asks for the later head: an edit is not a fix', () => {
    expect(releaseFixOffer(input({ marks: marks(mark(5)) }))).toBeUndefined();
  });

  test('a gated Unit left behind blocks the Space; only Units with a reason move', () => {
    const cainjector = head({ unitId: 'u-cainjector', slug: 'cainjector', headRevisionNum: 4 });
    const controller = head({ unitId: 'u-controller', slug: 'controller', headRevisionNum: 9 });
    const m: ChangeMarks = {
      release: new Map([
        ['u-webhook', mark(5)],
        ['u-cainjector', mark(4, true)],
        ['u-controller', mark(8)],
      ]),
      end: new Map(),
    };
    expect(releaseFixOffer(input({ heads: [head(), cainjector, controller], marks: m, problems: [stays()] }))).toBeUndefined();
    const offer = releaseFixOffer(input({ heads: [head(), controller], marks: m, problems: [stays()] }));
    expect(offer?.spaces[0].units.map((u) => u.unitId)).toEqual(['u-webhook']);
  });

  test('the offer sits next to the problem line it answers, else on the release line', () => {
    const problemFix = { spaces: [{ spaceId: 's', units: [unit('problem')] }] };
    const gateFix = { spaces: [{ spaceId: 's', units: [unit('gate')] }] };
    expect(fixOfferPlace(problemFix, true)).toBe('problem');
    expect(fixOfferPlace(problemFix, false)).toBe('release');
    expect(fixOfferPlace(gateFix, true)).toBe('release');
  });

  test('a confirm is out of date when a Revision moved', () => {
    const a = { spaces: [{ spaceId: 's', units: [unit('gate')] }] };
    expect(sameFix(a, { spaces: [{ spaceId: 's', units: [unit('gate')] }] })).toBe(true);
    expect(sameFix(a, { spaces: [{ spaceId: 's', units: [{ ...unit('gate'), toRevisionNum: 7 }] }] })).toBe(false);
    expect(sameFix(a, undefined)).toBe(false);
  });
});

test.describe('the move of the release Tag', () => {
  test('one request for each Revision number the confirm showed, never HeadRevisionNum', () => {
    const space = {
      spaceId: 's-prod1',
      units: [
        { unitId: 'u-a', slug: 'a', fromRevisionNum: 5, toRevisionNum: 6, reason: 'gate' as const },
        { unitId: 'u-b', slug: 'b', fromRevisionNum: 2, toRevisionNum: 3, reason: 'problem' as const },
        { unitId: 'u-c', slug: 'c', fromRevisionNum: 4, toRevisionNum: 6, reason: 'gate' as const },
      ],
    };
    expect(moveRequestsOf(space, 'tag-release')).toEqual([
      {
        unitIds: ['u-a', 'u-c'],
        where: "UnitID IN ('u-a', 'u-c') AND SpaceID = 's-prod1'",
        unitTagRequest: { TagID: 'tag-release', Revision: '6', Move: true },
      },
      {
        unitIds: ['u-b'],
        where: "UnitID IN ('u-b') AND SpaceID = 's-prod1'",
        unitTagRequest: { TagID: 'tag-release', Revision: '3', Move: true },
      },
    ]);
  });

  test('a Unit counts as moved only with a success item that names it', () => {
    const ok = (id: string) => ({ Message: `Tag moved from revision 5 to 6 (revision 6) for unit ${id}` });
    expect(moveOutcome(['u-a', 'u-b'], [ok('u-a'), ok('u-b')])).toEqual({ moved: ['u-a', 'u-b'], errors: [], missing: [] });
    expect(moveOutcome(['u-a', 'u-b'], [ok('u-a'), { Message: 'Failed to tag unit u-b', Error: { Message: 'the revision has validation errors' } }])).toEqual({
      moved: ['u-a'],
      errors: ['the revision has validation errors'],
      missing: [],
    });
    // The server leaves out a Unit the person cannot see, or one the where clause no longer selects.
    expect(moveOutcome(['u-a', 'u-b'], [ok('u-a')])).toEqual({ moved: ['u-a'], errors: [], missing: ['u-b'] });
    expect(moveOutcome(['u-a'], [])).toEqual({ moved: [], errors: [], missing: ['u-a'] });
  });
});

// ---------------------------------------------------------------------------
// The whole way: a stage's groups, through stagePropagation, to the line and the offer
// ---------------------------------------------------------------------------

interface Change {
  /** The Deployment's name. */
  name: string;
  path: string;
  from: string;
  to: string;
}

/**
 * One Unit's group as the stage reads it: the server's diff, resource by resource, and its
 * changes keyed by resource and path. A resource with no change is not in the diff, as
 * `changedResourcesOf` leaves it out.
 */
function diffGroup(space: string, unit: string, changes: Change[], conflicts: ChangeOrderResourceConflict[] = []): ChangeOrderChangeGroup {
  const names = [...new Set(changes.map((c) => c.name))];
  return {
    unitId: `${space}/${unit}`,
    resourceName: unit,
    resourceIdentity: `apps/v1/Deployment/${unit}`,
    fieldDiffs: changes.map((c) => ({ path: `Deployment/${c.name}:${c.path}`, oldValue: c.from, newValue: c.to })),
    diff: {
      Resources: names.map((name) => ({
        Resource: { ResourceName: `cert-manager/${name}`, ResourceNameWithoutScope: name, ResourceType: DEPLOYMENT },
        ChangeType: 'Update',
        Changes: changes
          .filter((c) => c.name === name)
          .map((c) => ({ Path: c.path, DisplayPath: c.path, Segments: [], ChangeType: 'Update', FromValue: c.from, ToValue: c.to })),
      })),
    } as ChangeOrderChangeGroup['diff'],
    written: true,
    determinable: true,
    ...(conflicts.length === 0 ? {} : { conflicts }),
  };
}

function propagationOf(groups: ChangeOrderChangeGroup[], spaceIds: string[]): StagePropagation {
  const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
  const matrix = buildStageMatrix({ groups, spaceIds, spaceIdByUnitId, spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])), stageId: 'prod' });
  return stagePropagation({
    outcome: buildChangeOrderOutcome(matrix),
    matrix,
    groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])),
    spaceIdByUnitId,
    carriedResourceKeys: null,
    unplannedReasonBySpaceId: new Map(),
    stageName: 'prod',
  });
}

const bump = (name: string): Change => ({ name, path: IMAGE_PATH, from: OLD, to: NEW });
const resourceNames = (problems: readonly PropagationProblem[]) =>
  problems.map((x) => (x.kind === 'differs' || x.kind === 'kept' ? (x.resource?.name ?? '') : x.kind)).sort();

test.describe('from the stage groups to the line and the offer', () => {
  const heads = [head({ unitId: 'p1/webhook', spaceId: 'p1' })];
  const offerFor = (problems: readonly PropagationProblem[], headData: string) =>
    releaseFixOffer({
      spaceIds: ['p1'],
      heads,
      marks: { release: new Map([['p1/webhook', mark(5)]]), end: new Map([['p1/webhook', mark(5)]]) },
      releasedAtTagSpaceIds: new Set(),
      problems,
      headDataOf: (unitId) => (unitId === 'p1/webhook' ? headData : ''),
    });
  const releasedAs = (data: string) => (unitId: string) => (unitId === 'p1/webhook' ? data : '');

  test('differs: a Space that does not take the image tag, until its release Revision has it', () => {
    const p = propagationOf(
      [diffGroup('p1', 'webhook', []), diffGroup('p2', 'webhook', [bump('webhook')]), diffGroup('p3', 'webhook', [bump('webhook')])],
      ['p1', 'p2', 'p3'],
    );
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]).toMatchObject({ kind: 'differs', spaceId: 'p1', from: '', to: '', refTo: NEW, resource: { type: DEPLOYMENT, name: 'webhook' } });
    // Only the head has the fix: the line stays, and the offer answers it.
    expect(withoutFixedProblems(p.problems, releasedAs(deployment('webhook', OLD)))).toEqual(p.problems);
    expect(offerFor(p.problems, deployment('webhook', NEW))?.spaces[0].units).toEqual([
      { unitId: 'p1/webhook', slug: 'webhook', fromRevisionNum: 5, toRevisionNum: 6, reason: 'problem' },
    ]);
    // The release Revision has it (the Tag moved): the line goes.
    expect(withoutFixedProblems(p.problems, releasedAs(deployment('webhook', NEW)))).toEqual([]);
  });

  test("kept: a protected image tag that is the resource's only change, so the diff leaves the resource out", () => {
    const protectedTag: ChangeOrderResourceConflict = {
      reason: 'ProtectedPath',
      resourceName: 'cert-manager/webhook',
      resourceType: DEPLOYMENT,
      resourceNameWithoutScope: 'webhook',
      path: IMAGE_PATH,
      targetValue: OLD,
      sourceValue: NEW,
      targetProtected: true,
      blocks: true,
    };
    const p = propagationOf(
      [diffGroup('p1', 'webhook', [], [protectedTag]), diffGroup('p2', 'webhook', [bump('webhook')]), diffGroup('p3', 'webhook', [bump('webhook')])],
      ['p1', 'p2', 'p3'],
    );
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]).toMatchObject({ kind: 'kept', spaceId: 'p1', incoming: NEW, resource: { type: DEPLOYMENT, name: 'webhook' } });
    expect(offerFor(p.problems, deployment('webhook', NEW))?.spaces[0].units[0].reason).toBe('problem');
    expect(withoutFixedProblems(p.problems, releasedAs(deployment('webhook', OLD)))).toEqual(p.problems);
    expect(withoutFixedProblems(p.problems, releasedAs(deployment('webhook', NEW)))).toEqual([]);
  });

  test('one problem for each resource and path: two Deployments in one Unit with the same container path', () => {
    const both = [bump('web'), bump('web-canary')];
    const one = propagationOf([diffGroup('p1', 'svc', [bump('web')]), diffGroup('p2', 'svc', both), diffGroup('p3', 'svc', both)], ['p1', 'p2', 'p3']);
    expect(resourceNames(one.problems)).toEqual(['web-canary']);

    const neither = propagationOf([diffGroup('p1', 'svc', []), diffGroup('p2', 'svc', both), diffGroup('p3', 'svc', both)], ['p1', 'p2', 'p3']);
    expect(resourceNames(neither.problems)).toEqual(['web', 'web-canary']);
    // Only web is fixed in the release Revision: only its line goes.
    const released = `${deployment('web', NEW)}---\n${deployment('web-canary', OLD)}`;
    const left = withoutFixedProblems(neither.problems, (unitId) => (unitId === 'p1/svc' ? released : ''));
    expect(resourceNames(left)).toEqual(['web-canary']);
  });
});

test.describe('a fix released outside the ChangeOrder', () => {
  // The ChangeOrder's Tags stay on Revision 5; Revision 6, the fix, was released from the Releases tab.
  const marks: ChangeMarks = { release: new Map([['p1/webhook', mark(5)]]), end: new Map([['p1/webhook', mark(5)]]) };
  const released = head({ unitId: 'p1/webhook', spaceId: 'p1', headRevisionNum: 6, lastReleasedRevisionNum: 6, lastReleasedRevisionId: 'rev-6' });
  const problems = propagationOf(
    [diffGroup('p1', 'webhook', []), diffGroup('p2', 'webhook', [bump('webhook')]), diffGroup('p3', 'webhook', [bump('webhook')])],
    ['p1', 'p2', 'p3'],
  ).problems;
  const dataByRevision = (rev6: string) => (revisionId: string) => (revisionId === 'rev-5' ? deployment('webhook', OLD) : revisionId === 'rev-6' ? rev6 : '');
  const settled = (unit: UnitHead, rev6: string) =>
    withoutFixedProblems(problems, (unitId) => settlingRevisionIds(unitId, unitId === unit.unitId ? unit : undefined, marks).map(dataByRevision(rev6)));
  const offerAfter = (shown: readonly PropagationProblem[]) =>
    releaseFixOffer({
      spaceIds: ['p1'],
      heads: [released],
      marks,
      releasedAtTagSpaceIds: new Set(),
      problems: shown,
      headDataOf: () => deployment('webhook', NEW),
    });

  test('the release Tag Revision and a release at or after the change both settle the line; one before it does not', () => {
    expect(settlingRevisionIds('p1/webhook', released, marks)).toEqual(['rev-5', 'rev-6']);
    expect(settlingRevisionIds('p1/webhook', { ...released, lastReleasedRevisionNum: 4, lastReleasedRevisionId: 'rev-4' }, marks)).toEqual(['rev-5']);
    expect(settlingRevisionIds('p1/webhook', undefined, marks)).toEqual(['rev-5']);
  });

  test('released with the value: the line goes, and nothing is offered, since it is released already', () => {
    // There is a line, and the head would be offered while the release has not got the fix.
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: 'differs', spaceId: 'p1', refTo: NEW });
    expect(offerAfter(problems)?.spaces[0].units[0]).toMatchObject({ unitId: 'p1/webhook', reason: 'problem' });
    // The release Tag's Revision alone does not settle it; the release made outside the ChangeOrder does.
    const beforeChange = { ...released, lastReleasedRevisionNum: 4, lastReleasedRevisionId: 'rev-4' };
    expect(settled(beforeChange, deployment('webhook', NEW))).toEqual(problems);
    const shown = settled(released, deployment('webhook', NEW));
    expect(shown).toEqual([]);
    expect(offerAfter(shown)).toBeUndefined();
  });

  test('released without the value: the line stays', () => {
    expect(settled(released, deployment('webhook', OLD))).toEqual(problems);
  });
});

test.describe('a row of the stage Units read, as a head', () => {
  test('every field the line and the offer read, the last released Revision by id too', () => {
    expect(
      unitHeadOf({
        Unit: { UnitID: 'u1', SpaceID: 's1', Slug: 'webhook', HeadRevisionNum: 6, LastReleasedRevisionNum: 6, ValidationErrors: {} },
        LastReleasedRevision: { RevisionID: 'rev-6' },
      }),
    ).toEqual({ unitId: 'u1', spaceId: 's1', slug: 'webhook', headRevisionNum: 6, lastReleasedRevisionNum: 6, lastReleasedRevisionId: 'rev-6', gated: false });
  });

  test('a gated head, a Unit never released, and a row with no id', () => {
    expect(unitHeadOf({ Unit: { UnitID: 'u1', SpaceID: 's1', HeadRevisionNum: 2, ValidationErrors: { 's/t/f': true } } })).toEqual({
      unitId: 'u1',
      spaceId: 's1',
      slug: 'u1',
      headRevisionNum: 2,
      lastReleasedRevisionNum: 0,
      gated: true,
    });
    expect(unitHeadOf({ Unit: { SpaceID: 's1' } })).toBeUndefined();
  });

  test('the released Revision it names is what settles a line released outside the ChangeOrder', () => {
    const head = unitHeadOf({
      Unit: { UnitID: 'p1/webhook', SpaceID: 'p1', Slug: 'webhook', HeadRevisionNum: 6, LastReleasedRevisionNum: 6 },
      LastReleasedRevision: { RevisionID: 'rev-6' },
    });
    const marks: ChangeMarks = { release: new Map([['p1/webhook', mark(5)]]), end: new Map([['p1/webhook', mark(5)]]) };
    expect(settlingRevisionIds('p1/webhook', head, marks)).toEqual(['rev-5', 'rev-6']);
  });
});
