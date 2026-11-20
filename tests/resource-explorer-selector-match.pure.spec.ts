// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import {
  isSelectorMatch,
  selectorMatchDirection,
  selectorMatchLabel,
  selectorMatchParams,
} from '../src/pages/x/resource-explorer/selectorMatch';

test('a selector narrows to what it selects, a workload to what selects it, and other kinds not at all', () => {
  expect(selectorMatchDirection('networking.k8s.io/v1/NetworkPolicy', 'Kubernetes/YAML')).toBe(
    'selectedBy',
  );
  expect(selectorMatchDirection('policy/v1/PodDisruptionBudget', undefined)).toBe(
    'selectedBy',
  );
  expect(selectorMatchDirection('v1/Service', 'Kubernetes/YAML')).toBe('selectedBy');
  expect(selectorMatchDirection('apps/v1/Deployment', 'Kubernetes/YAML')).toBe('selecting');
  expect(selectorMatchDirection('batch/v1/CronJob', 'Kubernetes/YAML')).toBe('selecting');
  expect(selectorMatchDirection('v1/ConfigMap', 'Kubernetes/YAML')).toBeUndefined();
  // Only Kubernetes resources are matched by selector.
  expect(selectorMatchDirection('v1/Service', 'ConfigHub/YAML')).toBeUndefined();
});

test('the match becomes one list parameter, and only a whole one is read from a URL', () => {
  const match = {
    direction: 'selectedBy' as const,
    resourceId: 'resource-1',
    resourceType: 'networking.k8s.io/v1/NetworkPolicy',
    resourceName: 'shop/web-ingress',
    unit: 'platform/netpols',
  };
  expect(selectorMatchParams(match)).toEqual({ selectedBy: 'resource-1' });
  expect(selectorMatchParams({ ...match, direction: 'selecting' })).toEqual({
    selecting: 'resource-1',
  });
  expect(selectorMatchParams(undefined)).toEqual({});
  expect(selectorMatchLabel(match)).toBe(
    'Workloads selected by NetworkPolicy shop/web-ingress in platform/netpols',
  );

  expect(isSelectorMatch(JSON.parse(JSON.stringify(match)))).toBe(true);
  // A malformed match in a hand-edited URL is dropped, not sent.
  expect(isSelectorMatch({ ...match, direction: 'sideways' })).toBe(false);
  expect(isSelectorMatch({ ...match, resourceId: '' })).toBe(false);
  expect(isSelectorMatch({ direction: 'selecting', resourceId: 'x' })).toBe(false);
  expect(isSelectorMatch(undefined)).toBe(false);
});
