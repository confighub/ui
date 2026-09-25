// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * READING A PROMOTE RESPONSE, WHICH A RESOLVED PROMISE DOES NOT DO FOR YOU.
 *
 * `POST /api/promote` answers 207 Multi-Status when some of what it wrote
 * failed, and 207 is a 2xx: `.unwrap()` resolves on it, the promise looks like
 * a success, and every `Error` field is inside the body. So the difference
 * between "your change shipped" and "half your change shipped" is a walk over
 * that body, and nothing else in the stack will do it.
 *
 * ⚠️ THE DANGEROUS OUTCOME IS NOT FAILURE, IT IS PARTIAL SUCCESS. A promote
 * that wrote two Spaces and failed on a third has moved production. Reporting
 * that as "nothing was changed" is not a worse error message, it is a false
 * statement about production, and it is the one a reader acts on by retrying
 * blind. `summarisePromote` is what tells the two apart, so it is asserted
 * directly.
 *
 * THREE LEVELS CARRY AN ERROR, AND ALL THREE ARE WALKED. The Space, each
 * resource, and each LINK. The link level is the one with no precedent: the
 * client-side promotion never inspected links at all, so a relationship that
 * failed to land was invisible however carefully the resources were checked.
 *
 * ⚠️ AND A SPACE THAT WAS PASSED OVER CARRIES NO ERROR AT ALL. `Skipped` and
 * `Blocked` set a `Reason` and nothing else, so the levels above are not
 * enough: a promotion can report 200, every error field empty, and still have
 * left variants without the change. Those cases are asserted hardest here,
 * because they are the ones where the response looks clean.
 */
import { test, expect } from './fixtures/test';

import type { PromoteResult } from '@confighub/rtk-query';
import {
  promoteGatesHolding,
  promoteHasNothingToDo,
  summarisePromote,
} from '../src/pages/x/apps/rollout/useRolloutActions';
import { rolloutCopy } from '../src/pages/x/apps/rollout/rolloutCopy';

/**
 * The ChangeOrder's own Space.
 *
 * Every promotion skips it — the change was authored there — and it is the one
 * skip that means nothing is wrong. It is recognised by its id rather than by
 * its sentence, so the caller has to say which id it is.
 */
const BASE_SPACE_ID = 'base-1';

/** A Space that took the change cleanly. */
const PROMOTED_DEV: PromoteResult = {
  Spaces: [
    {
      SpaceID: 'dev-1',
      SpaceSlug: 'dev',
      Action: 'Promote',
      Units: [
        { Action: 'Upgrade', Slug: 'app' },
        { Action: 'Clone', Slug: 'worker' },
      ],
      Links: [{ Action: 'Create', Slug: 'app-to-config' }],
    },
  ],
};

test('a clean promote reports no failure and names what it wrote', () => {
  const summary = summarisePromote(PROMOTED_DEV, BASE_SPACE_ID);
  expect(summary.failures).toEqual([]);
  expect(summary.writtenSpaceCount).toBe(1);
  expect(summary.reachedSpaceCount).toBe(1);
});

test('a 207 is told apart from a failure: what landed is named as landed', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'dev-2',
          SpaceSlug: 'dev-eu',
          Action: 'Promote',
          Units: [
            { Action: 'Upgrade', Slug: 'app' },
            { Action: 'Clone', Slug: 'config', Error: { Message: 'already exists' } },
          ],
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('config');
  expect(summary.failures[0]).toContain('already exists');
  // The half that DID land. Losing this is what turns a partial promote into a
  // report of "nothing was changed".
  expect(summary.writtenSpaceCount).toBe(2);
  // A write that failed IS finished by running it again, so this shape may
  // offer the retry the other one must not.
  expect(summary.outOfScopeSpace).toBe(false);
});

/*
 * THE CASE THAT HAD NO COVERAGE AT ALL BEFORE.
 *
 * The client-side promotion copied links on a best-effort basis and read none
 * of the answers — its own comment conceded that a variant more than one hop
 * down silently arrived without its intra-Space links. A resource that lands
 * without the relationships it has upstream is intact to look at and wrong in
 * what it is connected to, which is the failure mode hardest to see from a
 * screenshot and easiest to ship.
 */
