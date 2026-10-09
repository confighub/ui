/* eslint-disable react-refresh/only-export-components -- a Vite entry point that mounts a harness; it has no module surface to export. */
// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Mounts the REAL compare section so its column tracks can be measured.
// A pure spec cannot import these components — MUI's directory imports do not
// resolve under Playwright's ESM loader — and this defect was invisible to one
// anyway: every row declared the same width and still drew its divider
// somewhere else, because the cells were content-box and each row added its
// own padding and indent on top. Only layout can catch that, so this is laid
// out by a browser and measured.

import { useState, type ReactElement } from 'react';

import { createRoot } from 'react-dom/client';

import { Theme } from '../../../src/components/theme-provider/ThemeProvider';
import { CompareCollapsible } from '../../../src/pages/x/apps/compare/CompareCollapsible';
import { CompareColumnDnd } from '../../../src/pages/x/apps/compare/CompareColumnDnd';
import { ComponentCompareSection } from '../../../src/pages/x/apps/compare/ComponentCompareSection';
import { DeploymentSelectors } from '../../../src/pages/x/apps/compare/DeploymentSelectors';

const A = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  labels:
    app: checkout
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/confighubai/api:v0.4.15
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-svc
spec:
  ports:
    - port: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-cfg
data:
  tier: gold
`;
const B = A.replace('replicas: 3', 'replicas: 1').replace('tier: gold', 'tier: silver');

const cols = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    deploymentId: `d${i}`, label: i === 0 ? 'prod-us1' : `dev-${i}`, data: i % 2 ? B : A,
  }));

/**
 * The in-flight window: every column's configuration still arriving.
 *
 * This is the state that rendered a verdict — "could not be read", "None of
 * these deployments holds configuration to compare" — about data that landed
 * seconds later, and that no model-level assertion caught, because with nothing
 * read there are no rows and therefore no cells to inspect.
 */
const LOADING_COLS = [
  { deploymentId: 'a', label: 'cubbychat-base', unavailable: 'loading' as const },
  { deploymentId: 'b', label: 'cubbychat-base-dev', unavailable: 'loading' as const },
];

/** Settled and genuinely unreadable, so the two can be told apart in the DOM. */
const SETTLED_COLS = [
  { deploymentId: 'a', label: 'cubbychat-base', unavailable: 'empty-unit' as const },
  { deploymentId: 'b', label: 'cubbychat-base-dev', unavailable: 'empty-unit' as const },
];

/** A unit whose `args` list has no element identity, so its rows refuse edits. */
const POSITIONAL = `apiVersion: v1
kind: Pod
metadata:
  name: runner
spec:
  args:
    - --v
    - --v
`;

/** Records applies instead of performing them, and refuses one deployment. */
const recordedApplies: string[] = [];
(window as unknown as { recordedApplies: string[] }).recordedApplies = recordedApplies;
const commit = async (unitId: string, spaceId: string) => {
  recordedApplies.push(`${spaceId}:${unitId}`);
  // `dev-1` always refuses, so a partial outcome can be asserted.
  return spaceId !== 'd1';
};

/** Every `onReorder`/`onSelectionChange` the reorder pane below receives. */
const recordedSelections: string[][] = [];
(window as unknown as { __compareSelections: string[][] }).__compareSelections = recordedSelections;

/** The `collapse` pane's localStorage key. Each spec page opens in a new browser context, so it starts empty and the pane starts expanded. */
const COLLAPSE_STORAGE_KEY = 'confighub.harness.compareCollapsed';

const REORDER_DATA: Record<string, string> = {
  'prod-us1': A,
  'dev-1': B,
  'dev-2': A,
  'dev-3': B,
  'dev-4': A,
};

/** A second unit, distinct from `checkout`, for tests that need two units to tell apart. */
const BILLING = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-api
spec:
  replicas: 2
`;
const BILLING_VARIANT = BILLING.replace('replicas: 2', 'replicas: 5');
const REORDER_BILLING_DATA: Record<string, string> = {
  'prod-us1': BILLING,
  'dev-1': BILLING_VARIANT,
  'dev-2': BILLING,
  'dev-3': BILLING_VARIANT,
  'dev-4': BILLING,
};

/**
 * `dev-3` carries a variant label, same as `Space.Labels.Variant` would —
 * every other id has none, so both cases are covered: what a deployment is
 * shown as when it has a label, and what it falls back to (the Space slug
 * itself, i.e. the id) when it does not.
 */
const VARIANT_LABEL_BY_ID: Record<string, string> = {
  'dev-3': 'staging',
};

/** What a deployment is shown as, and the Space slug alongside it when that differs — mirrors `ComponentSidePane`'s own rule. */
function shownFor(id: string): { label: string; displayName?: string } {
  const variant = VARIANT_LABEL_BY_ID[id];
  return variant ? { label: variant, displayName: id } : { label: id };
}

