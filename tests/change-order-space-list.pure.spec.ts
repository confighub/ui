// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// How the ChangeOrder screens list Spaces: the cap, the count, the Group by choices
// and the filter. A Stage of 54 Spaces must not print 54 near-identical names.

import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { NameList, SameInAllSpaces, SpaceNameList, SpacesMoreButton } from '../src/pages/change-orders/components/SpaceListing';
import { dryRunSentence } from '../src/pages/change-orders/draft/draftPageModel';
import type { DraftPreview } from '../src/pages/change-orders/draft/draftPreview';
import { CopyText, type StageLinks } from '../src/pages/change-orders/stage/StageBoxParts';
import { stageCardCopy } from '../src/pages/change-orders/stage/stageCardCopy';

import {
  buttonName,
  capNames,
  defaultGroupKey,
  filterSpaces,
  groupChoices,
  groupChoiceText,
  groupHeaderText,
  groupSpaces,
  moreText,
  namesText,
  sameInAllText,
  showAllName,
  type ListedSpace,
} from '../src/pages/change-orders/components/spaceListLogic';
import { segmentsText, spaceListSegments } from '../src/pages/change-orders/stage/stageCopyParts';

const REGIONS = ['eu-west', 'eu-central', 'us-east', 'ap-southeast'];
const DEPARTMENTS = ['payments', 'retail'];

/** 54 Spaces like the meridian demo: 4 regions, 2 departments, a distinct Cluster on each. */
function manySpaces(n = 54): ListedSpace[] {
  return Array.from({ length: n }, (_, i) => ({
    spaceId: `id-${i}`,
    name: `cert-manager-${REGIONS[i % REGIONS.length]}-${DEPARTMENTS[i % DEPARTMENTS.length]}-prod${i}`,
    labels: {
      Region: REGIONS[i % REGIONS.length],
      Department: DEPARTMENTS[i % DEPARTMENTS.length],
      Cluster: `cluster-${i}`,
      Stage: 'prod',
    },
  }));
}

test.describe('the cap', () => {
  test('shows three names and counts the rest', () => {
    const { shown, more } = capNames(manySpaces(), 3);
    expect(shown).toHaveLength(3);
    expect(more).toBe(51);
    expect(moreText(more)).toBe('51 more');
  });

  test('a list at the cap has no rest', () => {
    expect(capNames(['a', 'b', 'c'], 3)).toEqual({ shown: ['a', 'b', 'c'], more: 0 });
    expect(capNames([], 3)).toEqual({ shown: [], more: 0 });
  });

  test('the button for the whole list says what it opens', () => {
    expect(showAllName(54)).toBe('Show all 54 Spaces');
    expect(showAllName(1)).toBe('Show all 1 Space');
    expect(showAllName(12, 'Unit')).toBe('Show all 12 Units');
  });
});

test.describe('sentences with the cap', () => {
  test('text reads "a, b, c and 51 more"', () => {
    const names = manySpaces().map((s) => s.name);
    expect(namesText(names)).toBe(`${names[0]}, ${names[1]}, ${names[2]} and 51 more`);
  });

  test('a short list still reads "a, b and c"', () => {
    expect(namesText(['a'])).toBe('a');
    expect(namesText(['a', 'b'])).toBe('a and b');
    expect(namesText(['a', 'b', 'c'])).toBe('a, b and c');
    expect(namesText([])).toBe('');
  });

  test('segments keep three links and one button that holds every Space', () => {
    const spaces = manySpaces().map((s) => ({ spaceId: s.spaceId, name: s.name }));
    const parts = spaceListSegments(spaces);
    expect(parts.filter((p) => p.kind === 'link')).toHaveLength(3);
    const button = parts.filter((p) => p.kind === 'spaces');
    expect(button).toHaveLength(1);
    expect(button[0].kind === 'spaces' && button[0].spaces).toHaveLength(54);
    expect(segmentsText(parts)).toBe(`${spaces[0].name}, ${spaces[1].name}, ${spaces[2].name} and 51 more`);
  });

  test('segments of a short list have no button', () => {
    const spaces = manySpaces(3).map((s) => ({ spaceId: s.spaceId, name: s.name }));
    const parts = spaceListSegments(spaces);
    expect(parts.some((p) => p.kind === 'spaces')).toBe(false);
    expect(parts.filter((p) => p.kind === 'link')).toHaveLength(3);
  });
});

