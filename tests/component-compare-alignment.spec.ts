// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Every column divider in the compare grid is one straight vertical line.
//
// WHY THIS IS MEASURED RATHER THAN ASSERTED. The dividers landed at four
// different x positions in one pane — 221 for folder rows, 237 for the column
// head, 249 and 259 for leaf rows at two depths — while every row's source said
// `width: 220`. The cells were CONTENT-box, so each row's own padding and indent
// were added to the track; the folder row was correct only by accident, because
// its key cell is a `<button>` and a button is border-box by UA default. Nothing
// in the source looked wrong, and no assertion over the model could have seen
// it. Only a browser laying the grid out can.
//
// The fix has two halves and this asserts both. One source for the track widths,
// so no row can declare its own; and ONE scroll container for the pane, because
// a scroller per document group let the Deployment and the ConfigMap hold
// different scrollLeft values and drift apart while each stayed internally
// straight.
//
// Spanning rows — the document header, the hoisted image rows — are deliberately
// NOT on the tracks. Images are lifted out of the grid precisely because a
// registry-qualified reference does not fit a 104px column, so putting them back
// on it would undo the thing the hoist exists to do.

import { chromium, expect, test, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('vite did not report a port');
  origin = `http://localhost:${address.port}`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Divider x for every row that sits on the tracks, relative to its own pane. */
interface RowMeasurement {
  n: string;
  kind: string;
  type: string;
  /** The key cell's own left edge — 0 whatever the scroll, since it alone is frozen. */
  keyDivider: number;
  firstDivider: number;
  secondDivider: number;
}

/** The grid's geometry in one pane: are the tracks using the room, and all of it? */
interface PaneGeometry {
  n: string;
  paneWidth: number;
  keyWidth: number;
  valueWidth: number;
  lastColumnRight: number;
  scrolls: boolean;
}

/** 104px is a floor, not a width — the number every growth assertion is read against. */
const VALUE_FLOOR_PX = 104;
const KEY_WIDTH_PX = 220;

async function measure(paneScrollLeft: number): Promise<RowMeasurement[]> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1800 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });

  // Every field, so folder rows and unchanged leaves are measured too.
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLElement>('[data-testid="compare-filter-all"]')
      .forEach((button) => button.click());
  });
  await page.waitForTimeout(150);

  const rows = await page.evaluate((scrollLeft) => {
    const out: RowMeasurement[] = [];
    for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) {
      const n = pane.getAttribute('data-pane') ?? '?';
      pane
        .querySelectorAll<HTMLElement>('[data-testid="compare-scroller"]')
        .forEach((scroller) => {
          scroller.scrollLeft = scrollLeft;
        });
      const paneLeft = pane.getBoundingClientRect().left;
      const relative = (el: Element) =>
        Math.round((el.getBoundingClientRect().left - paneLeft) * 10) / 10;

      pane
        .querySelectorAll<HTMLElement>('[data-testid="compare-document-group"]')
        .forEach((group, index) => {
          const kind = group.querySelector('span')?.textContent ?? `group-${index}`;
          const record = (type: string, row: Element) => {
            const cells = [...row.children];
            if (cells.length < 3) return;
            out.push({
              n,
              kind,
              type,
              keyDivider: relative(cells[0] as Element),
              firstDivider: relative(cells[1] as Element),
              secondDivider: relative(cells[2] as Element),
            });
          };
          const head = group.querySelector('[data-testid="compare-grid"] [role="row"]');
          if (head) record('colhead', head);
          group
            .querySelectorAll('[data-testid="compare-folder-row"]')
            .forEach((row) => record('folder', row));
          group
            .querySelectorAll('[data-testid="compare-leaf-row"]')
            .forEach((row) => record('leaf', row));
        });
    }
    return out;
  }, paneScrollLeft);

  expect(errors, 'the harness rendered without errors').toEqual([]);
  await page.close();
  return rows;
}

async function geometry(): Promise<PaneGeometry[]> {
  const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLElement>('[data-testid="compare-filter-all"]')
      .forEach((button) => button.click());
  });
  await page.waitForTimeout(150);

  const out = await page.evaluate(() => {
    const panes: PaneGeometry[] = [];
    for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) {
      const scroller = pane.querySelector<HTMLElement>('[data-testid="compare-scroller"]');
      const leaf = pane.querySelector<HTMLElement>('[data-testid="compare-leaf-row"]');
      if (!scroller || !leaf) continue;
      const box = scroller.getBoundingClientRect();
      const cells = [...leaf.children];
      const last = cells[cells.length - 1] as Element;
      panes.push({
        n: pane.getAttribute('data-pane') ?? '?',
        paneWidth: Math.round(box.width),
        keyWidth: Math.round((cells[0] as Element).getBoundingClientRect().width),
        valueWidth: Math.round((cells[1] as Element).getBoundingClientRect().width),
        lastColumnRight: Math.round(last.getBoundingClientRect().right - box.left),
        scrolls: scroller.scrollWidth > scroller.clientWidth + 1,
      });
    }
    return panes;
  });
  await page.close();
  return out;
}

