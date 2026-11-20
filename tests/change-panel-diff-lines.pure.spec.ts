// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The change panel's readable diff (D5): each changed field is named in plain words (the field,
// and where it is), and a long value is split where it changes, so ":2.14.0" and "@sha256:…"
// read as whole parts.
import { expect, test } from '@playwright/test';

import { diffResources, plainField, splitChange } from '../src/components/change-panel/diffLines';

test('a field is named by its name and where it is', () => {
  expect(plainField('spec.replicas')).toEqual({ field: 'replicas', location: '' });
  expect(plainField('spec.template.spec.containers.?name=checkout-api;@0.image')).toEqual({ field: 'image', location: 'container checkout-api' });
  expect(plainField('spec.template.spec.containers.?name=checkout-api;@0.env.?name=LOG_LEVEL;@0.value')).toEqual({
    field: 'LOG_LEVEL',
    location: 'env of container checkout-api',
  });
  expect(plainField('metadata.labels.app~1kubernetes~1io/part-of')).toEqual({ field: 'app.kubernetes.io/part-of', location: 'labels' });
});

test('a long value splits where it changes, at a separator', () => {
  expect(splitChange('ghcr.io/confighubai/checkout-api:2.14.0', 'ghcr.io/confighubai/checkout-api@sha256:9f86d0')).toEqual({
    same: 'ghcr.io/confighubai/checkout-api',
    oldPart: ':2.14.0',
    newPart: '@sha256:9f86d0',
  });
});

test('a Unit diff becomes one line per changed field, context left out', () => {
  const resources = diffResources({
    Resources: [
      {
        ChangeType: 'Update',
        Resource: { ResourceType: 'apps/v1/Deployment', ResourceNameWithoutScope: 'checkout-api' },
        Changes: [
          { ChangeType: 'Update', Path: 'spec.replicas', FromValue: '1', ToValue: '3' },
          { ChangeType: 'None', Path: 'spec.selector', FromValue: 'x', ToValue: 'x' },
        ],
      },
      { ChangeType: 'None', Resource: { ResourceType: 'v1/Service', ResourceNameWithoutScope: 'checkout-api' } },
    ],
  });
  expect(resources).toEqual([
    { label: 'apps/v1/Deployment checkout-api', kind: 'Deployment', lines: [{ key: '0.0', field: 'replicas', location: '', from: '1', to: '3' }] },
  ]);
});
