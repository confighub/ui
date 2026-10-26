// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The refusal RENDERERS, driven directly.
//
// WHY THIS EXISTS. Every other spec here asserts derivation — what a function
// returns. The one real defect in this feature was not in a return value: the
// row renderer and the blocked block both rendered the same refusal, so every
// blocked resource printed its reasons twice. No assertion about the data could
// have seen that, because the data was right. Only rendering it shows it.
//
// NO JSX, DELIBERATELY. Playwright's runner claims JSX in a spec for its own
// component tests, so `<Box/>` here becomes a Playwright object rather than a
// React element and `renderToStaticMarkup` rejects it. `createElement` is the
// way round, and it is why this file reads the way it does.

import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  ChangeOrderBlockedResources,
  ChangeOrderRefusals,
} from '../src/pages/change-orders/changeOrderRefusals';
import { rowRefusals } from '../src/pages/change-orders/changeOrderCard';

const REFUSED = [
  { reason: 'ProtectedPath', blocks: true, resourceName: 'app/api', path: '/spec/replicas' },
];

/** How many times the refusal block appears in the rendered markup. */
function refusalBlockCount(html: string): number {
  return html.split('data-testid="change-order-refusals"').length - 1;
}

test.describe('rendering a refusal', () => {
  test('a blocked resource states its reasons exactly once', () => {
    /*
     * The row renderer already renders the refusals. The block must not render
     * them again — the two share the wording component on purpose, and sharing
     * membership as well printed every reason twice.
     */
    const renderUnit = (unit: { unitId: string }) =>
      createElement(
        'div',
        { 'data-unit': unit.unitId },
        createElement(ChangeOrderRefusals, { conflicts: REFUSED }),
      );

    const html = renderToStaticMarkup(
      createElement(ChangeOrderBlockedResources, { units: [{ unitId: 'api' }], renderUnit }),
    );

    expect(refusalBlockCount(html)).toBe(1);
    expect(html).toContain('A protected field');
    expect(html).toContain('app/api');
    expect(html).toContain('/spec/replicas');
  });

  test('nothing blocked renders nothing at all', () => {
    // The server field may legitimately never carry a refusal. An empty list
    // must leave no heading and no empty box behind.
    const html = renderToStaticMarkup(
      createElement(ChangeOrderBlockedResources, { units: [], renderUnit: () => null }),
    );
    expect(html).toBe('');
  });

  test('a value the target kept is said in plain words, not by its reason code', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeOrderRefusals, {
        conflicts: [{ reason: 'Subtracted', blocks: true, resourceName: 'api', path: 'spec.replicas', targetValue: '6' }],
      }),
    );
    expect(html).toContain('<b>A local override</b> in api keeps spec.replicas at 6.');
    expect(html).not.toContain('Subtracted');
  });

  test('a reason nobody modelled is printed, not swallowed', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeOrderRefusals, {
        conflicts: [{ reason: 'SomeReasonAddedNextYear', blocks: true }],
      }),
    );
    expect(html).toContain('SomeReasonAddedNextYear');
  });

  test('a refusal carrying only free text shows the text', () => {
    // `ReplayFailed` names no resource and no path; its `Details` is the only
    // content it has, and it is displayed as the prose it is, never parsed.
    const html = renderToStaticMarkup(
      createElement(ChangeOrderRefusals, {
        conflicts: [{ reason: 'ReplayFailed', blocks: true, details: 'replay of set-image failed' }],
      }),
    );
    expect(html).toContain('ReplayFailed');
    expect(html).toContain('replay of set-image failed');
  });

  test('only the blocking conflicts reach a row', () => {
    // `ExclusiveCleared` reports the change landing. Rendering it beside a
    // refusal would say the promote did not do something it did.
    expect(
      rowRefusals({
        conflicts: [
          { reason: 'ExclusiveCleared', blocks: false },
          { reason: 'ProtectedPath', blocks: true },
        ],
      }),
    ).toEqual([{ reason: 'ProtectedPath', blocks: true }]);
  });
});
