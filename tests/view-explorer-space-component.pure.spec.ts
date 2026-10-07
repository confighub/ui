// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Component column of a Space view in the View Explorer: what the Space
// list is asked for when a view reads it. A Space holds only ComponentID, so the
// column is empty unless the query includes the Component. No page, no browser,
// no server.

import { expect, test } from '@playwright/test';

import { spaceAdapter } from '../src/pages/x/view-explorer/adapters/space';
import { spaceQueryFields } from '../src/pages/x/view-explorer/space-query';

test.describe('View Explorer Space views: Component column (pure)', () => {
  for (const column of ['Component', 'Component.Slug']) {
    test(`a view reading ${column} asks the Space list to include the Component`, () => {
      const fields = spaceQueryFields(['Slug', column, 'Labels.Stage']);
      expect(fields.include).toBe('ComponentID');
      expect(fields.select.split(',')).toEqual(expect.arrayContaining(['ComponentID', 'Labels', 'Slug', 'SpaceID']));
      expect(fields.summary).toBeUndefined();
    });
  }

  test('a view grouped or ordered by Component includes it as well', () => {
    // referenced = Columns, then GroupBy columns, then OrderBy.
    expect(spaceQueryFields(['Slug', undefined, 'Component']).include).toBe('ComponentID');
  });

  test('a view that reads no Component includes nothing', () => {
    const fields = spaceQueryFields(['Slug', 'DisplayName', 'Labels.Region']);
    expect(fields.include).toBeUndefined();
    expect(fields.select).toBe('DisplayName,Labels,Slug,SpaceID');
  });

  test('a count column still asks for the rollup', () => {
    expect(spaceQueryFields(['Slug', 'TotalUnitCount']).summary).toBe(true);
    expect(spaceQueryFields(['Slug', 'Component']).summary).toBeUndefined();
  });

  test('Component is offered in the column picker', () => {
    expect(spaceAdapter.allColumns).toContain('Component');
  });
});