interface ReorderHarnessProps {
  deploymentIds: string[];
  /**
   * Simulates a host that never commits the reorder — ignores it, or
   * rejects it — so `order` never changes. `onReorder`/`onSelectionChange`
   * still fire and are still recorded; only the state update they would
   * normally drive is skipped. Exercises the drag layer's own backstop for a
   * pending swap nothing ever consumes.
   */
  ignoreReorder?: boolean;
  /** Adds a second unit ('billing') alongside 'checkout' — collapse tests need two to tell apart. */
  extraUnit?: boolean;
  /** Gives every column a `unitId` and wires `onCommitStaged`, so cells can be staged — for the "a collapsed unit does not lose its staged edits" test. */
  editable?: boolean;
  /** Wraps the selector row in `CompareCollapsible`, the way `ComponentSidePane` does. */
  collapsible?: boolean;
}

/**
 * A stateful pane wired exactly like `ComponentSidePane` wires the real one:
 * `CompareColumnDnd` around both `DeploymentSelectors` and
 * `ComponentCompareSection`, sharing one `order`/`onReorder`. The clear (X),
 * the picker and a drag all end up going through the same
 * `recordedSelections` log, so a spec can assert on whichever gesture it drove.
 */
function ReorderHarness({ deploymentIds, ignoreReorder, extraUnit, editable, collapsible }: ReorderHarnessProps): ReactElement {
  const [selection, setSelection] = useState<string[]>(deploymentIds);
  const options = selection.map((id) => ({ id, ...shownFor(id) }));
  const labels = new Map(options.map((option) => [option.id, option.label]));

  const applyNext = (next: readonly string[]) => {
    const asArray = [...next];
    recordedSelections.push(asArray);
    if (!ignoreReorder) setSelection(asArray);
  };

  const unitId = (id: string) => (editable ? `u-${id}` : undefined);

  const selectors = <DeploymentSelectors options={options} selection={selection} onSelectionChange={applyNext} />;

  return (
    <CompareColumnDnd order={selection} labels={labels} onReorder={applyNext}>
      {collapsible ? (
        <CompareCollapsible storageKey={COLLAPSE_STORAGE_KEY} testId="component-compare">
          {selectors}
        </CompareCollapsible>
      ) : (
        selectors
      )}
      <ComponentCompareSection
        units={[
          {
            slug: 'checkout',
            columns: selection.map((id) => ({
              deploymentId: id,
              ...shownFor(id),
              data: REORDER_DATA[id] ?? A,
              unitId: unitId(id),
            })),
          },
          ...(extraUnit
            ? [
                {
                  slug: 'billing',
                  columns: selection.map((id) => ({
                    deploymentId: id,
                    ...shownFor(id),
                    data: REORDER_BILLING_DATA[id] ?? BILLING,
                    unitId: unitId(id),
                  })),
                },
              ]
            : []),
        ]}
        deploymentCount={selection.length}
        onCommitStaged={editable ? commit : undefined}
      />
    </CompareColumnDnd>
  );
}

