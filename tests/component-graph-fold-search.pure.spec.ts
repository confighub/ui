// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Canvas search on a folded Component graph must say where a Deployment
// lives before the user jumps to it, because a folded Deployment has no card
// on screen until its stack opens.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import { searchDeployments } from '../src/pages/x/apps/flow-graph/fold/canvasSearch';
import { SEARCH_MAX_RESULTS } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  type FoldModel,
  buildFoldModel,
  foldMembers,
} from '../src/pages/x/apps/flow-graph/fold/foldModel';
import { defaultGroupKey } from '../src/pages/x/apps/flow-graph/fold/groupBy';
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