test('a link that failed to land is a failure, not a detail', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'prod-1',
          SpaceSlug: 'prod',
          Action: 'Promote',
          Units: [{ Action: 'Upgrade', Slug: 'app' }],
          Links: [
            { Action: 'Create', Slug: 'app-to-config' },
            {
              Action: 'Create',
              Slug: 'app-to-secret',
              Error: { Message: 'the target resource does not exist here' },
            },
          ],
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('app-to-secret');
  expect(summary.failures[0]).toContain('does not exist here');
  // The resources all arrived, so nothing else in the response says anything
  // is wrong. That is exactly why the link level has to be read.
  expect(summary.writtenSpaceCount).toBe(1);
});

test('a link named only by the resource it comes from is still named', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceSlug: 'prod',
          Action: 'Promote',
          Links: [{ Action: 'Create', FromUnitSlug: 'app', Error: { Message: 'refused' } }],
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.failures[0]).toContain('app');
});

test('a Space that could not be planned at all is a failure, reason and all', () => {
  // `Failed` carries its cause in `Reason`, not in `Error` — a Space that is
  // not a variant of anything never got far enough to produce one. Reading only
  // `Error` would drop the whole Space silently.
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'orphan-1',
          SpaceSlug: 'orphan',
          Action: 'Failed',
          Reason: 'the Space has no upstream to take from',
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('orphan');
  expect(summary.failures[0]).toContain('no upstream');
  expect(summary.writtenSpaceCount).toBe(0);
});

test('a failed item with no name is still reported rather than dropped', () => {
  const summary = summarisePromote(
    { Spaces: [{ Action: 'Promote', Units: [{ Action: 'Clone', Error: { Message: 'refused' } }] }] },
    BASE_SPACE_ID,
  );
  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain(rolloutCopy.unnamedResource);
});

// ── Spaces the promotion passed over ────────────────────────────────────────

/*
 * ⚠️ THE WORST ANSWER THIS FEATURE CAN GIVE, AND IT ARRIVES AS A CLEAN 200.
 *
 * A stage's Spaces come from the ChangeWorkflow's stage selector; the Spaces a
 * ChangeOrder is headed for come from its own `InScopeSpaceIDs`. The two are
 * set in different places and can legitimately diverge — and where they do, the
 * server promotes the Spaces in both and reports the rest as `Skipped`, with a
 * reason and NO error field anywhere in the response.
 *
 * So every error channel is empty, one Space really was promoted, and a reader
 * checking only those is told "Promoted to staging" while two of three variants
 * never got the change. Failing loudly is not the cautious option here, it is
 * the only honest one.
 */
test('variants the change order does not cover are reported, not silently dropped', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'dev-2',
          SpaceSlug: 'dev-eu',
          Action: 'Skipped',
          Reason:
            "change order 'r-1' is not headed for this space, so there is nothing to promote into it; add the space to its InScopeSpaceIDs first",
        },
        {
          SpaceID: 'dev-3',
          SpaceSlug: 'dev-ap',
          Action: 'Skipped',
          Reason:
            "change order 'r-1' is not headed for this space, so there is nothing to promote into it; add the space to its InScopeSpaceIDs first",
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(2);
  expect(summary.failures[0]).toContain('dev-eu');
  expect(summary.failures[1]).toContain('dev-ap');
  // The server's own sentence, which names the remedy. Paraphrasing it would
  // leave a reader knowing something is wrong and not what to do about it.
  expect(summary.failures[0]).toContain('add the space to its InScopeSpaceIDs first');
  // One really was written, so this is a PARTIAL promotion — not a failure that
  // changed nothing, and not a success.
  expect(summary.writtenSpaceCount).toBe(1);
  // And nothing here is finished by trying again.
  expect(summary.outOfScopeSpace).toBe(true);
});

/*
 * THE ONE SKIP THAT IS CORRECT, AND IT MUST STAY QUIET. The ChangeOrder's own
 * Space is skipped because the change was authored there. Reporting it would
 * make every ordinary promotion complain about itself, which is how a warning
 * that matters stops being read.
 */
test("the change order's own Space is skipped without complaint", () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: BASE_SPACE_ID,
          SpaceSlug: 'base',
          Action: 'Skipped',
          Reason: 'the space the change order was created in',
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toEqual([]);
  expect(summary.writtenSpaceCount).toBe(1);
});

test('without a base Space to recognise, every skip is reported', () => {
  // Failing loud is the right default: the alternative is staying silent about
  // a variant that missed the change because the caller could not name the one
  // Space that is meant to.
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: BASE_SPACE_ID,
          SpaceSlug: 'base',
          Action: 'Skipped',
          Reason: 'the space the change order was created in',
        },
      ],
    },
    undefined,
  );
  expect(summary.failures).toHaveLength(1);
});

