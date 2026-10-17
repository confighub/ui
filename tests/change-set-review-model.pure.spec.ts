// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeSet page's pure parts: its address (changeSetAddress.ts), and how its
// reviews are read from the Attestations on the ChangeSet's Revisions
// (changeSetReviewModel.ts). No page and no server.

import { expect, test } from '@playwright/test';

import type { AttestationRead, ExtendedRevisionRead } from '@confighub/rtk-query';

import { changeSetPath, findChangeSet, isSlugSegment } from '../src/pages/change-sets/changeSetAddress';
import { deriveChangeSetReviews, latestRevisionByUnit, reviewStatusText } from '../src/pages/change-sets/changeSetReviewModel';

test.describe('changeSetAddress', () => {
  test('a ChangeSet is addressed by its Space and its slug', () => {
    expect(changeSetPath('team-a', 'release-1.2')).toBe('/change-sets/team-a/release-1.2');
  });

  test('the slug is matched in the Space the URL names', () => {
    const here = { changeSetId: 'a', slug: 'release', spaceSlug: 'team-a' };
    const there = { changeSetId: 'b', slug: 'release', spaceSlug: 'team-b' };
    expect(findChangeSet({ space: 'team-b', slug: 'release' }, [here, there])).toBe(there);
    expect(findChangeSet({ space: 'team-c', slug: 'release' }, [here, there])).toBeUndefined();
  });

  test('only a slug can be put in a where expression', () => {
    expect(isSlugSegment('release-1.2_x')).toBe(true);
    expect(isSlugSegment("x' OR '1'='1")).toBe(false);
    expect(isSlugSegment('')).toBe(false);
    expect(isSlugSegment(undefined)).toBe(false);
  });
});

const ALICE = 'u-alice';
const BOB = 'u-bob';
const CAROL = 'u-carol';
const names = new Map([
  [ALICE, 'Alice Adams'],
  [BOB, 'Bob Brown'],
  [CAROL, 'Carol Cruz'],
]);

function approval(id: string, userId: string, at: string, result: 'Pass' | 'Fail' = 'Pass', note = 'ok'): AttestationRead {
  return { AttestationID: id, UserID: userId, CreatedAt: at, Result: result, Note: note, Type: 'Approval', SpaceID: 'space-1' } as AttestationRead;
}

function revision(unitId: string, num: number, userId: string, attestations: AttestationRead[] = []): ExtendedRevisionRead {
  return {
    Revision: { RevisionID: `${unitId}-r${num}`, UnitID: unitId, RevisionNum: num, UserID: userId, SpaceID: 'space-1' },
    Attestations: attestations,
  } as ExtendedRevisionRead;
}

test.describe('deriveChangeSetReviews', () => {
  test('the latest Revision of each Unit is the change as it stands', () => {
    const latest = latestRevisionByUnit([revision('web', 3, ALICE), revision('web', 5, ALICE), revision('api', 2, ALICE)]);
    expect(Object.fromEntries(latest)).toEqual({ web: 'web-r5', api: 'api-r2' });
  });

  test('an approval of every Unit as it stands counts; one of an earlier state is out of date', () => {
    const bobs = approval('a1', BOB, '2026-10-01T10:00:00Z');
    const carols = approval('a2', CAROL, '2026-10-01T11:00:00Z');
    const summary = deriveChangeSetReviews({
      revisions: [
        revision('web', 2, ALICE, [bobs]),
        // Carol approved after api's latest change; Bob did not see it.
        revision('api', 4, ALICE, [carols]),
        revision('web', 3, ALICE, [carols]),
      ],
      revocations: [],
      requests: [{ UserID: BOB, RequestedAt: '2026-10-01T09:00:00Z', RequestedByUserID: ALICE }],
      userNames: names,
      viewerUserId: ALICE,
    });
    expect(summary.approvals).toBe(1);
    expect(summary.outOfDate).toBe(1);
    expect(reviewStatusText(summary)).toBe('1 approval · 1 out of date');
    expect(summary.decisions.map((d) => [d.person.name, d.current])).toEqual([
      ['Carol Cruz', true],
      ['Bob Brown', false],
    ]);
    // Bob was asked, and his review is of an earlier state: still waiting.
    expect(summary.requests).toHaveLength(1);
    expect(summary.requests[0].reviewed).toBe(false);
    expect(summary.requests[0].requestedBy?.name).toBe('Alice Adams');
    expect(summary.authors.map((a) => a.name)).toEqual(['Alice Adams']);
    expect(summary.viewerIsAuthor).toBe(true);
  });

  test('records of one call, one per Space, are one decision', () => {
    const first = { ...approval('a1', BOB, '2026-10-01T10:00:00.000Z'), SpaceID: 'space-1' };
    const second = { ...approval('a2', BOB, '2026-10-01T10:00:00.400Z'), SpaceID: 'space-2' };
    const summary = deriveChangeSetReviews({
      revisions: [revision('web', 2, ALICE, [first]), revision('api', 2, ALICE, [second])],
      revocations: [],
      requests: [],
      userNames: names,
      viewerUserId: BOB,
    });
    expect(summary.decisions).toHaveLength(1);
    expect(summary.decisions[0].records.map((r) => r.spaceId)).toEqual(['space-1', 'space-2']);
    expect(summary.decisions[0].current).toBe(true);
    expect(summary.viewerDecision?.id).toBe('a1');
    expect(summary.viewerIsAuthor).toBe(false);
  });

  test("a person's later decision replaces their earlier one, and a revoked one does not count", () => {
    const approved = approval('a1', BOB, '2026-10-01T10:00:00Z');
    const rejected = approval('a2', BOB, '2026-10-01T12:00:00Z', 'Fail', 'replicas too high');
    const carols = approval('a3', CAROL, '2026-10-01T13:00:00Z');
    const summary = deriveChangeSetReviews({
      revisions: [revision('web', 2, ALICE, [approved, rejected, carols])],
      revocations: [{ AttestationID: 'r1', RevokedAttestationID: 'a3', UserID: CAROL, CreatedAt: '2026-10-01T14:00:00Z' } as AttestationRead],
      requests: [],
      userNames: names,
      viewerUserId: undefined,
    });
    expect(summary.approvals).toBe(0);
    expect(summary.rejections).toBe(1);
    expect(reviewStatusText(summary)).toBe('1 rejection');
    const byId = new Map(summary.decisions.map((d) => [d.id, d]));
    expect(byId.get('a1')?.supersededBy).toBe('a2');
    expect(byId.get('a2')?.supersededBy).toBeUndefined();
    expect(byId.get('a3')?.revokedAt).toBe('2026-10-01T14:00:00Z');
  });

  test('a ChangeSet that changed nothing has nothing a decision can be current for', () => {
    const summary = deriveChangeSetReviews({ revisions: [], revocations: [], requests: [], userNames: names, viewerUserId: ALICE });
    expect(reviewStatusText(summary)).toBe('No reviews yet');
    expect(summary.decisions).toEqual([]);
  });
});
