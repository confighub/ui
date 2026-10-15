// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A resource's name as the resource views show it.
import { expect, test } from '@playwright/test';

import { resourceDisplayName } from '../src/utility/resource-type-functions';

test('a Kubernetes resource without a namespace is shown without the leading slash', () => {
  expect(resourceDisplayName('/web', 'Kubernetes/YAML')).toBe('web');
});

test('a Kubernetes resource with a namespace keeps it', () => {
  expect(resourceDisplayName('shop/web', 'Kubernetes/YAML')).toBe('shop/web');
});

test('other toolchains keep the name as it is', () => {
  expect(resourceDisplayName('/app', 'AppConfig/Properties')).toBe('/app');
  expect(resourceDisplayName('/web', undefined)).toBe('/web');
});