/*
 * BLOCKED MEANS TWO DIFFERENT THINGS, AND `DryRun` IS WHICH.
 *
 * A dry run blocks a Space whose upstream the same request would promote first,
 * because it cannot preview against a state that does not exist yet — nothing
 * is wrong. An apply blocks a Space whose upstream's promotion did not
 * complete, which is a variant left behind.
 */
test('a Space blocked by a dry run is a preview limit, not a failure', () => {
  const summary = summarisePromote(
    {
      DryRun: true,
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'staging-1',
          SpaceSlug: 'staging',
          Action: 'Blocked',
          Reason: 'takes from space dev, which this promotion promotes first',
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.failures).toEqual([]);
});

/*
 * ⚠️ THE COUNT THE CONFIRMATION STATES, AND THE CASE IT WAS WRITTEN FOR.
 *
 * A dry run blocks every Space that takes from another Space of the same
 * promotion — the shape of every chained rollout. Counting those as reached
 * made `previewedCount === targetCount`, so the dialog's coverage sentence
 * stayed silent in exactly the topology it exists to describe, and the
 * confirmation claimed to have previewed variants nothing had looked at.
 */
test('a Space a dry run could not plan was not previewed', () => {
  const summary = summarisePromote(
    {
      DryRun: true,
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'staging-1',
          SpaceSlug: 'staging',
          Action: 'Blocked',
          Reason: 'takes from space dev, which this promotion promotes first',
        },
      ],
    },
    BASE_SPACE_ID,
  );

  // Two Spaces answered for, one previewed. Nothing is wrong — and the
  // confirmation must still not claim it saw both.
  expect(summary.failures).toEqual([]);
  expect(summary.reachedSpaceCount).toBe(1);
});

test('a Space that could not be planned at all was not previewed either', () => {
  const summary = summarisePromote(
    {
      DryRun: true,
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        { SpaceID: 'orphan-1', SpaceSlug: 'orphan', Action: 'Failed', Reason: 'no upstream' },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.reachedSpaceCount).toBe(1);
});

test('a Space that was skipped still counts as answered for', () => {
  // Skipped is a decided outcome, not an absent one: the server says what
  // happens to it. Only a Space with no plan at all is unpreviewed.
  const summary = summarisePromote(
    {
      DryRun: true,
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: BASE_SPACE_ID,
          SpaceSlug: 'base',
          Action: 'Skipped',
          Reason: 'the space the change order was created in',
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.reachedSpaceCount).toBe(2);
});

test('the coverage sentence names the ordinary cause and does not alarm', () => {
  const short = rolloutCopy.previewReach(1, 3);
  expect(short).toContain('Previewed 1 of 3');
  // It says WHY, so a reader is not left guessing at a fault that is not there.
  expect(short).toContain('earlier in this promotion');
  // And it never calls the ordinary case a failure.
  expect(short).not.toMatch(/fail|error|problem|warning/i);
  // Singular reads as English rather than as a template.
  expect(rolloutCopy.previewReach(2, 3)).toContain('The other takes from a variant');
});

/*
 * ⚠️ "REPORT THIS" AND "RETRYING WILL NOT HELP" ARE DIFFERENT QUESTIONS.
 *
 * A Failed Space and a Space blocked behind one both need reporting — the
 * reader has to know the variant did not get the change. Neither is beyond a
 * retry: a failure is a write that stopped, and a block on an apply is a
 * variant waiting on an upstream that failed THIS run. Fix the cause, run it
 * again, and both proceed.
 *
 * Only a Space the change order is not headed for is immune to a retry, and
 * telling the other two otherwise denies them the remedy that works. One
 * boolean answering both questions is how they came to be conflated.
 */
test('a Space that failed is reported, and is not beyond a retry', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'dev-2',
          SpaceSlug: 'dev-eu',
          Action: 'Failed',
          Error: { Message: 'merge conflict on app' },
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('merge conflict');
  expect(summary.writtenSpaceCount).toBe(1);
  // Reported, yes. Hopeless, no.
  expect(summary.outOfScopeSpace).toBe(false);
});

test('a Space blocked behind a failed upstream is reported, and is not beyond a retry', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'staging-1',
          SpaceSlug: 'staging',
          Action: 'Blocked',
          Reason: 'takes from space dev-eu, whose promotion did not complete',
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('did not complete');
  expect(summary.writtenSpaceCount).toBe(1);
  // The ordinary cascade. Fix the upstream, run again, and it proceeds.
  expect(summary.outOfScopeSpace).toBe(false);
});

