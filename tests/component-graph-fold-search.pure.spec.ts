// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Canvas search on a folded Component graph must say where a Deployment
// lives before the user jumps to it, because a folded Deployment has no card
// on screen until its stack opens. A drag on a card pans the canvas, so a
// click must be told apart from the end of a pan. And the Group by label in
// the URL is only used when it is one of the Component's options.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import {
  isClickAfterPan,
  matchRange,
  searchDeployments,
} from '../src/pages/x/apps/flow-graph/fold/canvasSearch';
import { SEARCH_MAX_RESULTS } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  type FoldModel,
  buildFoldModel,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import {
  defaultGroupKey,
  groupByOptions,
  resolveGroupKey,
} from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { meridianComponent } from './fixtures/meridianFoldFixture';

function certManager(): { deployments: ComponentDeployment[]; model: FoldModel } {
  const deployments = meridianComponent('cert-manager');
  const model = buildFoldModel({
    deployments,
    groupKey: defaultGroupKey(foldMembers(deployments)),
  });
  return { deployments, model };
}

test.describe('searchDeployments', () => {
  test('a folded match says which Base and which stack it is in', () => {
    const { deployments, model } = certManager();
    const { hits, total } = searchDeployments('retail-prod2', deployments, model);
    expect(total).toBe(6);
    expect(hits.map((h) => h.name)).toEqual([
      'ap-northeast-retail-prod2',
      'ap-southeast-retail-prod2',
      'eu-central-retail-prod2',
      'eu-west-retail-prod2',
      'us-east-retail-prod2',
      'us-west-retail-prod2',
    ]);
    for (const hit of hits) expect(hit.where).toBe('prod Base › retail stack');
  });

  test('an attention card says it is a card on its Base', () => {
    const { deployments, model } = certManager();
    const { hits } = searchDeployments('ap-northeast-logistics-prod1', deployments, model);
    expect(hits).toEqual([
      {
        id: 'ap-northeast-logistics-prod1',
        name: 'ap-northeast-logistics-prod1',
        where: 'prod Base › card',
      },
    ]);
  });

  test('a Base of the tree says where it hangs', () => {
    const { deployments, model } = certManager();
    const byName = new Map(
      searchDeployments('prod', deployments, model).hits.map((h) => [h.name, h.where]),
    );
    expect(byName.get('prod')).toBe('base Base › Base');
    expect(searchDeployments('base', deployments, model).hits[0]).toMatchObject({
      name: 'base',
      where: 'Root Base',
    });
  });

  test('without a fold model every match is a card under its parent', () => {
    const { deployments } = certManager();
    const { hits } = searchDeployments('ap-northeast-retail-prod2', deployments, null);
    expect(hits[0].where).toBe('prod Base › card');
  });

  test(`lists at most ${SEARCH_MAX_RESULTS} and counts the rest`, () => {
    const { deployments, model } = certManager();
    const { hits, total } = searchDeployments('prod', deployments, model);
    expect(hits).toHaveLength(SEARCH_MAX_RESULTS);
    // 55 prod Deployments and the prod Base itself.
    expect(total).toBe(56);
  });

  test('names that start with the query come first, then A-Z', () => {
    const { deployments, model } = certManager();
    const names = searchDeployments('prod', deployments, model).hits.map((h) => h.name);
    expect(names[0]).toBe('prod');
    const rest = names.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  test('is case-insensitive and ignores surrounding spaces', () => {
    const { deployments, model } = certManager();
    expect(searchDeployments('  RETAIL-PROD2 ', deployments, model).total).toBe(6);
  });

  test('an empty query finds nothing', () => {
    const { deployments, model } = certManager();
    expect(searchDeployments('', deployments, model)).toEqual({ hits: [], total: 0 });
    expect(searchDeployments('   ', deployments, model)).toEqual({ hits: [], total: 0 });
  });

  test('a query that matches nothing gives no hits', () => {
    const { deployments, model } = certManager();
    expect(searchDeployments('no-such-thing', deployments, model)).toEqual({
      hits: [],
      total: 0,
    });
  });
});

test.describe('matchRange', () => {
  test('marks the matched part of the name', () => {
    expect(matchRange('ap-northeast-retail-prod2', 'Retail')).toEqual([13, 19]);
  });

  test('marks nothing when the name does not hold the query', () => {
    expect(matchRange('ap-northeast-retail-prod2', 'uat')).toBeNull();
    expect(matchRange('ap-northeast-retail-prod2', '')).toBeNull();
  });
});

test.describe('isClickAfterPan', () => {
  const down = { x: 100, y: 100 };

  test('a pointer that moved 3 px is still a click', () => {
    expect(isClickAfterPan(down, { x: 103, y: 100 })).toBe(false);
    expect(isClickAfterPan(down, { x: 100, y: 97 })).toBe(false);
  });

  test('a pointer that moved 5 px ended a pan', () => {
    expect(isClickAfterPan(down, { x: 105, y: 100 })).toBe(true);
    expect(isClickAfterPan(down, { x: 97, y: 104 })).toBe(true);
  });

  test('exactly on the threshold is still a click', () => {
    expect(isClickAfterPan(down, { x: 104, y: 100 })).toBe(false);
  });
});

test.describe('resolveGroupKey from the URL', () => {
  const deployments = meridianComponent('cert-manager');
  const members = foldMembers(deployments);
  const options = groupByOptions(members);
  const fallback = defaultGroupKey(members);

  test('a URL key that is an option is used', () => {
    expect(options.map((o) => o.key)).toContain('Region');
    expect(resolveGroupKey('Region', options, fallback)).toBe('Region');
  });

  test('a URL key that is not an option falls back to the default', () => {
    expect(fallback).toBe('Department');
    expect(resolveGroupKey('Colour', options, fallback)).toBe('Department');
  });

  test('?graphGroup=Stage is used, though Stage is never the default', () => {
    expect(resolveGroupKey('Stage', options, fallback)).toBe('Stage');
    expect(fallback).not.toBe('Stage');
  });

  test('?graphGroup=@target is not an option: it falls back to the default', () => {
    expect(options.map((o) => o.key)).not.toContain('@target');
    expect(resolveGroupKey('@target', options, fallback)).toBe('Department');
  });

  test('?graphGroup=Environment is not an option: it falls back to the default', () => {
    expect(options.map((o) => o.key)).not.toContain('Environment');
    expect(resolveGroupKey('Environment', options, fallback)).toBe('Department');
  });

  test('no URL key gives the default', () => {
    expect(resolveGroupKey(null, options, fallback)).toBe('Department');
    expect(resolveGroupKey(undefined, options, fallback)).toBe('Department');
  });
});
