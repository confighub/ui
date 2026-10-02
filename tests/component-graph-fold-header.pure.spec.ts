// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The fold header lists the values a Base's fold holds ("logistics ·
// payments · retail · No department"), in the order of its stacks and loose
// cards, on at most two lines, then "+N more". It never says "quiet", never
// cuts a value, and its height does not move the stacks on a poll.
import { expect, test } from '@playwright/test';

import type { ComponentDeployment } from '../src/pages/x/apps/componentTypes';
import { FOLD_HEAD_LINES } from '../src/pages/x/apps/flow-graph/fold/foldConstants';
import {
  HEADER_SEPARATOR,
  LINE_END,
  fitHeaderValues,
  foldHeaderCountText,
  foldHeaderTitle,
  foldHeaderValues,
  moreText,
} from '../src/pages/x/apps/flow-graph/fold/foldHeader';
import {
  type FoldLayout,
  type FoldLayoutNode,
  computeFoldedLayout,
  foldFrameId,
} from '../src/pages/x/apps/flow-graph/fold/foldLayout';
import { type FoldModel, buildFoldModel } from '../src/pages/x/apps/flow-graph/fold/foldModel';
import { solveFoldedFit } from '../src/pages/x/apps/flow-graph/fold/foldViewport';
import { groupQuiet } from '../src/pages/x/apps/flow-graph/fold/groupBy';
import { type MeridianComponentName, meridianComponent } from './fixtures/meridianFoldFixture';

const COMPONENTS: MeridianComponentName[] = [
  'cert-manager',
  'traefik',
  'checkout',
  'fraud-scoring',
];
const GROUP_KEYS = ['Department', 'Region', 'Stage', null];
const NONE: ReadonlySet<string> = new Set();
/** 1440 x 900 minus the app shell. */
const SCREEN = { width: 1224, height: 796 };

/** A width per character, so a spec can see exactly what fits. */
const CHAR_W = 7;
const measure = (text: string): number => text.length * CHAR_W;

function fittedLayout(deployments: ComponentDeployment[], groupKey: string | null) {
  const model = buildFoldModel({ deployments, groupKey });
  const fit = solveFoldedFit(
    (availableWidth) =>
      computeFoldedLayout(deployments, model, { availableWidth, expandedGroupIds: NONE }),
    SCREEN,
  );
  const layout = computeFoldedLayout(deployments, model, {
    availableWidth: fit.frozen.availableWidth,
    frozen: fit.frozen,
    expandedGroupIds: NONE,
  });
  return { model, fit, layout };
}

const frameOf = (layout: FoldLayout, baseId: string): FoldLayoutNode =>
  layout.nodes.find((n) => n.id === foldFrameId(baseId))!;