/** Row types and document kinds actually present, so a silent empty pass is impossible. */
function describeCoverage(rows: RowMeasurement[], n: string) {
  const scoped = rows.filter((row) => row.n === n);
  return {
    rows: scoped,
    types: [...new Set(scoped.map((row) => row.type))].sort(),
    kinds: [...new Set(scoped.map((row) => row.kind))].sort(),
  };
}

test.describe('compare grid column tracks', () => {
  for (const n of ['2', '3', '5', '8']) {
    test(`every row type shares one divider x at N=${n}`, async () => {
      const { rows, types, kinds } = describeCoverage(await measure(0), n);

      // The measurement is only worth anything if it saw every row type and
      // every document group.
      expect(types).toEqual(['colhead', 'folder', 'leaf']);
      expect(kinds.length).toBeGreaterThanOrEqual(3);
      expect(rows.length).toBeGreaterThan(8);

      const first = new Set(rows.map((row) => row.firstDivider));
      const second = new Set(rows.map((row) => row.secondDivider));
      expect(first, `key|A divider x, by row: ${[...first].join(', ')}`).toHaveProperty(
        'size',
        1,
      );
      expect(second, `A|B divider x, by row: ${[...second].join(', ')}`).toHaveProperty(
        'size',
        1,
      );
    });
  }

  test('the tracks are shared across document groups, not per group', async () => {
    const rows = (await measure(0)).filter((row) => row.n === '5');
    const byKind = new Map<string, number>();
    for (const row of rows) byKind.set(row.kind, row.firstDivider);
    // Deployment, Service and ConfigMap must agree — three internally straight
    // runs of columns that do not line up with each other is the same defect.
    expect(new Set(byKind.values()).size).toBe(1);
  });

  test('the columns stay straight while the grid scrolls, and only the key column is frozen', async () => {
    // N=5's content is 740px in a 645px pane — 95px to scroll. Two positions
    // comfortably inside that range, so neither clamps against the end.
    const SCROLL_NEAR = 20;
    const SCROLL_FAR = 60;
    const dividersByScroll = new Map<number, { key: number; first: number; second: number }>();
    for (const scrollLeft of [SCROLL_NEAR, SCROLL_FAR]) {
      const rows = (await measure(scrollLeft)).filter((row) => row.n === '5');
      expect(new Set(rows.map((row) => row.keyDivider)).size).toBe(1);
      expect(new Set(rows.map((row) => row.firstDivider)).size).toBe(1);
      expect(new Set(rows.map((row) => row.secondDivider)).size).toBe(1);
      dividersByScroll.set(scrollLeft, {
        key: rows[0]?.keyDivider ?? 0,
        first: rows[0]?.firstDivider ?? 0,
        second: rows[0]?.secondDivider ?? 0,
      });
    }
    const near = dividersByScroll.get(SCROLL_NEAR);
    const far = dividersByScroll.get(SCROLL_FAR);
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    const delta = SCROLL_FAR - SCROLL_NEAR;

    // The key cell alone is frozen: its own left edge does not move.
    expect(near?.key).toBe(far?.key);
    // No column freezes past it any more — there is no reference column left
    // to freeze one FOR. Both value dividers scroll with the grid, by exactly
    // the scroll delta, moving together rather than one staying planted.
    expect((near?.first ?? 0) - (far?.first ?? 0)).toBe(delta);
    expect((near?.second ?? 0) - (far?.second ?? 0)).toBe(delta);
  });
});