test('a Space blocked by an apply is a variant left behind', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        PROMOTED_DEV.Spaces![0],
        {
          SpaceID: 'staging-1',
          SpaceSlug: 'staging',
          Action: 'Blocked',
          Reason: 'takes from space dev, whose promotion did not complete',
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.failures).toHaveLength(1);
  expect(summary.failures[0]).toContain('staging');
  expect(summary.failures[0]).toContain('did not complete');
});

/*
 * ⚠️ A SPACE'S `Action` IS WHAT WAS PLANNED, NOT WHAT LANDED.
 *
 * The server decides each Space's action before anything runs and fills the
 * per-resource errors into the already-rendered result afterwards. So a Space
 * whose every write failed still reads `Promote` — and counting that as written
 * puts "This Space took the change" in front of somebody whose Space took none
 * of it.
 */
test('a Space whose every write failed did not take the change', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'dev-1',
          SpaceSlug: 'dev',
          Action: 'Promote',
          Units: [
            { Action: 'Upgrade', Slug: 'app', Error: { Message: 'merge conflict' } },
            { Action: 'Clone', Slug: 'worker', Error: { Message: 'already exists' } },
          ],
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toHaveLength(2);
  // Planned, not landed. This is the number that decides which sentence the
  // reader gets, and "nothing was changed" is the true one here.
  expect(summary.writtenSpaceCount).toBe(0);
});

test('one surviving write is enough to have written', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'dev-1',
          SpaceSlug: 'dev',
          Action: 'Promote',
          Units: [
            { Action: 'Upgrade', Slug: 'app' },
            { Action: 'Clone', Slug: 'worker', Error: { Message: 'already exists' } },
          ],
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.writtenSpaceCount).toBe(1);
});

test('a Space whose only surviving entries change nothing has not written', () => {
  // `Unchanged` and `Skip` are not writes, so a Space left holding only those
  // took nothing however its action reads.
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'dev-1',
          SpaceSlug: 'dev',
          Action: 'Promote',
          Units: [
            { Action: 'Unchanged', Slug: 'app', Reason: 'AlreadyTaken' },
            { Action: 'Skip', Slug: 'late', Reason: 'CreatedAfterChangeOrder' },
            { Action: 'Upgrade', Slug: 'worker', Error: { Message: 'merge conflict' } },
          ],
          Links: [{ Action: 'Unchanged', Slug: 'app-to-config' }],
        },
      ],
    },
    BASE_SPACE_ID,
  );
  expect(summary.writtenSpaceCount).toBe(0);
});

/*
 * ⚠️ A PROMOTE THAT WROTE NOTHING IS NOT A PROMOTION.
 *
 * Every variant already holding the change is a SUCCESS — nothing failed — and
 * it is also a promotion that did not happen. `writtenSpaceCount` is what the
 * hook reads to decide which of those two sentences the reader gets; a
 * summariser that counted reported Spaces instead would call this one promoted.
 */
test('Spaces that were already level are reached but not written', () => {
  const summary = summarisePromote(
    {
      Spaces: [
        {
          SpaceID: 'dev-1',
          SpaceSlug: 'dev',
          Action: 'Unchanged',
          Units: [{ Action: 'Unchanged', Slug: 'app', Reason: 'AlreadyTaken' }],
        },
      ],
    },
    BASE_SPACE_ID,
  );

  expect(summary.failures).toEqual([]);
  expect(summary.writtenSpaceCount).toBe(0);
  expect(summary.reachedSpaceCount).toBe(1);
});

test('an empty response is nothing reached, not a silent success', () => {
  expect(summarisePromote(undefined, BASE_SPACE_ID).reachedSpaceCount).toBe(0);
  expect(summarisePromote({}, BASE_SPACE_ID).writtenSpaceCount).toBe(0);
});

// ── The refusal, which arrives as a 409 body rather than as a status ────────

/*
 * EVERY GATE, NOT THE FIRST. A stage held by three things is held by three
 * things; naming one sends a reader off to fix a third of the problem. The
 * server evaluates them all for precisely this reason, so dropping the rest on
 * the way to the screen would throw away the thing that was asked for.
 */
