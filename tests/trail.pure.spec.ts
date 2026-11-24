// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The trail: the pages visited in this tab, shown after the organization on
 * each page. It is the order of visits, with no hierarchy. A page visited again
 * moves to the end, so the last crumb is the page on screen and nothing is lost
 * by going back. A plain click on a link to a page of the app stays in the tab;
 * a modified click is the browser's, which opens a new tab.
 */
import { expect, test } from '@playwright/test';

import { crumbs } from '../src/components/trail/crumbs';
import { EMPTY_TRAIL, PageCrumb, TRAIL_MAX, TrailState, crumbName, crumbsThatFit, parseTrail, trailReducer } from '../src/components/trail/trail';
import { sameTabTarget } from '../src/components/trail/useSameTabLinks';

const page = (key: string, label = key): PageCrumb => ({ key, kind: 'unit', label });
const visit = (state: TrailState, key: string, href = key, replacedKey?: string) =>
  trailReducer(state, { type: 'visit', page: page(key), href, replacedKey });
const keys = (state: TrailState) => state.crumbs.map((c) => c.key);

test.describe('the order of the trail', () => {
  test('a new page goes to the end', () => {
    const trail = ['/a', '/b', '/c'].reduce((s, k) => visit(s, k), EMPTY_TRAIL);
    expect(keys(trail)).toEqual(['/a', '/b', '/c']);
  });

  test('a page visited again moves to the end, and the others stay', () => {
    let trail = ['/a', '/b', '/c'].reduce((s, k) => visit(s, k), EMPTY_TRAIL);
    trail = visit(trail, '/a');
    expect(keys(trail)).toEqual(['/b', '/c', '/a']);
    trail = visit(trail, '/d');
    expect(keys(trail)).toEqual(['/b', '/c', '/a', '/d']);
  });

  test('a change of the query on the same page updates its crumb in place', () => {
    let trail = visit(visit(EMPTY_TRAIL, '/a'), '/b', '/b?tab=1');
    trail = visit(trail, '/b', '/b?tab=2');
    expect(trail.crumbs).toHaveLength(2);
    expect(trail.crumbs[1].href).toBe('/b?tab=2');
  });

  test('a page that a redirect or a delete replaced leaves no crumb', () => {
    let trail = visit(visit(EMPTY_TRAIL, '/a'), '/change-orders/web');
    trail = visit(trail, '/change-orders/space/web', '/change-orders/space/web', '/change-orders/web');
    expect(keys(trail)).toEqual(['/a', '/change-orders/space/web']);
  });

  test('the trail keeps the most recent pages', () => {
    let trail = EMPTY_TRAIL;
    for (let i = 0; i < TRAIL_MAX + 5; i++) trail = visit(trail, `/p${i}`);
    expect(trail.crumbs).toHaveLength(TRAIL_MAX);
    expect(trail.crumbs[0].key).toBe('/p5');
  });
});

test.describe('the name of a crumb', () => {
  test('a page gives its name, before or after its visit is recorded', () => {
    let trail = trailReducer(EMPTY_TRAIL, { type: 'name', key: '/units/s/u', name: 'prod/web' });
    trail = visit(trail, '/units/s/u');
    expect(crumbName(trail, trail.crumbs[0])).toBe('prod/web');
    trail = trailReducer(trail, { type: 'name', key: '/units/s/u', name: 'prod/api' });
    expect(crumbName(trail, trail.crumbs[0])).toBe('prod/api');
  });

  test('without a name, or with it cleared, the crumb shows what the route gives', () => {
    let trail = trailReducer(EMPTY_TRAIL, { type: 'visit', page: { key: '/x', kind: 'unit', label: 'Unit' }, href: '/x' });
    expect(crumbName(trail, trail.crumbs[0])).toBe('Unit');
    trail = trailReducer(trailReducer(trail, { type: 'name', key: '/x', name: 'web' }), { type: 'name', key: '/x', name: '' });
    expect(crumbName(trail, trail.crumbs[0])).toBe('Unit');
  });

  test('a name goes when its page leaves the trail', () => {
    let trail = trailReducer(visit(EMPTY_TRAIL, '/a'), { type: 'name', key: '/a', name: 'A' });
    trail = visit(trail, '/b', '/b', '/a');
    expect(trail.names).toEqual({});
  });
});

test.describe('the stored trail', () => {
  test('pages visited before the stored trail is read come after it', () => {
    const stored = ['/a', '/b'].reduce((s, k) => visit(s, k), EMPTY_TRAIL);
    const trail = trailReducer(visit(EMPTY_TRAIL, '/b', '/b?tab=2'), { type: 'restore', stored });
    expect(keys(trail)).toEqual(['/a', '/b']);
    expect(trail.crumbs[1].href).toBe('/b?tab=2');
  });

  test('anything that is not a trail reads as the empty trail', () => {
    expect(parseTrail(null)).toEqual(EMPTY_TRAIL);
    expect(parseTrail('not json')).toEqual(EMPTY_TRAIL);
    expect(parseTrail('{"crumbs":"x"}')).toEqual(EMPTY_TRAIL);
    // An address that is not a path of this app is dropped.
    const raw = JSON.stringify({ crumbs: [{ key: '/a', kind: 'unit', label: 'a', href: 'https://example.com' }, { key: '/b', kind: 'unit', label: 'b', href: '/b' }], names: {} });
    expect(keys(parseTrail(raw))).toEqual(['/b']);
  });
});

