// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Comparing Units in the View explorer, without a browser: the `compare`
 * link parameter, the slot operations, the column labels, and what the
 * Unit picker suggests and finds.
 */
import { expect, test } from '@playwright/test';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { cutPathLeft, mergeSingleChildFolders } from '../src/pages/x/apps/compare/compareTree';
import type { CompareRow } from '../src/pages/x/apps/compare/deploymentCompareModel';
import { columnLabels, slotMeta, slugsDiffer } from '../src/pages/x/view-explorer/compare/columns';
import { buildPickerSections, innermostGroup, searchUnits, suggestForEmptySlot, upstreamAhead } from '../src/pages/x/view-explorer/compare/suggest';
import { buildGroupTree, type GroupLevel } from '../src/pages/x/view-explorer/model/grouping';
import {
  MAX_COMPARE_SLOTS,
  addSlot,
  decodeCompareParam,
  encodeCompareParam,
  fillNextSlot,
  removeSlot,
  reorderSlots,
  replaceSlot,
  swapFirstTwo,
} from '../src/pages/x/view-explorer/model/compare';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface UnitInput {
  n: number;
  slug: string;
  space: string;
  target?: string;
  head?: number;
  upstream?: number;
  upstreamRev?: number;
  displayName?: string;
}

function unit({ n, slug, space, target, head = 1, upstream, upstreamRev, displayName }: UnitInput): ExtendedUnitRead {
  return {
    Unit: {
      UnitID: uuid(n),
      Slug: slug,
      SpaceID: `space-${space}`,
      HeadRevisionNum: head,
      UpstreamUnitID: upstream === undefined ? undefined : uuid(upstream),
      UpstreamRevisionNum: upstreamRev,
      DisplayName: displayName,
    } as ExtendedUnitRead['Unit'],
    Space: { SpaceID: `space-${space}`, Slug: space } as ExtendedUnitRead['Space'],
    Target: target ? ({ TargetID: `t-${target}`, Slug: target } as ExtendedUnitRead['Target']) : undefined,
  };
}

test.describe('the compare parameter', () => {
  test('round-trips UnitIDs in slot order', () => {
    const ids = [uuid(3), uuid(1), uuid(2)];
    expect(encodeCompareParam(ids)).toBe(ids.join(','));
    expect(decodeCompareParam(encodeCompareParam(ids))).toEqual({ ids, invalid: 0, duplicates: 0, overflow: 0 });
  });

  test('drops what is not a UnitID, repeats, and anything past the fifth, and counts each apart', () => {
    const raw = [uuid(1), 'nope', uuid(1), ` ${uuid(2)} `, uuid(3), uuid(4), uuid(5), uuid(6), uuid(7), 'x', uuid(2), ''].join(',');
    expect(decodeCompareParam(raw)).toEqual({ ids: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)], invalid: 2, duplicates: 2, overflow: 2 });
  });

  test('reads as empty when absent or blank', () => {
    const none = { ids: [], invalid: 0, duplicates: 0, overflow: 0 };
    expect(decodeCompareParam(null)).toEqual(none);
    expect(decodeCompareParam('')).toEqual(none);
    expect(decodeCompareParam(',,')).toEqual(none);
  });

  test('is not fooled by case', () => {
    expect(decodeCompareParam(`${uuid(1).toUpperCase()},${uuid(1)}`)).toEqual({ ids: [uuid(1)], invalid: 0, duplicates: 1, overflow: 0 });
  });
});

