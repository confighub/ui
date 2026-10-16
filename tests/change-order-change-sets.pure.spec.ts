// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeSets a ChangeOrder's change was made in (`changeOrderChangeSets.ts`): which
// Revisions are read for them, and how they are grouped. No page, no browser.

import { expect, test } from '@playwright/test';

import type { ExtendedRevisionRead } from '@confighub/rtk-query';

import { changeOrderChangeSetWhere, groupChangeSetRevisions } from '../src/pages/change-orders/changeOrderChangeSets';

const CO = 'c0c0c0c0-0000-4000-8000-000000000000';
const BASE = 'b0b0b0b0-0000-4000-8000-000000000000';
const DEV = 'd0d0d0d0-0000-4000-8000-000000000000';
const PROD = 'e0e0e0e0-0000-4000-8000-000000000000';
const END_TAG = 'f0f0f0f0-0000-4000-8000-000000000000';

function revision(
  unitId: string,
  createdAt: string,
  changeSet: { id: string; slug: string; description?: string; state?: string; endTagId?: string },
): ExtendedRevisionRead {
  return {
    Revision: {
      RevisionID: `${unitId}-${createdAt}`,
      UnitID: unitId,
      SpaceID: BASE,
      RevisionNum: 1,
      CreatedAt: createdAt,
      ChangeSetID: changeSet.id,
    },
    ChangeSet: {
      ChangeSetID: changeSet.id,
      Slug: changeSet.slug,
      SpaceID: BASE,
      SpaceSlug: 'base',
      Description: changeSet.description,
      State: changeSet.state,
      EndTagID: changeSet.endTagId,
    },
  } as ExtendedRevisionRead;
}

test.describe('changeOrderChangeSetWhere', () => {
  test('reads the base Space for a ChangeOrder made there', () => {
    expect(
      changeOrderChangeSetWhere({ changeOrderId: CO, baseSpaceId: BASE, updateType: 'UpgradeUnit', ownSpaceReached: true }),
    ).toBe(`ChangeOrders ? '${CO}' AND ChangeSetID IS NOT NULL AND SpaceID = '${BASE}'`);
  });

  test('reads outside the scope for a fan-out ChangeOrder, whose promotions stamp the Spaces in it', () => {
    expect(
      changeOrderChangeSetWhere({
        changeOrderId: CO,
        baseSpaceId: BASE,
        updateType: 'Upsert',
        ownSpaceReached: false,
        inScopeSpaceIds: [PROD, DEV],
      }),
    ).toBe(`ChangeOrders ? '${CO}' AND ChangeSetID IS NOT NULL AND SpaceID NOT IN ('${DEV}', '${PROD}')`);
  });

  test('reads nothing for an Invoke ChangeOrder, which has made no change yet', () => {
    expect(
      changeOrderChangeSetWhere({ changeOrderId: CO, baseSpaceId: BASE, updateType: 'Invoke', ownSpaceReached: false }),
    ).toBeUndefined();
  });

  test('reads nothing before the ChangeOrder is known', () => {
    expect(changeOrderChangeSetWhere({ baseSpaceId: BASE, ownSpaceReached: true })).toBeUndefined();
  });
});

test.describe('groupChangeSetRevisions', () => {
  test('one entry per ChangeSet, earliest first, counting each Unit once', () => {
    const later = { id: 'cs-2', slug: 'second', description: 'Raise replicas', state: 'Open' };
    const earlier = { id: 'cs-1', slug: 'first', description: 'Bump image\nto 1.42', state: 'Closed', endTagId: END_TAG };
    const groups = groupChangeSetRevisions(
      [
        revision('u1', '2026-10-02T00:00:00Z', later),
        revision('u1', '2026-10-01T00:00:00Z', earlier),
        revision('u1', '2026-10-01T01:00:00Z', earlier),
        revision('u2', '2026-10-01T02:00:00Z', earlier),
      ],
      END_TAG,
    );
    expect(groups.map((g) => g.slug)).toEqual(['first', 'second']);
    expect(groups[0]).toMatchObject({
      changeSetId: 'cs-1',
      description: 'Bump image\nto 1.42',
      state: 'Closed',
      unitIds: ['u1', 'u2'],
      firstAt: '2026-10-01T00:00:00Z',
      adopted: true,
    });
    expect(groups[1]).toMatchObject({ unitIds: ['u1'], adopted: false });
  });

  test('a Revision whose ChangeSet did not come back expanded names nothing', () => {
    const bare = { Revision: { UnitID: 'u1', ChangeSetID: 'cs-1' } } as ExtendedRevisionRead;
    expect(groupChangeSetRevisions([bare], undefined)).toEqual([]);
  });
});