test.describe('what counts as one page', () => {
  const q = (s = '') => new URLSearchParams(s);

  test('a ChangeOrder is one page whatever stage is open', () => {
    const a = crumbs.changeOrder({ space: 'prod', slug: 'bump', stage: 'test' }, q());
    const b = crumbs.changeOrder({ space: 'prod', slug: 'bump' }, q());
    expect(a).toEqual(b);
    expect(a).toEqual({ key: '/change-orders/prod/bump', kind: 'changeOrder', label: 'bump' });
    expect(crumbs.changeOrder({}, q())?.label).toBe('ChangeOrders');
  });

  test('each Component is its own page, and the list is another', () => {
    expect(crumbs.components({}, q())).toEqual({ key: '/components', kind: 'component', label: 'Components' });
    expect(crumbs.components({}, q('app=web&space=s1&tab=gates'))).toEqual({ key: '/components?app=web', kind: 'component', label: 'web' });
    expect(crumbs.components({}, q('app=api'))?.key).not.toBe(crumbs.components({}, q('app=web'))?.key);
  });

  test('an address that holds an id shows the name of the type until the page names it', () => {
    expect(crumbs.unit({ spaceID: 's1', id: 'u1' }, q())).toEqual({ key: '/units/s1/u1', kind: 'unit', label: 'Unit' });
    expect(crumbs.space({ id: 's1' }, q())?.label).toBe('Space');
    expect(crumbs.changeWorkflow({ changeWorkflowId: 'w1' }, q())?.label).toBe('ChangeWorkflow');
  });

  test('a list and one of its entries are two pages', () => {
    expect(crumbs.channel({}, q())?.key).toBe('/channels');
    expect(crumbs.channel({ space: 'prod', slug: 'argo' }, q())).toEqual({ key: '/channels/prod/argo', kind: 'channel', label: 'argo' });
    expect(crumbs.serviceAccount({ slug: 'bot' }, q())?.label).toBe('bot');
    expect(crumbs.changeSet({ space: 'prod', slug: 'cs' }, q())?.label).toBe('cs');
  });

  test('an address that only redirects has no crumb', () => {
    expect(crumbs.none()).toBeNull();
  });
});

test.describe('how many crumbs a bar shows', () => {
  test('a trail that fits is shown whole, with no menu', () => {
    expect(crumbsThatFit([100, 100, 100], 300, 50)).toBe(3);
    expect(crumbsThatFit([], 300, 50)).toBe(0);
  });

  test('a trail longer than the bar loses its oldest crumbs first, and leaves room for the menu', () => {
    // 100 + 100 + 100 + 100 does not fit in 350; with the menu's 50, three of the newest do.
    expect(crumbsThatFit([100, 100, 100, 100], 350, 50)).toBe(3);
    expect(crumbsThatFit([100, 100, 100, 100], 349, 50)).toBe(2);
    // A wide old crumb does not cost a newer one its place.
    expect(crumbsThatFit([300, 80, 80], 250, 50)).toBe(2);
  });

  test('the page on screen is always shown', () => {
    expect(crumbsThatFit([100, 400], 200, 50)).toBe(1);
    expect(crumbsThatFit([100, 100], 0, 50)).toBe(1);
  });
});

test.describe('a click on a link', () => {
  const origin = 'https://hub.example.com';
  const base = `${origin}/units`;
  const plain = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const link = (href: string | null, download = false) => ({ href, download });
  const target = (click: Partial<typeof plain>, l: { href: string | null; download: boolean }) => sameTabTarget({ ...plain, ...click }, l, origin, base);

  test('a plain click on a link to a page of the app stays in the tab', () => {
    expect(target({}, link('/units/s1/u1?tab=2#x'))).toBe('/units/s1/u1?tab=2#x');
    expect(target({}, link(`${origin}/spaces/s1`))).toBe('/spaces/s1');
  });

  test('a modified click, or another button, is left to the browser, which opens a new tab or window', () => {
    for (const click of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(target(click, link('/units/s1/u1'))).toBeNull();
    }
  });

  test('a link to another site, a download, and a link already handled are left alone', () => {
    expect(target({}, link('https://docs.confighub.com/'))).toBeNull();
    expect(target({}, link('mailto:someone@example.com'))).toBeNull();
    expect(target({}, link('/units/s1/u1', true))).toBeNull();
    expect(target({}, link('/api/space'))).toBeNull();
    expect(target({}, link('#section'))).toBeNull();
    expect(target({}, link(null))).toBeNull();
    expect(target({ defaultPrevented: true }, link('/units/s1/u1'))).toBeNull();
  });
});
