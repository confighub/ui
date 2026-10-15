// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The unit detail page's Resources tab selection, which another page sets through the URL to
// open the tab on the resource it is about.
import { expect, test } from '@playwright/test';

import {
  readResourceView,
  readSelectedResource,
  unitResourceHref,
  writeResourceView,
} from '../src/pages/unit-detail/unitDetailHrefs';

test('a resource link opens the Resources tab on that resource', () => {
  const href = unitResourceHref('s', 'u', 'r');
  expect(href).toBe('/units/s/u?tab=5&resource=r');
  expect(readSelectedResource(new URLSearchParams(href.split('?')[1]))).toBe('r');
});

test('without a resource the link leaves the parameter out', () => {
  expect(unitResourceHref('s', 'u')).toBe('/units/s/u?tab=5');
  expect(readSelectedResource(new URLSearchParams('tab=5'))).toBe('');
});

test('the Overview is the default and only the YAML view is written', () => {
  const params = new URLSearchParams('tab=5');
  expect(readResourceView(params)).toBe('overview');
  writeResourceView(params, 'yaml');
  expect(params.toString()).toBe('tab=5&resourceView=yaml');
  expect(readResourceView(params)).toBe('yaml');
  writeResourceView(params, 'overview');
  expect(params.toString()).toBe('tab=5');
});