test.describe('exceptions by name, the rest as a count', () => {
  test('a group where every Space took the same change is a count', () => {
    expect(sameInAllText(54)).toBe('Same in all 54 Spaces');
    expect(sameInAllText(1)).toBe('Same in all 1 Space');
  });
});

test.describe('Group by', () => {
  test('offers labels that give more than one group and fewer groups than Spaces', () => {
    const choices = groupChoices(manySpaces());
    // Cluster is different on every Space and Stage is one value on all of them.
    expect(choices.map((c) => c.key)).toEqual(['Region', 'Department']);
    expect(choices.find((c) => c.key === 'Region')?.valueCount).toBe(4);
    expect(groupChoiceText({ key: 'Region', valueCount: 4 })).toBe('Region · 4 values');
  });

  test('offers nothing for Spaces with no labels', () => {
    expect(groupChoices([{ spaceId: 'a', name: 'a' }, { spaceId: 'b', name: 'b' }])).toEqual([]);
  });

  test('a Space with no value counts as one more group', () => {
    const spaces: ListedSpace[] = [
      { spaceId: 'a', name: 'a', labels: { Zone: 'x' } },
      { spaceId: 'b', name: 'b', labels: { Zone: 'x' } },
      { spaceId: 'c', name: 'c' },
    ];
    expect(groupChoices(spaces)).toEqual([{ key: 'Zone', valueCount: 2 }]);
  });

  test('the default is Region when it exists, otherwise none', () => {
    expect(defaultGroupKey(groupChoices(manySpaces()))).toBe('Region');
    const noRegion = manySpaces().map((s) => ({ ...s, labels: { Department: s.labels?.Department ?? '' } }));
    expect(defaultGroupKey(groupChoices(noRegion))).toBeNull();
  });

  test('Region comes first in the choices, whatever its case', () => {
    const spaces: ListedSpace[] = ['a', 'b', 'c', 'd'].map((name, i) => ({
      spaceId: name,
      name,
      labels: { Cluster: `c${i % 2}`, region: `r${i % 2}` },
    }));
    expect(groupChoices(spaces).map((c) => c.key)).toEqual(['region', 'Cluster']);
    expect(defaultGroupKey(groupChoices(spaces))).toBe('region');
  });

  test('groups by value, with headers that count Spaces', () => {
    const groups = groupSpaces(manySpaces(54), 'Region');
    expect(groups.map((g) => g.value)).toEqual(['ap-southeast', 'eu-central', 'eu-west', 'us-east']);
    expect(groups.reduce((n, g) => n + g.spaces.length, 0)).toBe(54);
    expect(groupHeaderText(groups[0])).toBe('ap-southeast · 13 Spaces');
    expect(groupHeaderText({ id: 'x', value: 'eu-west', spaces: [manySpaces()[0]] })).toBe('eu-west · 1 Space');
  });

  test('Spaces with no value go last, to an Other group', () => {
    const spaces: ListedSpace[] = [
      { spaceId: 'a', name: 'a', labels: { Region: 'us' } },
      { spaceId: 'b', name: 'b' },
      { spaceId: 'c', name: 'c', labels: { Region: '  ' } },
      { spaceId: 'd', name: 'd', labels: { Region: 'eu' } },
    ];
    const groups = groupSpaces(spaces, 'Region');
    expect(groups.map((g) => g.value)).toEqual(['eu', 'us', null]);
    expect(groupHeaderText(groups[2])).toBe('Other · 2 Spaces');
    expect(groups[2].spaces.map((s) => s.name)).toEqual(['b', 'c']);
  });

  test('two spellings of one value are one group', () => {
    const spaces: ListedSpace[] = [
      { spaceId: 'a', name: 'a', labels: { Region: 'EU' } },
      { spaceId: 'b', name: 'b', labels: { Region: 'eu' } },
    ];
    expect(groupSpaces(spaces, 'Region')).toHaveLength(1);
  });

  test('None is one flat list by name', () => {
    const groups = groupSpaces([{ spaceId: 'b', name: 'b' }, { spaceId: 'a', name: 'a' }], null);
    expect(groups).toHaveLength(1);
    expect(groups[0].spaces.map((s) => s.name)).toEqual(['a', 'b']);
    expect(groupSpaces([], null)).toEqual([]);
  });
});