test('a refusal names every gate that does not hold', () => {
  const holding = promoteGatesHolding({
    Stages: [
      {
        Name: 'prod',
        PreviousStage: 'staging',
        Gates: [
          { Prerequisite: 'Promoted', SpaceSlug: 'staging-us', Satisfied: true },
          {
            Prerequisite: 'Released',
            SpaceSlug: 'staging-us',
            Satisfied: false,
            Message: "Variant 'staging-us' has taken change order 'r-1' but has not released it",
          },
          {
            Prerequisite: 'Healthy',
            SpaceSlug: 'staging-eu',
            Satisfied: false,
            Message: "Variant 'staging-eu' is not healthy",
          },
        ],
      },
    ],
  });

  expect(holding).not.toBeNull();
  expect(holding).toContain('has not released it');
  expect(holding).toContain('is not healthy');
});

test('a gate with no message of its own still says something', () => {
  const holding = promoteGatesHolding({
    Stages: [{ Name: 'prod', Gates: [{ Prerequisite: 'Promoted', Satisfied: false }] }],
  });
  expect(holding).toBe(rolloutCopy.promoteHeld.generic);
});

test('gates that all hold are not a refusal', () => {
  expect(
    promoteGatesHolding({
      Stages: [{ Name: 'prod', Gates: [{ Prerequisite: 'Promoted', Satisfied: true }] }],
    }),
  ).toBeNull();
  expect(promoteGatesHolding(undefined)).toBeNull();
  // A first stage has nothing ahead of it and so no gates at all. An empty gate
  // list must read as "nothing holds this", never as "nothing was checked".
  expect(promoteGatesHolding({ Stages: [{ Name: 'dev', Gates: [] }] })).toBeNull();
});

// ── The three things a failed promote may claim about production ───────────

/*
 * ⚠️ ADVICE THAT CANNOT WORK IS WORSE THAN NO ADVICE.
 *
 * A Space outside the change order's scope is passed over by every run, so
 * "run the promote again to finish it" is an instruction that provably does
 * nothing — it spends the reader's attention and, the second time they follow
 * it and nothing happens, their trust in everything else the screen says.
 *
 * The remedy is in the server's own sentence, which the reason carries whole.
 * The wrapper's job is to stop talking over it.
 */
test('a promotion that passed Spaces over never tells the reader to retry', () => {
  const reason =
    "dev-eu: change order 'r-1' is not headed for this space, so there is nothing to promote into it; add the space to its InScopeSpaceIDs first";
  const passedOver = rolloutCopy.promotePassedOver(rolloutCopy.spaceCount(1), reason);

  // The server's remedy survives intact rather than being paraphrased away.
  expect(passedOver).toContain('add the space to its InScopeSpaceIDs first');
  // It says what landed.
  expect(passedOver).toContain('This Space took the change');
  // And it does NOT send the reader round the same loop.
  expect(passedOver).not.toMatch(/run the promote again to finish|try again/i);
  expect(passedOver).toContain('passes them over in the same way');
});

test('a promotion that only failed writes does offer the retry, because it works', () => {
  const partial = rolloutCopy.promotePartial(rolloutCopy.spaceCount(2), 'app: merge conflict');
  expect(partial).toContain('Run the promote again to finish it');
  // And it no longer claims the failures were inside the Space that landed —
  // they can as easily be another Space's writes.
  expect(partial).not.toContain('some of it did not land');
});

test('only an outright failure may claim nothing was changed', () => {
  const nothing = rolloutCopy.promoteRequestFailed('app: boom', 2);
  const partial = rolloutCopy.promotePartial(rolloutCopy.spaceCount(2), 'app: boom');
  const refused = rolloutCopy.promoteRefused('a gate holds it');
  const stale = rolloutCopy.promotePlanStale;

  // A refusal and a stale plan both write nothing, so both may say so.
  expect(nothing).toContain('not changed');
  expect(refused).toContain('Nothing was changed');
  expect(stale).toContain('Nothing was changed');

  // The partial did write, and must never say otherwise.
  expect(partial).not.toContain('Nothing was changed');
  expect(partial).not.toContain('not changed');
  // It says what finishes it, and the answer is the same promote again —
  // a promotion decides per resource what each variant still needs.
  expect(partial).toContain('again');
});

// ── Nothing to do is not the same as done ───────────────────────────────────

test('a promote with no target Spaces is reported as having done nothing', () => {
  // `ok` with nothing written. A caller that reads only `ok` announces a
  // promotion that never happened, which is what `didNothing` exists to stop.
  expect(promoteHasNothingToDo('co-1', 'base-1', [])).toBe(true);
  expect(promoteHasNothingToDo(undefined, 'base-1', ['s1'])).toBe(true);
  expect(promoteHasNothingToDo('co-1', undefined, ['s1'])).toBe(true);
  expect(promoteHasNothingToDo('co-1', 'base-1', ['s1'])).toBe(false);
});