test.describe('slots', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];

  test('add to the next slot, never hold a Unit twice, and stop at five', () => {
    expect(addSlot(['a'], 'b')).toEqual(['a', 'b']);
    const held = ['a', 'b'];
    expect(addSlot(held, 'a')).toBe(held);
    expect(MAX_COMPARE_SLOTS).toBe(5);
    expect(addSlot(five, 'f')).toBe(five);
  });

  test('say which slot a Unit went to, which already holds it, or that all are in use', () => {
    expect(fillNextSlot(['a'], 'b')).toEqual({ ids: ['a', 'b'], result: { kind: 'added', letter: 'B' } });
    expect(fillNextSlot(['a', 'b'], 'b').result).toEqual({ kind: 'held', letter: 'B' });
    expect(fillNextSlot(five, 'f').result).toEqual({ kind: 'full' });
  });

  test('clear and shift the rest left', () => {
    expect(removeSlot(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    const ids = ['a'];
    expect(removeSlot(ids, 'z')).toBe(ids);
  });

  test('swap A and B, and swap two slots on a drag', () => {
    expect(swapFirstTwo(['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
    expect(swapFirstTwo(['a'])).toEqual(['a']);
    expect(reorderSlots(['a', 'b', 'c'], 0, 2)).toEqual(['c', 'b', 'a']);
    const ids = ['a', 'b'];
    expect(reorderSlots(ids, 0, 5)).toBe(ids);
  });

  test('replace a filled slot, trading places with a Unit already held', () => {
    expect(replaceSlot(['a', 'b', 'c'], 1, 'z')).toEqual(['a', 'z', 'c']);
    expect(replaceSlot(['a', 'b', 'c'], 0, 'c')).toEqual(['c', 'b', 'a']);
    const ids = ['a', 'b'];
    expect(replaceSlot(ids, 4, 'z')).toBe(ids);
  });
});

test.describe('column labels', () => {
  const prodFront = unit({ n: 1, slug: 'frontend', space: 'prod', target: 'k8s-prod', head: 34 });
  const devFront = unit({ n: 2, slug: 'frontend', space: 'dev' });
  const prodHistory = unit({ n: 3, slug: 'history', space: 'prod' });

  test('name the Space when the slug is shared', () => {
    expect(columnLabels([prodFront, devFront])).toEqual(['prod', 'dev']);
    expect(slugsDiffer([prodFront, devFront])).toBe(false);
  });

  test('name the slug when the Space is shared', () => {
    expect(columnLabels([prodFront, prodHistory])).toEqual(['frontend', 'history']);
    expect(slugsDiffer([prodFront, prodHistory])).toBe(true);
  });

  test('name both otherwise', () => {
    expect(columnLabels([devFront, prodHistory])).toEqual(['frontend · dev', 'history · prod']);
  });

  test('a slot names its Space, its Target and its revision', () => {
    expect(slotMeta(prodFront)).toEqual({ place: 'prod · k8s-prod', rev: 'rev 34' });
    expect(slotMeta(devFront)).toEqual({ place: 'dev', rev: 'rev 1' });
  });
});

test.describe('the picker', () => {
  const base = unit({ n: 1, slug: 'frontend', space: 'nonprod', upstream: 9, upstreamRev: 34 });
  const prod = unit({ n: 2, slug: 'frontend', space: 'prod' });
  const eu = unit({ n: 3, slug: 'frontend', space: 'eu-prod' });
  const history = unit({ n: 4, slug: 'history', space: 'nonprod', target: 'k8s-nonprod' });
  const matching = unit({ n: 5, slug: 'matching', space: 'nonprod', displayName: 'Task matching' });
  const upstream = unit({ n: 9, slug: 'frontend', space: 'base', head: 41 });
  const universe = [base, prod, eu, history, matching, upstream];

  test('offers the same slug in other Spaces, then the upstream, then the group, each Unit once', () => {
    const sections = buildPickerSections({
      base,
      universe,
      group: { value: 'nonprod', rows: [base, history, matching] },
      taken: [uuid(1)],
    });
    // The upstream shares the slug, and is offered once: as the upstream, which says how far ahead it is.
    expect(sections.map((s) => s.id)).toEqual(['same-slug', 'upstream', 'group']);
    expect(sections[0].options.map((o) => o.row.Space?.Slug)).toEqual(['eu-prod', 'prod']);
    expect(sections[1].options.map((o) => o.id)).toEqual([uuid(9)]);
    expect(sections[2].hint).toBe('nonprod');
    expect(sections[2].options.map((o) => o.row.Unit?.Slug)).toEqual(['history', 'matching']);
  });

  test('leaves out sections with nothing to offer, and a group when the view is not grouped', () => {
    const lone = unit({ n: 20, slug: 'lone', space: 'x' });
    expect(buildPickerSections({ base: lone, universe: [lone, history], taken: [] })).toEqual([]);
    const withUpstream = buildPickerSections({ base, universe: [base, upstream], taken: [] });
    expect(withUpstream.map((s) => s.id)).toEqual(['upstream']);
    // An upstream the page has not loaded (not visible to the viewer) has no section.
    expect(buildPickerSections({ base, universe: [base, prod], taken: [] }).map((s) => s.id)).toEqual(['same-slug']);
  });

  test('offers an upstream of another slug in its own section', () => {
    const other = unit({ n: 9, slug: 'frontend-base', space: 'base', head: 41 });
    const sections = buildPickerSections({ base, universe: [base, other], taken: [] });
    expect(sections.map((s) => s.id)).toEqual(['upstream']);
    expect(upstreamAhead(base, other)).toBe(7);
  });

  test('marks Units already in a slot with their letter, and suggests the first free one', () => {
    const sections = buildPickerSections({ base, universe, taken: [uuid(1), uuid(3)] });
    expect(sections[0].options.map((o) => o.slot)).toEqual(['B', undefined]);
    expect(suggestForEmptySlot(sections)?.row.Space?.Slug).toBe('prod');
    const upstreamTaken = buildPickerSections({ base, universe, taken: [uuid(1), uuid(2), uuid(3)] });
    expect(suggestForEmptySlot(upstreamTaken)?.id).toBe(uuid(9));
    expect(suggestForEmptySlot([])).toBeUndefined();
  });

  test('the group is the innermost one the base is drawn under, and none when it is not shown', () => {
    const levels: GroupLevel<ExtendedUnitRead>[] = [
      { field: 'Target', value: (r) => r.Target?.Slug ?? null },
      { field: 'Space', value: (r) => r.Space?.Slug ?? null },
    ];
    const shown = [base, prod, eu, history, matching];
    const node = innermostGroup(buildGroupTree(shown, levels), base);
    expect(node?.field).toBe('Space');
    expect(node?.value).toBe('nonprod');
    expect(node?.rows).toEqual([base, matching]);
    expect(innermostGroup(buildGroupTree(shown, levels), upstream)).toBeUndefined();
    expect(innermostGroup(buildGroupTree(shown, []), base)).toBeUndefined();
  });

  test('upstream revisions ahead are null without an upstream', () => {
    expect(upstreamAhead(prod, upstream)).toBeNull();
    expect(upstreamAhead(base, undefined)).toBeNull();
  });

  test('search matches every word across slug, Space, Target and display name', () => {
    const found = (q: string) => searchUnits(universe, q, { base, taken: [] }).options.map((o) => o.row.Unit?.Slug);
    expect(found('k8s-nonprod')).toEqual(['history']);
    expect(found('task')).toEqual(['matching']);
    expect(found('NONPROD his')).toEqual(['history']);
    expect(found('')).toEqual([]);
    // The base itself is never offered.
    expect(searchUnits(universe, 'nonprod', { base, taken: [] }).options.map((o) => o.id)).not.toContain(uuid(1));
  });

  test('search ranks an exact slug, then the base slug, then Space and slug, and counts past the limit', () => {
    const exact = unit({ n: 30, slug: 'prod', space: 'zzz' });
    const result = searchUnits([...universe, exact], 'prod', { base, taken: [uuid(2)], limit: 2 });
    expect(result.total).toBe(5);
    expect(result.options.map((o) => o.id)).toEqual([uuid(30), uuid(3)]);
    expect(searchUnits([...universe, exact], 'prod', { base, taken: [uuid(2)] }).options.map((o) => [o.id, o.slot])).toEqual([
      [uuid(30), undefined],
      [uuid(3), undefined],
      [uuid(2), 'A'],
      [uuid(4), undefined],
      [uuid(5), undefined],
    ]);
  });
});

test.describe('the page layout’s merged rows', () => {
  const folder = (identityPath: string, label: string, depth: number): CompareRow => ({ type: 'folder', identityPath, label, depth });
  const leaf = (identityPath: string, leafKey: string, depth: number): CompareRow => ({
    type: 'leaf',
    identityPath,
    folderPath: '',
    leafKey,
    depth,
    isPositional: false,
    cells: [],
    editTargets: [],
  });
  const shape = (rows: readonly CompareRow[]) => rows.map((r) => `${r.depth}:${r.type === 'folder' ? `${r.label}/` : r.leafKey}`);

  test('a folder with one row under it is one row with it, down the whole chain', () => {
    const rows = [
      folder('metadata', 'metadata', 0),
      leaf('metadata.name', 'name', 1),
      folder('spec', 'spec', 0),
      leaf('spec.replicas', 'replicas', 1),
      folder('spec.template.spec', 'template.spec', 1),
      folder('spec.template.spec.containers[a]', 'containers[a]', 2),
      leaf('spec.template.spec.containers[a].name', 'name', 3),
      leaf('spec.template.spec.containers[a].image', 'image', 3),
    ];
    expect(shape(mergeSingleChildFolders(rows))).toEqual(['0:metadata.name', '0:spec/', '1:replicas', '1:template.spec.containers[a]/', '2:name', '2:image']);
    // A merged folder keeps the deepest folder's path, so folding names the same folder.
    expect(mergeSingleChildFolders(rows)[3]?.identityPath).toBe('spec.template.spec.containers[a]');
  });

  test('leaves rows with several children, and an empty folder, as they are', () => {
    const rows = [folder('a', 'a', 0), leaf('a.x', 'x', 1), leaf('a.y', 'y', 1), folder('b', 'b', 0)];
    expect(shape(mergeSingleChildFolders(rows))).toEqual(['0:a/', '1:x', '1:y', '0:b/']);
  });
});

test.describe('the page layout’s cut paths', () => {
  const path = 'template.spec.containers[alpha].resources.limits.memory';

  test('a path that fits is left whole', () => {
    expect(cutPathLeft(path, path.length)).toBe(path);
  });

  test('a path that does not fit is cut on the left after a dot, with a leading ellipsis', () => {
    expect(cutPathLeft(path, path.length - 1)).toBe('…spec.containers[alpha].resources.limits.memory');
    expect(cutPathLeft(path, 30)).toBe('…resources.limits.memory');
    expect(cutPathLeft(path, 24)).toBe('…resources.limits.memory');
    expect(cutPathLeft(path, 23)).toBe('…limits.memory');
  });

  test('a cut may fall between two bracketed keys, never inside one', () => {
    expect(cutPathLeft('spec.items[a.b.c][second]', 10)).toBe('…[second]');
    expect(cutPathLeft('spec.items[name=a.b.c].value', 8)).toBe('…value');
  });

  test('a last segment too long for the room is returned alone, for the CSS ellipsis', () => {
    expect(cutPathLeft('spec.averyveryverylongfieldname', 10)).toBe('…averyveryverylongfieldname');
    expect(cutPathLeft('averyveryverylongfieldname', 10)).toBe('averyveryverylongfieldname');
  });
});
