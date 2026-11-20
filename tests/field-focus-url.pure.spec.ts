// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field diagnosis focus in the Component view URL (PLAN.md U3, contract section 2):
// `unit`, `field`, `fres` (`ResourceType|ResourceName`), `tab=gates`, `gate`.
import { expect, test } from '@playwright/test';

import { applyViewParamsPatch } from '../src/pages/x/apps/appTypes';
import {
  CLOSE_FIELD_PATCH,
  componentFocusHref,
  decodeFres,
  encodeFres,
  gatePatch,
  jumpPatch,
  openFieldPatch,
  readFocus,
  withSpaceChangeClears,
} from '../src/pages/x/apps/field-diagnosis/componentFocus';

test.describe('fres', () => {
  for (const [type, name] of [
    ['apps/v1/Deployment', 'test-ns/web'],
    ['apps/v1/Deployment', 'odd|name'],
    ['odd|type', 'test-ns/web'],
    ['a|b', 'c|d'],
    ['v1/Namespace', ''],
    ['', 'web'],
    ['back\\slash', 'x'],
  ] as const) {
    test(`round trip ${JSON.stringify([type, name])}`, () => {
      const fres = encodeFres(type, name);
      expect(decodeFres(fres)).toEqual({ ResourceType: type || undefined, ResourceName: name || undefined });
      // and through the URL
      const params = new URLSearchParams();
      params.set('fres', fres ?? '');
      expect(decodeFres(new URLSearchParams(params.toString()).get('fres') ?? undefined)).toEqual(decodeFres(fres));
    });
  }

  test('a plain value is Type|Name as the spike wrote it', () => {
    expect(encodeFres('apps/v1/Deployment', 'test-ns/web')).toBe('apps/v1/Deployment|test-ns/web');
  });

  test('no type and no name is no fres', () => {
    expect(encodeFres(undefined, undefined)).toBeUndefined();
    expect(decodeFres(undefined)).toEqual({});
  });
});

test.describe('readFocus', () => {
  test('reads the five params; tab is only gates', () => {
    const p = new URLSearchParams('app=a&space=s&unit=u&field=spec.replicas&fres=T%7CN&tab=gates&gate=g');
    expect(readFocus(p)).toEqual({ unit: 'u', field: 'spec.replicas', fres: 'T|N', tab: 'gates', gate: 'g' });
    expect(readFocus(new URLSearchParams('tab=releases')).tab).toBeUndefined();
    expect(readFocus(new URLSearchParams(''))).toEqual({});
  });
});

test.describe('patches', () => {
  test('open and close a field', () => {
    expect(openFieldPatch('u', 'spec.replicas', 'T|N')).toEqual({ unit: 'u', field: 'spec.replicas', fres: 'T|N', tab: null, gate: null });
    expect(CLOSE_FIELD_PATCH).toEqual({ field: null, fres: null });
  });

  test('a jump names the Space, the Unit and the field, and leaves the Gates tab', () => {
    expect(jumpPatch({ space: 's2', unit: 'u2', field: 'spec.replicas', fres: 'T|N' })).toEqual({
      space: 's2',
      unit: 'u2',
      field: 'spec.replicas',
      fres: 'T|N',
      tab: null,
      gate: null,
    });
  });

  test('a gate opens the Gates tab and closes the field', () => {
    expect(gatePatch('t1')).toEqual({ tab: 'gates', gate: 't1', field: null, fres: null });
  });
});

test.describe('a Space change clears the focus in the same write (decision 5)', () => {
  const live = new URLSearchParams('app=a&space=s1&unit=u&field=f&fres=T%7CN&tab=gates&gate=g');
  const write = (patch: Parameters<typeof withSpaceChangeClears>[1]) =>
    applyViewParamsPatch(new URLSearchParams(live), withSpaceChangeClears(live, patch));

  test('a graph click or the picker (space only) clears unit, field, fres, tab, gate', () => {
    expect(write({ space: 's2', compare: null }).toString()).toBe('app=a&space=s2');
  });

  test('closing the pane (space null) clears them too', () => {
    expect(write({ space: null }).toString()).toBe('app=a');
  });

  test('a jump (space with unit) keeps what it names', () => {
    expect(write(jumpPatch({ space: 's2', unit: 'u2', field: 'f2', fres: 'T|N' })).get('unit')).toBe('u2');
    expect(write(jumpPatch({ space: 's2', unit: 'u2', field: 'f2', fres: 'T|N' })).get('field')).toBe('f2');
  });

  test('the same Space keeps them', () => {
    expect(write({ space: 's1' }).get('field')).toBe('f');
  });

  test('a patch with no space keeps them', () => {
    expect(write({ graphGroup: 'off' }).get('unit')).toBe('u');
  });
});

test.describe('componentFocusHref', () => {
  test('keeps app, viewID, group and filter params, writes the patch', () => {
    const href = componentFocusHref('?app=a&viewID=v&group=g1&group=g2&filterX=1&space=s', jumpPatch({ space: 's2', unit: 'u', field: 'f' }));
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/components');
    expect(url.searchParams.get('app')).toBe('a');
    expect(url.searchParams.get('viewID')).toBe('v');
    expect(url.searchParams.getAll('group')).toEqual(['g1', 'g2']);
    expect(url.searchParams.get('filterX')).toBe('1');
    expect(url.searchParams.get('space')).toBe('s2');
    expect(url.searchParams.get('unit')).toBe('u');
    expect(url.searchParams.get('field')).toBe('f');
  });
});
