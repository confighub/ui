// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Editing a compare cell, driven through the real components.
//
// THE ASSERTION THAT MATTERS MOST IS THE ONE ABOUT LAYOUT. A value track holds
// about eleven characters, which is not an editor; an editor that widened its
// track would move every column rule below it and undo two commits of measured
// alignment work. So the editor floats, and this checks the dividers are still
// on one x WHILE one is open — not only before and after.
//
// The rest is what a user can and cannot do: a by-position row refuses an edit
// because index 2 in one deployment is not the same element as index 2 in
// another, and it refuses quietly, because most cells are not blocked and a
// marker at rest would be noise on almost every row.

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const HARNESS = '/tests/fixtures/compare-alignment/harness.html';
const MIN_EDITOR_PX = 240;

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

// The server and browser are shared; only the PAGE is fresh per test, because
// staged edits are component state and one test's staging must not be visible
// to the next. Standing a Vite server up per test cost more than the whole run.
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

test.beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1400, height: 2600 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin + HARNESS, { waitUntil: 'networkidle' });
  expect(errors, 'the harness rendered without errors').toEqual([]);
});

test.afterEach(async () => {
  await page?.close();
});

const editable = () => page.locator('[data-state="editable"]');
const blocked = () => page.locator('[data-state="blocked"]');

/** An editable value cell — column 1. */
function firstEditableCell() {
  return editable().locator('[data-testid="compare-leaf-row"] [data-column="1"]').first();
}

async function dividerPositions(): Promise<number[]> {
  return editable().evaluate((pane) => {
    const scroller = pane.querySelector('[data-testid="compare-scroller"]');
    if (!scroller) return [];
    const left = scroller.getBoundingClientRect().left;
    const xs = new Set<number>();
    pane
      .querySelectorAll('[data-testid="compare-leaf-row"],[data-testid="compare-folder-row"]')
      .forEach((row) => {
        const cells = [...row.children];
        if (cells.length > 1) {
          xs.add(Math.round(((cells[1] as Element).getBoundingClientRect().left - left) * 10) / 10);
        }
      });
    return [...xs];
  });
}

test.describe('the inline editor', () => {
  test('the harness offers both an editable grid and a blocked one', async () => {
    // Coverage first — every refusal assertion below would pass on an empty set.
    await expect(editable()).toHaveCount(1);
    await expect(blocked()).toHaveCount(1);
    await expect(editable().locator('[data-editable="true"]').first()).toBeVisible();
  });

  test('a click opens an editor, and it is a field rather than a slot', async () => {
    await firstEditableCell().click();
    const editor = editable().getByTestId('compare-value-editor');
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_EDITOR_PX);
  });

  test('the editor floats: it escapes its cell, and the columns do not move', async () => {
    const before = await dividerPositions();
    expect(before).toHaveLength(1);

    const cell = firstEditableCell();
    await cell.click();
    const editor = editable().getByTestId('compare-value-editor');
    await expect(editor).toBeVisible();

    // FLOATING means the editor is wider than the cell it belongs to. Asserted
    // directly, because the divider check below cannot see this on its own: the
    // tracks have a definite flex-basis, so content does not size them and an
    // editor laid out INSIDE a cell would overflow silently rather than move a
    // rule. Both properties are wanted; only this one catches that mistake.
    const editorBox = await editor.boundingBox();
    const cellBox = await cell.boundingBox();
    expect(editorBox?.width ?? 0).toBeGreaterThanOrEqual(MIN_EDITOR_PX);
    expect(
      editorBox?.width ?? 0,
      'the editor is confined to its cell, so it is not floating',
    ).toBeGreaterThan(cellBox?.width ?? Infinity);

    // AND NOTHING CLIPS IT. Overflowing a cell is not the same as being visible
    // past it: a clipping ancestor leaves the box its full size and paints a
    // fraction of it. That is exactly how the comparison badge lost a third of
    // itself on the flow-graph node, and how this editor would lose its text.
    const shown = await editor.evaluate((el) => {
      const box = el.getBoundingClientRect();
      let visible = { l: box.left, t: box.top, r: box.right, b: box.bottom };
      for (let a = el.parentElement; a; a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.overflow === 'visible' && style.overflowX === 'visible') continue;
        const ab = a.getBoundingClientRect();
        visible = {
          l: Math.max(visible.l, ab.left),
          t: Math.max(visible.t, ab.top),
          r: Math.min(visible.r, ab.right),
          b: Math.min(visible.b, ab.bottom),
        };
      }
      return Math.round(Math.max(0, visible.r - visible.l));
    });
    expect(shown, 'an ancestor is clipping the editor').toBeGreaterThanOrEqual(MIN_EDITOR_PX);

    // And the rules stay where they were.
    const during = await dividerPositions();
    expect(during, `dividers moved while the editor was open: ${during.join(', ')}`).toEqual(before);
  });

  test('a committed edit stages, and nothing is written until apply', async () => {
    await firstEditableCell().click();
    const editor = editable().getByTestId('compare-value-editor');
    await editor.locator('input').fill('99');
    await editor.locator('input').press('Enter');

    await expect(editable().locator('[data-fidelity="value-staged"]').first()).toBeVisible();
    await expect(editable().getByTestId('compare-staged-footer')).toBeVisible();

    const applies = await page.evaluate(() => (window as unknown as { recordedApplies: string[] }).recordedApplies);
    expect(applies, 'staging must not write').toEqual([]);
  });

  test('the footer names which deployment it would write to', async () => {
    await firstEditableCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('99');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');

    await expect(editable().getByTestId('compare-apply')).toHaveText(/Apply to 1 deployment/);
    await expect(editable().locator('[data-testid^="compare-staged-chip-"]')).toHaveCount(1);
  });

  test('a refusal is named and its work stays staged', async () => {
    // The harness refuses `d1`, which is the column being edited.
    await firstEditableCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('99');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');
    await editable().getByTestId('compare-apply').click();

    const outcome = editable().getByTestId('compare-apply-outcome');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText(/refused/i);
    await expect(outcome).toContainText(/still staged/i);
    // Kept, not discarded — the user does not lose work to a server refusal.
    await expect(editable().locator('[data-fidelity="value-staged"]').first()).toBeVisible();
  });
});