createRoot(document.getElementById('root')!).render(
  <Theme>
  {/*
    The app's inherited typography, which is not decoration here.
    In the app this section is nested inside MUI containers whose typography
    sets a unitless line-height; rendered in a bare div it inherited
    `line-height: normal` instead. `font: 'inherit'` inherits the SHORTHAND —
    family, size and line-height together — so a folder row that had lost its
    font size still measured 22px here and 24px in the app, and the height
    assertions were green against a row whose font was wrong. With the app's
    line-height that same defect measures 25px and the assertion fails.
  */}
  <div style={{ lineHeight: 1.5 }}>
    <div data-state="loading" style={{ width: 560, height: 260, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection units={[{ slug: 'checkout', columns: LOADING_COLS }]} deploymentCount={2} />
    </div>
    <div data-state="settled-empty" style={{ width: 560, height: 260, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection units={[{ slug: 'checkout', columns: SETTLED_COLS }]} deploymentCount={2} />
    </div>
    <div data-state="editable" style={{ width: 645, height: 520, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection
        units={[
          {
            slug: 'checkout',
            // Column B is missing `spec.paused`, so the grid has a `not set`
            // cell whose PARENT exists — the case where setting it is an add.
            columns: cols(2).map((c, i) => ({
              ...c,
              data: i === 0 ? `${A}  paused: false\n` : c.data,
              unitId: `u-${c.deploymentId}`,
            })),
          },
        ]}
        deploymentCount={2}
        onCommitStaged={commit}
      />
    </div>
    {/* `spec.replicas` is kept on merge in the VARIANT only, so protection can be
        shown to be per column rather than resolved once for the row. */}
    <div data-state="protected" style={{ width: 645, height: 300, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection
        units={[
          {
            slug: 'checkout',
            columns: cols(2).map((c, i) => ({
              ...c,
              unitId: `u-${c.deploymentId}`,
              isProtected: i === 1 ? (path: string) => path === 'spec.replicas' : undefined,
            })),
          },
        ]}
        deploymentCount={2}
        onCommitStaged={commit}
      />
    </div>
    {/* `spec.onlyHere` exists in the variant alone: set on one column, unset on
        the other, still a difference under the one definition there is now
        (set-vs-unset counts) — a present-only field counting is what this
        fixture proves. `replicas` disagrees between both columns too, so the
        folder survives and the badge is always rendered against a value, not
        left with nothing to test. */}
    <div data-state="rules" style={{ width: 645, height: 300, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection
        units={[
          {
            slug: 'checkout',
            columns: [
              { deploymentId: 'r0', label: 'prod', data: 'spec:\n  replicas: 3\n' },
              { deploymentId: 'r1', label: 'dev', data: 'spec:\n  replicas: 9\n  onlyHere: yes\n' },
            ],
          },
        ]}
        deploymentCount={2}
      />
    </div>
    <div data-state="blocked" style={{ width: 645, height: 300, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection
        units={[
          {
            slug: 'runner',
            columns: [
              { deploymentId: 'p0', label: 'prod', data: POSITIONAL, unitId: 'u-p0' },
              // Duplicated scalars on BOTH sides, so both fall back to position,
              // and different values, so the rows survive the Differing filter.
              {
                deploymentId: 'p1',
                label: 'dev',
                data: POSITIONAL.replaceAll('--v', '--trace'),
                unitId: 'u-p1',
              },
            ],
          },
        ]}
        deploymentCount={2}
        onCommitStaged={commit}
      />
    </div>
    {/* Two deployments, two units — 'checkout' held by both, 'billing' only by
        prod-us1. `dev-1` answers fine for both, so nothing here may say it
        could not be read. The 'billing' unit header names it as simply not
        holding that unit; the 'checkout' unit compares normally regardless. */}
    <div data-state="missing-unit" style={{ width: 645, height: 700, display: 'flex', flexDirection: 'column' }}>
      <ComponentCompareSection
        units={[
          {
            slug: 'checkout',
            columns: [
              { deploymentId: 'prod-us1', label: 'prod-us1', data: A },
              { deploymentId: 'dev-1', label: 'dev-1', data: B },
            ],
          },
          {
            slug: 'billing',
            columns: [
              { deploymentId: 'prod-us1', label: 'prod-us1', data: BILLING },
              { deploymentId: 'dev-1', label: 'dev-1', unavailable: 'no-such-unit' },
            ],
          },
        ]}
        deploymentCount={2}
      />
    </div>
    <div data-state="reorder" style={{ width: 645, height: 520, display: 'flex', flexDirection: 'column' }}>
      <ReorderHarness deploymentIds={['prod-us1', 'dev-1', 'dev-2']} />
    </div>
    {/* A host that ignores/rejects the reorder: `order` never changes, so
        nothing ever lands for the `orderKey` effect to consume. */}
    <div data-state="reorder-stuck" style={{ width: 645, height: 520, display: 'flex', flexDirection: 'column' }}>
      <ReorderHarness deploymentIds={['prod-us1', 'dev-1', 'dev-2']} ignoreReorder />
    </div>
    {/* Five columns in a 645px pane — 220 + 5*104 = 740px of content, so the
        compare scroller genuinely overflows and a head drag has to be tested
        against real horizontal scroll, not just an unscrolled grid. */}
    <div data-state="reorder-wide" style={{ width: 645, height: 700, display: 'flex', flexDirection: 'column' }}>
      <ReorderHarness deploymentIds={['prod-us1', 'dev-1', 'dev-2', 'dev-3', 'dev-4']} />
    </div>
    {/* Two units ('checkout', 'billing') so a unit-collapse test has a SECOND
        unit to check for movement, and can still drive a column drag while
        one or both are collapsed. */}
    <div data-state="reorder-units" style={{ width: 645, height: 900, display: 'flex', flexDirection: 'column' }}>
      <ReorderHarness deploymentIds={['prod-us1', 'dev-1', 'dev-2']} extraUnit editable />
    </div>
    {/* The selector row folded under a "Compare" header, as the side pane draws it. */}
    <div data-state="collapse" style={{ width: 645, height: 520, display: 'flex', flexDirection: 'column' }}>
      <ReorderHarness deploymentIds={['prod-us1', 'dev-1']} collapsible />
    </div>
    {[2, 3, 5, 8].map((n) => (
      <div key={n} data-pane={n} style={{ width: 645, border: '1px solid #ccc', marginBottom: 24, display: 'flex', flexDirection: 'column', height: 700 }}>
        <DeploymentSelectors
          options={cols(n).map((c) => ({ id: c.deploymentId, label: c.label }))}
          selection={cols(n).map((c) => c.deploymentId)}
          onSelectionChange={() => {}}
        />
        <ComponentCompareSection units={[{ slug: 'checkout', columns: cols(n) }]} deploymentCount={n} />
      </div>
    ))}
  </div>
  </Theme>,
);