/** The stacks and loose cards of a fold, in reading order (row by row, left to right). */
function cellsInReadingOrder(layout: FoldLayout, baseId: string): FoldLayoutNode[] {
  return layout.nodes
    .filter(
      (n) =>
        n.baseId === baseId &&
        (n.kind === 'stack' || (n.kind === 'deployment' && n.placement === 'loose')),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function leaf(id: string, labels: Record<string, string>): ComponentDeployment {
  return {
    deploymentId: id,
    slug: id,
    displayName: id,
    type: 'Deployment',
    targets: [],
    parentDeploymentId: 'root',
    stage: 1,
    upgradeableCount: 0,
    unappliedCount: 0,
    unitCount: 1,
    liveStatusProvider: 'argocd',
    labels,
    configSignals: { staleUnits: 0, unreleasedUnits: 0, gatedUnits: 0 },
  };
}

test.describe('the values and their order', () => {
  test('cert-manager prod by Department: the stacks in order, "No department" last', () => {
    const { model, layout } = fittedLayout(meridianComponent('cert-manager'), 'Department');
    const values = frameOf(layout, 'prod').headerValues!;
    expect(values).toEqual(['logistics', 'payments', 'retail', 'No department']);
    expect(values).toEqual(model.bases.get('prod')!.groups.map((g) => g.label));
  });

  for (const name of COMPONENTS) {
    test(`${name}: every header follows its cells, row by row`, () => {
      for (const groupKey of GROUP_KEYS) {
        const { model, layout } = fittedLayout(meridianComponent(name), groupKey);
        const groupById = new Map(
          [...model.bases.values()].flatMap((b) => b.groups.map((g) => [g.id, g] as const)),
        );
        for (const baseId of model.bases.keys()) {
          const frame = layout.nodes.find((n) => n.id === foldFrameId(baseId));
          if (!frame) continue;
          const expected =
            groupKey === null
              ? []
              : cellsInReadingOrder(layout, baseId).flatMap((cell) => {
                  const g = groupById.get(cell.groupId!)!;
                  return g.kind === 'other' ? g.mergedLabels! : [g.label];
                });
          expect(frame.headerValues, `${baseId} by ${groupKey}`).toEqual(expected);
        }
      }
    });
  }

  test('an empty cell adds no value, and a cell keeps its place in the list', () => {
    const groups = groupQuiet(
      'root',
      [
        leaf('a1', { City: 'Oslo' }),
        leaf('a2', { City: 'Oslo' }),
        leaf('b1', { City: 'Bern' }),
        leaf('c1', {}),
      ],
      'City',
    );
    expect(foldHeaderValues(groups, 'City')).toEqual(['Bern', 'Oslo', 'No city']);
    expect(foldHeaderValues([groups[1], null, groups[0]], 'City')).toEqual(['Oslo', 'Bern']);
  });

  test('the tooltip holds the key and every value', () => {
    expect(foldHeaderTitle('Department', ['logistics', 'payments', 'No department'])).toBe(
      'Department: logistics, payments, No department',
    );
    expect(foldHeaderTitle(null, [])).toBe('');
  });
});

test.describe('a "1 each" stack stands for the values it holds', () => {
  test('by a Space label, "Other cities" lists its cities after the real stacks', () => {
    const quiet = [
      leaf('p1', { City: 'Paris' }),
      leaf('p2', { City: 'Paris' }),
      ...['Rome', 'Lima', 'Oslo', 'Bern'].map((city) => leaf(`x-${city}`, { City: city })),
    ];
    const groups = groupQuiet('root', quiet, 'City');
    expect(groups.map((g) => g.label)).toEqual(['Paris', 'Other cities']);
    expect(groups[1].mergedLabels).toEqual(['Bern', 'Lima', 'Oslo', 'Rome']);
    expect(foldHeaderValues(groups, 'City')).toEqual([
      'Paris',
      'Bern',
      'Lima',
      'Oslo',
      'Rome',
    ]);
  });
});

test.describe('"+N more": as many whole values as fit on two lines', () => {
  const clusters = Array.from({ length: 53 }, (_, i) => `cluster · prod-${i + 1}`);

  /** Every line within the width, with its end separator when the list goes on. */
  function expectLinesFit(lines: { items: string[]; continues: boolean }[], width: number) {
    for (const line of lines) {
      const text = line.items.join(HEADER_SEPARATOR) + (line.continues ? LINE_END : '');
      expect(measure(text), text).toBeLessThanOrEqual(width);
    }
  }

  test('53 values: a few whole names, then "+N more" for the rest', () => {
    const width = 230;
    const fit = fitHeaderValues(clusters, width, measure, '53 clusters');
    expect(fit.lines.length).toBeLessThanOrEqual(FOLD_HEAD_LINES);
    expectLinesFit(fit.lines, width);
    const items = fit.lines.flatMap((l) => l.items);
    const shown = items.slice(0, -1);
    expect(shown.length).toBeGreaterThan(0);
    // Whole values, in order: never a cut one.
    expect(shown).toEqual(clusters.slice(0, shown.length));
    expect(fit.hidden).toBe(clusters.length - shown.length);
    expect(items[items.length - 1]).toBe(moreText(fit.hidden));

    // One more value, and its "+N more", would not fit on two lines.
    const withOneMore = [...clusters.slice(0, shown.length + 1), moreText(fit.hidden - 1)];
    expect(fitHeaderValues(withOneMore, width, measure, '').hidden).toBeGreaterThan(0);
  });

  test('a value that does not fit at the end of a line moves whole to the next', () => {
    const fit = fitHeaderValues(
      ['logistics', 'payments', 'retail', 'No department'],
      170,
      measure,
      '',
    );
    expect(fit.hidden).toBe(0);
    expect(fit.lines).toEqual([
      { items: ['logistics', 'payments'], continues: true },
      { items: ['retail', 'No department'], continues: false },
    ]);
  });

  test('values that fit show with no "+N more"', () => {
    const fit = fitHeaderValues(['logistics', 'payments'], 400, measure, '');
    expect(fit).toEqual({
      lines: [{ items: ['logistics', 'payments'], continues: false }],
      hidden: 0,
    });
  });

  test('a value wider than a line is never cut: the header shows the count instead', () => {
    const long = 'cluster · ap-northeast-payments-prod1';
    expect(measure(long)).toBeGreaterThan(200);
    const fit = fitHeaderValues([long, 'b'], 200, measure, foldHeaderCountText('Cluster', 2));
    expect(fit).toEqual({ lines: [{ items: ['2 clusters'], continues: false }], hidden: 2 });
    expect(foldHeaderCountText('Department', 1)).toBe('1 department');
  });

  test('one line of room holds one line', () => {
    const fit = fitHeaderValues(clusters, 230, measure, '', 1);
    expect(fit.lines).toHaveLength(1);
    expectLinesFit(fit.lines, 230);
  });
});

test.describe('no "quiet" in the header', () => {
  for (const name of COMPONENTS) {
    test(`${name}: no value, tooltip or count says "quiet"`, () => {
      for (const groupKey of GROUP_KEYS) {
        const { model, layout } = fittedLayout(meridianComponent(name), groupKey);
        for (const baseId of model.bases.keys()) {
          const frame = layout.nodes.find((n) => n.id === foldFrameId(baseId));
          if (!frame) continue;
          const values = frame.headerValues!;
          const texts = [
            ...values,
            foldHeaderTitle(groupKey, values),
            foldHeaderCountText(groupKey, values.length),
          ];
          for (const text of texts)
            expect(text, `${baseId} by ${groupKey}`).not.toMatch(/quiet/i);
        }
      }
    });
  }

  test('with no key the one "Quiet" stack gives the header no value', () => {
    const groups = groupQuiet('root', [leaf('a', {}), leaf('b', {})], null);
    expect(groups[0].label).toBe('Quiet');
    expect(foldHeaderValues(groups, null)).toEqual([]);
  });
});

test.describe('the header height', () => {
  function withDepartments(
    deployments: ComponentDeployment[],
    baseId: string,
    departments: string[],
  ): ComponentDeployment[] {
    let i = 0;
    return deployments.map((d) =>
      d.parentDeploymentId === baseId
        ? { ...d, labels: { ...d.labels, Department: departments[i++ % departments.length] } }
        : d,
    );
  }

  test('a poll that adds values keeps the frozen lines, so no stack moves', () => {
    const deployments = meridianComponent('cert-manager');
    const { fit, layout } = fittedLayout(deployments, 'Department');
    const before = frameOf(layout, 'dev');
    expect(before.headerLines).toBe(1);

    // Many new Departments in dev: one line would no longer hold them.
    const polled = withDepartments(
      deployments,
      'dev',
      Array.from({ length: 8 }, (_, i) => `department-with-a-long-name-${i}`),
    );
    const model: FoldModel = buildFoldModel({ deployments: polled, groupKey: 'Department' });
    const after = computeFoldedLayout(polled, model, {
      availableWidth: fit.frozen.availableWidth,
      frozen: fit.frozen,
      expandedGroupIds: NONE,
    });
    const frame = frameOf(after, 'dev');
    expect(frame.headerLines).toBe(1);
    expect(frame.headerHeight).toBe(before.headerHeight);
    const firstRow = (l: FoldLayout) =>
      Math.min(...cellsInReadingOrder(l, 'dev').map((n) => n.y));
    expect(firstRow(after)).toBe(firstRow(layout));

    // A new Fit gives the header the second line it now needs.
    const refit = fittedLayout(polled, 'Department').layout;
    expect(frameOf(refit, 'dev').headerLines).toBe(FOLD_HEAD_LINES);
  });

  test('the cards beside a fold start level with its first row of stacks', () => {
    for (const groupKey of GROUP_KEYS) {
      const { model, layout } = fittedLayout(meridianComponent('cert-manager'), groupKey);
      for (const [baseId, base] of model.bases) {
        const frame = layout.nodes.find((n) => n.id === foldFrameId(baseId));
        if (!frame || base.cards.length === 0) continue;
        const cards = layout.nodes.filter(
          (n) => n.baseId === baseId && n.placement === 'card',
        );
        const top = Math.min(...cards.map((c) => c.y));
        if (top >= frame.y + frame.height) continue;
        expect(top, `${baseId} by ${groupKey}`).toBe(frame.y + frame.headerHeight!);
      }
    }
  });
});