test.describe('a staged change always looks staged', () => {
  // The defect these close: the footer counted a staged change while the cell
  // still read `not set`, so Apply would have written something the user could
  // not see. Asserted on the DOM, because the model was right the whole time —
  // it was only the rendering that lied.

  /** The one cell in the harness whose value is absent but whose parent exists. */
  function notSetCell() {
    return editable()
      .locator('[data-testid="compare-leaf-row"] [data-column="1"]')
      .filter({ has: page.locator('[data-fidelity="value-absent"]') })
      .first();
  }

  test('the harness really offers a settable not-set cell', async () => {
    await expect(notSetCell()).toHaveCount(1);
  });

  test('setting a not-set cell shows as a staged add, not as still-unset', async () => {
    await notSetCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('true');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');

    const staged = editable().locator('[data-fidelity="value-staged"]');
    await expect(staged).toHaveCount(1);
    // Green, because green already means present-only-here and an add is that.
    await expect(staged).toHaveAttribute('data-staged', 'add');
    await expect(staged).toHaveText('true');
    // And it must no longer read as absent.
    await expect(notSetCell()).toHaveCount(0);
  });

  test('a staged row carries the bar and the checkbox, like every other staged row', async () => {
    await firstEditableCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('99');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');

    await expect(editable().getByTestId('compare-staged-bar')).toHaveCount(1);
    await expect(editable().getByTestId('compare-staged-checkbox')).toHaveCount(1);
    const bar = await editable().getByTestId('compare-staged-bar').boundingBox();
    expect(Math.round(bar?.width ?? 0)).toBe(2);

    // AND IT PAINTS ABOVE THE FROZEN KEY CELL, which is opaque, sticky and starts
    // at the same x — so `toHaveCount` alone would pass on a bar nobody can see.
    //
    // NOT hit-tested. `elementFromPoint` at the bar's own coordinates returns the
    // key cell whatever the paint order, because the bar is `pointer-events:
    // none` — it must be, or it would swallow clicks on the leftmost 2px of a
    // folder's toggle. A hit test here reports "occluded" for a perfectly visible
    // bar, which is a false positive worth naming rather than re-deriving.
    // Stacking order is the thing that actually decides it, so that is what is
    // asserted; the two share a stacking context, their row being un-z-indexed.
    const stacking = await page.evaluate(() => {
      const row = document.querySelector('[data-state="editable"] [data-testid="compare-leaf-row"][data-staged]');
      const bar = row?.querySelector('[data-testid="compare-staged-bar"]');
      const key = row?.querySelector('[data-testid="compare-key-cell"]');
      if (!bar || !key) return null;
      return {
        bar: Number(getComputedStyle(bar).zIndex),
        key: Number(getComputedStyle(key).zIndex),
        rowZ: getComputedStyle(row as Element).zIndex,
      };
    });
    expect(stacking, 'the bar or the key cell was not found').not.toBeNull();
    expect(stacking?.rowZ, 'the row must not make its own stacking context').toBe('auto');
    expect(stacking?.bar ?? 0).toBeGreaterThan(stacking?.key ?? 0);
    await expect(editable().locator('[data-testid="compare-leaf-row"][data-staged="edit"]')).toHaveCount(1);
  });

  test('the checkbox discards the change, as unchecking does in the shipped tree', async () => {
    await firstEditableCell().click();
    await editable().getByTestId('compare-value-editor').locator('input').fill('99');
    await editable().getByTestId('compare-value-editor').locator('input').press('Enter');
    await expect(editable().getByTestId('compare-staged-footer')).toBeVisible();

    await editable().getByTestId('compare-staged-checkbox').click();
    await expect(editable().locator('[data-fidelity="value-staged"]')).toHaveCount(0);
    await expect(editable().getByTestId('compare-staged-footer')).toHaveCount(0);
  });
});

