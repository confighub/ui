// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A backend-verification GATE, not a feature test. Proves the real API can
// create/list/patch/delete a Space-scoped View carrying the two UI-owned
// annotations the Components nav-grouping + saved-views feature depends on
// (`ui.confighub.io/view-kind` and `ui.confighub.io/group-by`) before any
// client code relies on that assumption. A failure here means the backend
// itself needs to change, not the frontend code built on top of it.
import { test, expect } from './fixtures/test';

import { ApiHelper } from './fixtures/api-helper';

const VIEW_KIND_ANNOTATION = 'ui.confighub.io/view-kind';
const GROUP_BY_ANNOTATION = 'ui.confighub.io/group-by';

test.describe('space-view API round trip (backend gate)', () => {
  test.use({ storageState: 'authentication.json' });

  test('create/list/patch/delete a Space-scoped View with UI annotations', async ({ page }) => {
    const api = new ApiHelper(page);
    const space = await api.getFirstSpace();
    const suffix = Date.now();

    // 1. Create a Filter with From=Space.
    const filter = await api.createFilter({
      spaceId: space.SpaceID,
      filter: {
        Slug: `ch-e2e-view-gate-filter-${suffix}`,
        From: 'Space',
        Where: `SpaceID = '${space.SpaceID}'`,
      },
    });
    expect(filter.FilterID).toBeTruthy();
    expect(filter.From).toBe('Space');

    let viewId: string | undefined;
    try {
      // 2. Create a View referencing that Filter, carrying both annotations.
      const view = await api.createView({
        spaceId: space.SpaceID,
        view: {
          Slug: `ch-e2e-view-gate-view-${suffix}`,
          FilterID: filter.FilterID,
          Annotations: {
            [VIEW_KIND_ANNOTATION]: 'components',
            [GROUP_BY_ANNOTATION]: 'Labels.Owner,Component',
          },
        },
      });
      viewId = view.ViewID;
      expect(viewId).toBeTruthy();

      // 3. List views (include=FilterID) — confirm Filter.From and both annotations round-trip.
      const listed = await api.listViews({
        where: `ViewID = '${viewId}'`,
        include: 'FilterID',
      });
      expect(listed).toHaveLength(1);
      expect(listed[0].Filter?.From).toBe('Space');
      expect(listed[0].View?.Annotations?.[VIEW_KIND_ANNOTATION]).toBe('components');
      expect(listed[0].View?.Annotations?.[GROUP_BY_ANNOTATION]).toBe('Labels.Owner,Component');

      // 4. PATCH Annotations + Version — merge in a changed group-by value.
      const currentVersion = listed[0].View?.Version;
      const patched = await api.patchView({
        spaceId: space.SpaceID,
        viewId: viewId!,
        body: {
          Annotations: {
            [GROUP_BY_ANNOTATION]: 'Labels.Owner,Labels.Variant,Component',
          },
          Version: currentVersion,
        },
      });
      expect(patched.Annotations?.[GROUP_BY_ANNOTATION]).toBe('Labels.Owner,Labels.Variant,Component');
      // The view-kind annotation must survive a PATCH that only touches group-by
      // (mergeGroupByAnnotation's real-world equivalent — Annotations is a merge-patch map).
      expect(patched.Annotations?.[VIEW_KIND_ANNOTATION]).toBe('components');

      // 5. Second list confirms the PATCH is durable, not just echoed in the response.
      const relisted = await api.listViews({
        where: `ViewID = '${viewId}'`,
        include: 'FilterID',
      });
      expect(relisted[0].View?.Annotations?.[GROUP_BY_ANNOTATION]).toBe(
        'Labels.Owner,Labels.Variant,Component',
      );

      // 6. PATCH with Columns omitted/empty must be accepted (a Components view
      // has no column list of its own — grouping only).
      const patchedNoColumns = await api.patchView({
        spaceId: space.SpaceID,
        viewId: viewId!,
        body: {
          Columns: [],
          Version: patched.Version,
        },
      });
      expect(patchedNoColumns.ViewID).toBe(viewId);
    } finally {
      // 7. Clean up: delete View then Filter (never leave test fixtures behind).
      if (viewId) {
        await api.deleteView(space.SpaceID, viewId);
      }
      if (filter.FilterID) {
        await api.deleteFilterInSpace(space.SpaceID, filter.FilterID);
      }
    }
  });
});