test.describe('the filter', () => {
  test('matches a name, ignoring case', () => {
    const found = filterSpaces(manySpaces(), 'EU-WEST');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((s) => s.name.includes('eu-west'))).toBe(true);
  });

  test('matches a label value too', () => {
    expect(filterSpaces(manySpaces(54), 'cluster-7')).toHaveLength(1);
    expect(filterSpaces(manySpaces(54), 'retail').length).toBe(27);
  });

  test('an empty filter keeps every Space, and a miss keeps none', () => {
    expect(filterSpaces(manySpaces(), '  ')).toHaveLength(54);
    expect(filterSpaces(manySpaces(), 'no-such-space')).toEqual([]);
  });
});

// No JSX in a spec: Playwright claims it for component tests, so `createElement` builds the tree.
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

test.describe('the drawn list', () => {
  test('names three Spaces and a button that opens all 54', () => {
    const html = render(createElement(SpaceNameList, { spaces: manySpaces().map(({ spaceId, name }) => ({ spaceId, name })) }));
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain('aria-label="+51 more: Show all 54 Spaces"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('+51 more');
    expect(html).not.toContain('cert-manager-us-east-payments-prod50');
  });

  test('a list of three has every name and no button', () => {
    const html = render(createElement(SpaceNameList, { spaces: manySpaces(3).map(({ spaceId, name }) => ({ spaceId, name })) }));
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).not.toContain('more');
    expect(html).not.toContain('<button');
  });

  test('plain names are text, not links', () => {
    const html = render(createElement(SpaceNameList, { spaces: manySpaces(2).map(({ spaceId, name }) => ({ spaceId, name })), plain: true }));
    expect(html).not.toContain('<a ');
  });

  test('a group of Spaces that took the same change is a count with one button', () => {
    const html = render(createElement(SameInAllSpaces, { spaces: manySpaces().map(({ spaceId, name }) => ({ spaceId, name })) }));
    expect(html).toContain('Same in all 54 Spaces');
    expect(html).toContain('aria-label="See the Spaces: Show all 54 Spaces"');
    expect(html).not.toContain('cert-manager-eu-west');
  });
});

test.describe('agreement between choices and groups', () => {
  test('two spellings of one value count once in the choice, as they group once', () => {
    const spaces: ListedSpace[] = [
      { spaceId: 'a', name: 'a', labels: { Region: 'EU' } },
      { spaceId: 'b', name: 'b', labels: { Region: 'eu' } },
      { spaceId: 'c', name: 'c', labels: { Region: 'us' } },
      { spaceId: 'd', name: 'd', labels: { Region: 'us' } },
    ];
    expect(groupChoices(spaces)).toEqual([{ key: 'Region', valueCount: 2 }]);
    expect(groupSpaces(spaces, 'Region')).toHaveLength(2);
  });

  test('a label that is the same word in different case on every Space is no choice', () => {
    const spaces: ListedSpace[] = ['A', 'a', 'A'].map((value, i) => ({ spaceId: `${i}`, name: `${i}`, labels: { Zone: value } }));
    expect(groupChoices(spaces)).toEqual([]);
  });
});