test.describe('kept on merge is shown, and does not block', () => {
  const protectedPane = () => page.locator('[data-state="protected"]');

  test('the harness really has a protected cell in one column only', async () => {
    await expect(protectedPane()).toHaveCount(1);
    await expect(protectedPane().locator('[data-protected="true"]')).toHaveCount(1);
  });

  test('protection is per column — the same path is unprotected in the other', async () => {
    // Protection is a property of a path in a UNIT, so two deployments can
    // disagree. Resolving it once for the row would show one deployment's answer
    // against another's value.
    const row = protectedPane()
      .locator('[data-testid="compare-leaf-row"]')
      .filter({ has: page.locator('[data-protected="true"]') })
      .first();
    await expect(row.locator('[data-protected="true"]')).toHaveCount(1);
    await expect(row.locator('[data-protected="false"]')).not.toHaveCount(0);
  });

  test('a protected cell stays editable — kept on merge is not a lock', async () => {
    // `protectedPaths` means a merge must not overwrite it, which is the reason
    // you set it: so your own edit survives. Blocking the edit inverts that.
    const cell = protectedPane()
      .locator('[data-column="1"]')
      .filter({ has: page.locator('[data-protected="true"]') })
      .first();
    await expect(cell.locator('[data-edit-blocked]')).toHaveCount(0);
    await cell.click();
    await expect(protectedPane().getByTestId('compare-value-editor')).toBeVisible();
  });

  test('an edited protected cell shows both signals at once', async () => {
    const cell = protectedPane()
      .locator('[data-column="1"]')
      .filter({ has: page.locator('[data-protected="true"]') })
      .first();
    await cell.click();
    await protectedPane().getByTestId('compare-value-editor').locator('input').fill('7');
    await protectedPane().getByTestId('compare-value-editor').locator('input').press('Enter');

    // `components.md` calls the rail and the border two different signals on
    // purpose: one says this will change, the other says a merge must not.
    const staged = protectedPane().locator('[data-fidelity="value-staged"]');
    await expect(staged).toHaveAttribute('data-change-type', 'edit');
    await expect(staged).toHaveAttribute('data-protected', 'true');

    // AND BOTH ARE PAINTED. The attributes above survive a cell that draws only
    // one of them, which is exactly what staging used to do: the amber staged
    // border replaced the protection border on the same edge, so staging a
    // protected value silently erased the signal saying a merge must not
    // overwrite it. Protection moved to an inset ring so the two can coexist,
    // and that is only provable in computed pixels.
    const painted = await staged.evaluate((node) => {
      const style = getComputedStyle(node);
      return { border: style.borderTopColor, width: style.borderTopWidth, shadow: style.boxShadow };
    });
    expect(painted.width, 'the staged border is gone').not.toBe('0px');
    const stagedBorder = painted.border;
    expect(painted.shadow, 'no protection ring is drawn').not.toBe('none');
    // Two distinct colours: a ring that merely repeated the staged border would
    // satisfy "not none" while showing the user one signal.
    expect(painted.shadow).not.toContain(stagedBorder);

    // And an unprotected staged cell draws the staged border WITHOUT the ring,
    // so the ring is carrying protection rather than decorating every edit.
    const plainCell = protectedPane()
      .locator('[data-column="1"]')
      .filter({ has: page.locator('[data-protected="false"]') })
      .first();
    await plainCell.click();
    await protectedPane().getByTestId('compare-value-editor').locator('input').fill('9');
    await protectedPane().getByTestId('compare-value-editor').locator('input').press('Enter');
    const plain = protectedPane()
      .locator('[data-fidelity="value-staged"][data-protected="false"]')
      .first();
    await expect(plain).toBeVisible();
    expect(await plain.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
  });
});

test.describe('a collapsed folder still says what is under it', () => {
  test('counts appear only once collapsed, and per column', async () => {
    // Expanded, empty value cells are correct. Collapsed, the same blanks sit
    // beside a row nobody can see into and read as data that failed to load.
    const pane = page.locator('[data-pane="3"]');
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('[data-testid="compare-filter-all"]')
        .forEach((button) => button.click());
    });
    await page.waitForTimeout(150);
    await expect(pane.getByTestId('compare-folder-count')).toHaveCount(0);

    await page.evaluate(() => {
      document
        .querySelector('[data-pane="3"]')
        ?.querySelectorAll<HTMLElement>('[data-testid="compare-folder-row"]')
        .forEach((row) => (row.firstElementChild as HTMLElement | null)?.click());
    });
    await expect(pane.getByTestId('compare-folder-count')).not.toHaveCount(0);
  });
});

