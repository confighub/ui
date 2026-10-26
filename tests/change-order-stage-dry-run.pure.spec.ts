// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * THE QUIET DRY RUN, READ FOR THE STAGE CARD.
 *
 * The line under the headline states what a promote would do before anyone
 * confirms it, so its counts have to be the true ones: Units that would change,
 * not Units the dry run mentions. A Mark moves Tags and changes nothing; a clone
 * has no id yet and still changes something. A Space counts only when it would
 * be written.
 *
 * Each HTTP answer is classed once: 409 holds the stage, 403 is no permission,
 * another 4xx is a refusal with the server's reason, and no answer at all says
 * nothing about the stage, so Promote stays offered.
 */
import { expect, test } from '@playwright/test';

import type { PromoteResult } from '@confighub/rtk-query';

import { classifyDryRunAnswer, dryRunLine, dryRunViewOf, releaseLine, samePlan, summariseDryRun } from '../src/pages/change-orders/stage/stageDryRun';

const BASE = 'base-space';

const result: PromoteResult = {
  DryRun: true,
  Plan: 'digest-1',
  Spaces: [
    { SpaceID: BASE, SpaceSlug: 'base', Action: 'Skipped', Reason: 'Origin' },
    {
      SpaceID: 's1',
      SpaceSlug: 'prod-eu',
      Action: 'Promote',
      Units: [
        { UnitID: 'u1', Slug: 'api', Action: 'Upgrade' },
        { UnitID: 'u2', Slug: 'worker', Action: 'Mark' },
        { Slug: 'new-thing', Action: 'Clone' },
      ],
    },
    {
      SpaceID: 's2',
      SpaceSlug: 'prod-us',
      Action: 'Promote',
      Units: [
        { UnitID: 'u3', Slug: 'api', Action: 'Unchanged' },
        { UnitID: 'u4', Slug: 'worker', Action: 'Skip' },
      ],
    },
    { SpaceID: 's3', SpaceSlug: 'prod-ap', Action: 'Blocked', Reason: 'UpstreamPromotedFirst', Message: 'previewed later' },
  ],
};

test.describe('summariseDryRun', () => {
  test('counts Units that would change and the Spaces they are in', () => {
    const summary = summariseDryRun(result, BASE);
    // api (Upgrade) and the clone; not the Mark, Unchanged or Skip.
    expect(summary.unitCount).toBe(2);
    // prod-us is promoted but nothing in it would change.
    expect(summary.spaceCount).toBe(1);
    expect(summary.plan).toBe('digest-1');
  });

  test('reached leaves out what the dry run could not plan', () => {
    const summary = summariseDryRun(result, BASE);
    expect(summary.reached).toBe(3);
    expect([...summary.unplannedReasonBySpaceId]).toEqual([['s3', 'UpstreamPromotedFirst']]);
    // A blocked Space on a dry run is a preview that could not be taken, not a failure.
    expect(summary.failures).toEqual([]);
  });

  test('a Unit with an error does not count as changing, and is a failure of its Space', () => {
    const failing: PromoteResult = {
      DryRun: true,
      Spaces: [
        { SpaceID: 's1', SpaceSlug: 'prod-eu', Action: 'Promote', Units: [{ UnitID: 'u1', Slug: 'api', Action: 'Upgrade', Error: { Message: 'conflict on spec.replicas' } }] },
        { SpaceID: 's2', SpaceSlug: 'prod-us', Action: 'Failed', Error: { Message: 'no permission' } },
      ],
    };
    const summary = summariseDryRun(failing, BASE);
    expect(summary.unitCount).toBe(0);
    expect(summary.failures).toEqual(['api: conflict on spec.replicas', 'prod-us: no permission']);
    expect(summary.failuresBySpace.get('s1')).toEqual(['api: conflict on spec.replicas']);
    expect(summary.failuresBySpace.get('s2')).toEqual(['prod-us: no permission']);
    expect(summary.unplannedReasonBySpaceId.get('s2')).toBe('Failed');
  });
});

test.describe('classifyDryRunAnswer', () => {
  test('200 is done', () => {
    expect(classifyDryRunAnswer({ status: 200, body: result }, BASE).kind).toBe('done');
  });

  test('a 2xx with failed items fails', () => {
    const body: PromoteResult = { Spaces: [{ SpaceID: 's1', SpaceSlug: 'prod-eu', Action: 'Promote', Units: [{ Slug: 'api', Error: { Message: 'x' } }] }] };
    expect(classifyDryRunAnswer({ status: 207, body }, BASE).kind).toBe('fails');
  });

  test('409 holds the stage, in the server’s words', () => {
    const body: PromoteResult = { Stages: [{ Name: 'prod', Gates: [{ Satisfied: false, Message: 'staging is not healthy.' }] }] };
    expect(classifyDryRunAnswer({ status: 409, body }, BASE)).toEqual({ kind: 'held', text: 'staging is not healthy.' });
  });

  test('403 is no permission', () => {
    expect(classifyDryRunAnswer({ status: 403, body: { message: 'forbidden' } }, BASE)).toEqual({ kind: 'noPermission' });
  });

  test('another 4xx is a refusal with the server’s reason', () => {
    expect(classifyDryRunAnswer({ status: 400, body: { message: "Stage 'prod' selects no Space" } }, BASE)).toEqual({
      kind: 'refused',
      reason: "Stage 'prod' selects no Space",
    });
    expect(classifyDryRunAnswer({ status: 422, body: {} }, BASE).kind).toBe('refused');
  });

  test('no answer, or a 5xx, is unavailable', () => {
    expect(classifyDryRunAnswer({ status: 0, body: undefined }, BASE)).toEqual({ kind: 'unavailable' });
    expect(classifyDryRunAnswer({ status: 503, body: 'down' }, BASE)).toEqual({ kind: 'unavailable' });
  });
});