test.describe('row density', () => {
  test('every row is 22px — the Configuration tab\'s contract, not 25 or 29', async () => {
    // Inherited drift: the mockups this was built from were 25px, and the built
    // grid measured 29 because the pill was content-box, so its declared 20px
    // minimum had padding and border ADDED to it. Measured, because a value like
    // this drifts silently and nobody reports a 7px row.
    const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
    await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('[data-testid="compare-filter-all"]')
        .forEach((button) => button.click());
    });
    await page.waitForTimeout(150);

    const heights = await page.evaluate(() => {
      const pane = document.querySelector('[data-pane="3"]');
      const measure = (selector: string) => [
        ...new Set(
          [...(pane?.querySelectorAll(selector) ?? [])].map((row) =>
            Math.round(row.getBoundingClientRect().height),
          ),
        ),
      ];
      return {
        leaf: measure('[data-testid="compare-leaf-row"]'),
        folder: measure('[data-testid="compare-folder-row"]'),
        count: pane?.querySelectorAll('[data-testid="compare-leaf-row"]').length ?? 0,
      };
    });
    await page.close();

    expect(heights.count, 'no rows were measured').toBeGreaterThan(8);
    // One height, and it is 22. A second value in either list means a row wrapped.
    expect(heights.leaf).toEqual([22]);
    expect(heights.folder).toEqual([22]);
  });

  test('a folder label renders at the size the code asks for', async () => {
    // Height alone is an indirect witness: a row whose font size was silently
    // replaced still fits the 22px floor until the inherited line-height is
    // large enough to push it out, so the row was right for a reason that had
    // nothing to do with the font. This reads the font itself. The `<button>`
    // needs its UA font reset, and `font` is a SHORTHAND, so a reset written
    // after the size erases it — the size is correct and the declaration order
    // defeats it.
    const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
    await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const label = await page.evaluate(() => {
      const button = document.querySelector(
        '[data-pane="3"] [data-testid="compare-folder-row"] button',
      );
      if (!button) return null;
      const style = getComputedStyle(button);
      return { size: style.fontSize, mono: style.fontFamily.includes('JetBrains Mono') };
    });
    await page.close();

    expect(label, 'no folder row was rendered').not.toBeNull();
    expect(label?.size).toBe('11.5px');
    // And it is still the monospace face the key column is measured in.
    expect(label?.mono).toBe(true);
  });

  test('and a COLLAPSED folder keeps it, though it carries a count the others do not', async () => {
    // Measured expanded, a folder row holds a chevron and a label, both shorter
    // than the row's 22px minimum, so the minimum absorbs everything and the
    // assertion above passes whatever the cell's own box does. Collapsed, the
    // row grows a per-column count badge — the tallest thing any folder row
    // carries, and the only content that can push past the minimum. So this is
    // the state where the density contract is actually load-bearing.
    const page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
    await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('[data-testid="compare-filter-all"]')
        .forEach((button) => button.click());
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>(
          '[data-pane="3"] [data-testid="compare-folder-row"] button[aria-expanded="true"]',
        )
        .forEach((button) => button.click());
    });
    await page.waitForTimeout(200);

    const measured = await page.evaluate(() => {
      const pane = document.querySelector('[data-pane="3"]');
      return {
        badges: pane?.querySelectorAll('[data-testid="compare-folder-count"]').length ?? 0,
        folder: [
          ...new Set(
            [...(pane?.querySelectorAll('[data-testid="compare-folder-row"]') ?? [])].map((row) =>
              Math.round(row.getBoundingClientRect().height),
            ),
          ),
        ],
      };
    });
    await page.close();

    // Coverage first: with no badge on screen this measures the same thing the
    // test above already did.
    expect(measured.badges, 'no collapsed folder carried a count').toBeGreaterThan(0);
    expect(measured.folder).toEqual([22]);
  });
});

test.describe('the value tracks use the room the pane has', () => {
  test('the harness covers a growing pane and a scrolling one', async () => {
    // Coverage first: assertions about growth prove nothing if no pane grew.
    const panes = await geometry();
    expect(panes.map((pane) => pane.n)).toEqual(['2', '3', '5', '8']);
    expect(panes.some((pane) => !pane.scrolls), 'no pane had room to grow').toBe(true);
    expect(panes.some((pane) => pane.scrolls), 'no pane was over the threshold').toBe(true);
  });

  test('104px is a floor: tracks grow past it while the pane has room', async () => {
    const panes = await geometry();
    for (const pane of panes.filter((candidate) => !candidate.scrolls)) {
      expect(
        pane.valueWidth,
        `N=${pane.n} value track stayed at the floor in a ${pane.paneWidth}px pane`,
      ).toBeGreaterThan(VALUE_FLOOR_PX);
    }
  });

  test('and a floor it is: tracks sit on it once the pane must scroll', async () => {
    const panes = await geometry();
    for (const pane of panes.filter((candidate) => candidate.scrolls)) {
      expect(pane.valueWidth, `N=${pane.n} overshot the floor`).toBe(VALUE_FLOOR_PX);
    }
  });

  test('no dead zone: the last column reaches the pane edge whenever it fits', async () => {
    // The defect the user actually reported — a fifth of the pane sitting empty
    // while the values truncated.
    const panes = await geometry();
    for (const pane of panes.filter((candidate) => !candidate.scrolls)) {
      expect(
        pane.lastColumnRight,
        `N=${pane.n} left ${pane.paneWidth - pane.lastColumnRight}px unused`,
      ).toBe(pane.paneWidth);
    }
  });

  test('the key column never takes a share of the slack', async () => {
    // Giving the value tracks `flex: 1` and letting the key cell inherit it is
    // the known way to reintroduce the divider drift this file exists to catch.
    for (const pane of await geometry()) {
      expect(pane.keyWidth, `N=${pane.n} key column moved`).toBe(KEY_WIDTH_PX);
    }
  });

  test('the crossover is clean — growth stops exactly where scrolling starts', async () => {
    for (const pane of await geometry()) {
      const atFloor = KEY_WIDTH_PX + Number(pane.n) * VALUE_FLOOR_PX;
      // Either the content fits and the tracks absorbed the slack, or it does
      // not and they are on the floor. There is no third state.
      if (atFloor <= pane.paneWidth) expect(pane.scrolls).toBe(false);
      else expect(pane.scrolls).toBe(true);
    }
  });
});