test.describe('a cell that must not be edited', () => {
  test('a by-position row refuses, and says why only when asked', async () => {
    const cell = blocked().locator('[data-edit-blocked="by-position"]').first();
    await expect(cell).toBeVisible();
    // Silent at rest: no editable affordance anywhere in that grid.
    await expect(blocked().locator('[data-editable="true"]')).toHaveCount(0);
    // The reason is there for a user who points at it.
    await expect(cell).toHaveAttribute('title', /could write to a different element/i);
  });

  test('clicking one opens nothing', async () => {
    await blocked().locator('[data-edit-blocked="by-position"]').first().click();
    await expect(blocked().getByTestId('compare-value-editor')).toHaveCount(0);
    await expect(blocked().getByTestId('compare-staged-footer')).toHaveCount(0);
  });
});

test.describe('the collapsed-folder badge counts a present-only field', () => {
  // WHY THIS BADGE ONCE LIED. Its memo did not depend on which rows the filter
  // passed it, so it could put a number on a folder the filter would show
  // nothing for. A blank collapsed folder was the defect this badge replaced;
  // a WRONG number is worse, because it looks trustworthy.
  //
  // Asserted on the RENDERED badge. My first attempt asserted `rowDiffers`
  // instead and passed with the fix reverted — the badge was never exercised.

  const rules = () => page.locator('[data-state="rules"]');

  /**
   * Collapse every folder and read the badges.
   *
   * Collapsing TOGGLES, so this may only be called once per page load — calling
   * it twice re-expands everything and reads an empty list, which is how the
   * first version of this test reported a difference that was really just the
   * folders reopening.
   */
  async function collapseAndRead(): Promise<string[]> {
    const collapsed = await page.evaluate(() => {
      const rows = document
        .querySelector('[data-state="rules"]')
        ?.querySelectorAll<HTMLElement>('[data-testid="compare-folder-row"]');
      rows?.forEach((row) => (row.firstElementChild as HTMLElement | null)?.click());
      return rows?.length ?? 0;
    });
    expect(collapsed, 'no folder rendered, so no badge could be read').toBeGreaterThan(0);
    await page.waitForTimeout(150);
    return rules().getByTestId('compare-folder-count').allInnerTexts();
  }

  test('the harness really has a field only one deployment sets', async () => {
    await expect(rules()).toHaveCount(1);
    await expect(rules().getByTestId('compare-folder-row')).not.toHaveCount(0);
  });

  test('a present-only field counts, the same as a genuine value disagreement', async () => {
    const badges = await collapseAndRead();
    // `replicas` disagrees between the two columns; `onlyHere` is set by one
    // column and unset on the other — set-vs-unset is always a difference
    // now, with no rule to opt out of counting it, so both count and the
    // badge reads 2F.
    expect(badges).toContain('2F');
  });

  test('and under All fields, where nothing pre-filters the rows for it', async () => {
    // WHERE THE DEFECT ACTUALLY BITES. Under Differing the rows reaching the
    // grid are already filtered, so the badge cannot count a row it never
    // receives — the count comes out right for a reason that is not the
    // badge's doing. Under All fields every row arrives and the badge is on
    // its own, so this is the combination that tells whether it counts
    // correctly at all.
    await rules().getByTestId('compare-filter-all').click();
    await page.waitForTimeout(150);

    const badges = await collapseAndRead();
    expect(badges, `All fields gave: ${badges.join(',')}`).toContain('2F');
  });
});