test.describe('the count text and the button name', () => {
  test('"all" is said only when the group is the whole stage', () => {
    expect(sameInAllText(50, true)).toBe('Same in all 50 Spaces');
    expect(sameInAllText(50, false)).toBe('Same in 50 Spaces');
  });

  test('the accessible name starts from the visible words', () => {
    expect(buttonName('+51 more', 54)).toBe('+51 more: Show all 54 Spaces');
    expect(buttonName('Show all 54 Spaces', 54)).toBe('Show all 54 Spaces');
    expect(buttonName('55 Spaces', 55)).toBe('Show all 55 Spaces');
    expect(buttonName('+2 more', 55, 'Unit')).toBe('+2 more: Show all 55 Units');
  });
});

// The wiring CI guards: the lists the Stage card and the draft build, drawn as the app draws them.
// Each case names 54 Spaces and must show three names and a button, never a run-on of 54.
test.describe('the real sentences with 54 Spaces', () => {
  const named = manySpaces(54).map(({ spaceId, name }) => ({ spaceId, name }));
  const links: StageLinks = {
    resolvers: { hrefForStage: (stageId) => `/stages/${stageId}`, groupKindOf: () => undefined },
    onField: () => undefined,
    onDiff: () => undefined,
  };
  const lastName = named[53].name;

  function expectCapped(html: string) {
    expect(html.match(/<a /g)).toHaveLength(3);
    // In a sentence the button reads "and 51 more".
    expect(html).toContain('>51 more<');
    expect(html).toContain('aria-label="51 more: Show all 54 Spaces"');
    expect(html).not.toContain(lastName);
    // No run-on string of names: only three of the 54 appear.
    expect(named.filter((space) => html.includes(space.name))).toHaveLength(3);
  }

  test('a failing gate: failedIn into spaceListSegments into CopyText', () => {
    expectCapped(render(createElement(CopyText, { parts: spaceListSegments(named), links })));
  });

  test('the gate reason, "could not plan" and "holds none" sentences', () => {
    const { body, problem } = stageCardCopy;
    for (const parts of [body.gateReasonIn('Has no live status.', named), problem.unplanned(named), problem.noResources(named), problem.unreadable(named)]) {
      expectCapped(render(createElement(CopyText, { parts, links })));
    }
  });

  test('a draft caption "In dev, prod-eu" caps its names', () => {
    const html = render(createElement(NameList, { names: named.map((space) => space.name) }));
    expect(html).toContain('+51 more');
    expect(named.filter((space) => html.includes(space.name))).toHaveLength(3);
    expect(html).not.toContain(lastName);
  });

  test('the draft dry-run sentence for the live region names three and counts the rest', () => {
    const outliers = named.map((space) => ({ spaceId: space.spaceId, name: space.name, text: 'x' }));
    const preview = { totals: { same: 0, variants: 54 }, outliers, stages: [], status: 'ready' } as unknown as DraftPreview;
    const sentence = dryRunSentence(preview, named.map((space) => space.name));
    expect(sentence).toContain('51 more');
    expect(sentence).not.toContain(lastName);
    expect(named.filter((space) => sentence.includes(space.name))).toHaveLength(3);
  });
});

test.describe('the Scope count in the ChangeOrder header', () => {
  test('is the shared button: its own test id, the count as its text, a name that says what opens', () => {
    const html = render(
      createElement(SpacesMoreButton, { spaces: manySpaces(104).map(({ spaceId, name }) => ({ spaceId, name })), testId: 'change-order-scope-spaces' }, '104 Spaces'),
    );
    expect(html).toContain('data-testid="change-order-scope-spaces"');
    expect(html).toContain('aria-label="Show all 104 Spaces"');
    expect(html).toContain('>104 Spaces<');
    expect(html).not.toContain('cert-manager-eu-west');
  });
});