test.describe('dryRunLine', () => {
  const nameOf = (id: string) => ({ s1: 'prod-eu', s2: 'prod-us' })[id] ?? id;
  const done = dryRunViewOf(classifyDryRunAnswer({ status: 200, body: result }, BASE));

  test('done: the counts, and the reach when it did not reach every Space', () => {
    expect(dryRunLine({ view: done, targetCount: 3, nameOf })).toEqual({ mode: 'done', text: '2 Units in 1 Space would change.', icon: 'none' });
    const line = dryRunLine({ view: done, targetCount: 4, nameOf });
    expect(line.fidelity).toBe('coverage-incomplete');
    expect(line.text).toContain('Previewed 3 of 4.');
    expect(line.icon).toBe('none');
  });

  test('done with problems in view', () => {
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, differentlyCount: 1 }).text).toBe('Dry run: 2 Units in 1 Space would change, 1 of them differently.');
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, uncertain: true })).toMatchObject({ text: 'Dry run: 2 Units in 1 Space would change.', icon: 'warn' });
  });

  test('an unknown change is not a different one', () => {
    const unknown = { kind: 'unknown' as const, spaceIds: ['s3'], cause: 'unreadable' as const };
    const differs = {
      kind: 'differs' as const, spaceId: 's2', unitId: 'u', resourceName: 'api', path: 'spec.replicas', label: 'replicas', isImage: false,
      from: '1', to: '3', refFrom: '1', refTo: '2', refSpaceId: 's1',
    };
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, problems: [unknown] })).toMatchObject({
      text: 'Dry run: 2 Units in 1 Space would change, 1 of them could not be compared.',
      icon: 'warn',
    });
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, problems: [differs] }).text).toBe('Dry run: 2 Units in 1 Space would change, 1 of them differently.');
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, problems: [unknown, differs] }).text).toBe(
      'Dry run: 2 Units in 1 Space would change, 1 of them differently and 1 could not be compared.',
    );
    // Told only that something is unknown, the line says no "differently" count at all.
    expect(dryRunLine({ view: done, targetCount: 3, nameOf, differentlyCount: 1, uncertain: true }).text).toBe('Dry run: 2 Units in 1 Space would change.');
  });

  test('done with nothing counted says it passed', () => {
    const empty = dryRunViewOf(classifyDryRunAnswer({ status: 200, body: { Spaces: [] } }, BASE));
    expect(dryRunLine({ view: empty, targetCount: 0, nameOf }).text).toBe('Dry run passed.');
  });

  test('running with no earlier answer, and running again over one', () => {
    expect(dryRunLine({ view: { mode: 'running' }, targetCount: 2, nameOf }).text).toBe('Checking what would change…');
    expect(dryRunLine({ view: { ...done, mode: 'running' }, targetCount: 3, nameOf }).text).toBe('2 Units in 1 Space would change.');
  });

  test('unavailable keeps Promote offered and says the confirm runs it', () => {
    expect(dryRunLine({ view: { mode: 'unavailable' }, targetCount: 2, nameOf })).toEqual({
      mode: 'unavailable',
      text: 'Dry run unavailable. It runs when you confirm.',
      icon: 'warn',
    });
  });

  test('fails: the Spaces and the first failure', () => {
    const body: PromoteResult = { Spaces: [{ SpaceID: 's2', SpaceSlug: 'prod-us', Action: 'Promote', Units: [{ Slug: 'api', Error: { Message: 'conflict' } }] }] };
    const view = dryRunViewOf(classifyDryRunAnswer({ status: 207, body }, BASE));
    expect(dryRunLine({ view, targetCount: 2, nameOf })).toEqual({ mode: 'fails', text: 'Dry run fails for prod-us. api: conflict', icon: 'fail' });
  });

  test('states of their own draw no line', () => {
    for (const mode of ['held', 'refused', 'noPermission', 'idle'] as const) {
      expect(dryRunLine({ view: { mode }, targetCount: 2, nameOf }).text).toBeNull();
    }
  });

  test('the release line counts Spaces that have a Target', () => {
    const targets: Record<string, string | undefined> = { s1: 't1', s2: undefined, s3: 't3' };
    expect(releaseLine(['s1', 's2', 's3'], (id) => targets[id])).toBe('Release publishes the change in 2 Spaces to their Targets.');
  });
});

test.describe('a one-click writes only the plan the box showed', () => {
  const shown = summariseDryRun(result, BASE);

  test('the same digest is the same plan, whatever else the answer says', () => {
    expect(samePlan(shown, summariseDryRun({ ...result, Spaces: [] }, BASE))).toBe(true);
  });

  test('another digest is another plan, even when the counts agree', () => {
    expect(samePlan(shown, summariseDryRun({ ...result, Plan: 'digest-2' }, BASE))).toBe(false);
  });

  test('with no digest on one side, the counts the box shows decide', () => {
    const noDigest = summariseDryRun({ ...result, Plan: undefined }, BASE);
    expect(samePlan(shown, noDigest)).toBe(true);
    expect(samePlan(noDigest, summariseDryRun({ ...result, Plan: undefined, Spaces: (result.Spaces ?? []).slice(0, 2) }, BASE))).toBe(false);
  });
});
