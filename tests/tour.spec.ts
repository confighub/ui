// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

// ============================================================================
// Guided tour × MUI Dialog E2E Test
//
// The tour tooltip is itself an MUI `Modal`. That is the load-bearing bet of
// the whole engine: `ModalManager` puts `aria-hidden="true"` on every
// `document.body` child except the top modal, and `FocusTrap` drags focus back
// into it. A tooltip merely portalled to `document.body` would be hidden from
// assistive tech and unfocusable for as long as any Dialog is open — and
// chapter 1 runs entirely inside the create-component Dialog.
//
// This spec proves the four things that bet has to deliver, with the Dialog
// OPEN and a tour step active:
//   a. the tooltip is visible and NOT inside an aria-hidden subtree;
//   b. the tooltip's own Next button is clickable and advances the step;
//   c. the Dialog's own input is still focusable and typeable (no focus fight);
//   d. the spotlight does not intercept clicks on the real element beneath it.
//
// Locators are `data-testid`, never `getByRole`/`getByLabel`: aria-hidden
// removes whole subtrees from the accessibility tree, so a role query cannot
// tell "the element is gone" from "the element is hidden from a11y" — which is
// the exact property under test.
//
// Nothing here presses Create, so the run leaves no server-side objects behind
// — but the slug-collision check fires client-side the instant a name is
// typed, regardless of whether THIS run ever creates anything, so a literal
// "cubbychat" still fails if any manual walk or another spec left a real
// "cubbychat-base" space behind (confirmed live). Timestamped like every
// sibling spec's own fixture name, even though this one has no fixture to
// clean up.
// ============================================================================

const TOUR_URL = '/components?tour=getting-started';
const UNIQUE_COMPONENT_NAME = `tour-dialog-${Date.now()}`;

/** Walks ancestors for `aria-hidden="true"`, the attribute ModalManager sets. */
const isInAriaHiddenSubtree = (selector: string) => (page: import('@playwright/test').Page) =>
  page.evaluate((css) => {
    const element = document.querySelector(css);
    if (!element) return null;
    return element.closest('[aria-hidden="true"]') !== null;
  }, selector);

test.describe('guided tour inside the create-component dialog', () => {
  test.use({ storageState: 'authentication.json' });

  test('tour tooltip stays visible, operable and click-through while a Dialog is open', async ({
    page,
  }) => {
    await page.goto(TOUR_URL);
    await page
      .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
      .catch(() => {});

    const tooltip = page.getByTestId('tour-tooltip');
    const addButton = page.getByTestId('header-add-button');

    // Step 1 — no Dialog yet. Baseline: the tour starts from the query param.
    await expect(tooltip).toBeVisible({ timeout: 20000 });
    await expect(tooltip).toContainText('Make a new component');
    await expect(tooltip).toContainText('1 of 7');

    // (d, first half) The spotlight covers the viewport, so this click only
    // lands if pointer-events really pass through it. Playwright's hit-target
    // check fails the click outright when an overlay intercepts.
    await addButton.click();

    // The wizard Dialog is now open, and the tour has advanced into it.
    const wizard = page.locator('[role="dialog"][aria-labelledby="create-component-title"]');
    await expect(wizard).toBeVisible({ timeout: 10000 });
    await expect(tooltip).toContainText('Give the component a name', { timeout: 10000 });

    // (a) The tooltip is visible AND outside every aria-hidden subtree.
    await expect(tooltip).toBeVisible();
    expect(await isInAriaHiddenSubtree('[data-testid="tour-tooltip"]')(page)).toBe(false);

    // The step's anchor resolved inside the Dialog subtree — proof the
    // `inModal` anchor kind actually scopes to the portalled Paper.
    await expect(wizard.getByTestId('create-component-name-input')).toBeVisible();

    // (c) The Dialog's input under the overlay still takes focus and keystrokes.
    // `pressSequentially`, not `fill`: fill sets the value programmatically and
    // would pass even if FocusTrap were stealing focus back every keystroke.
    const nameInput = wizard.getByTestId('create-component-name-input').locator('input');
    await nameInput.click();
    await expect(nameInput).toBeFocused();
    await nameInput.pressSequentially(UNIQUE_COMPONENT_NAME);
    await expect(nameInput).toHaveValue(UNIQUE_COMPONENT_NAME);
    await expect(nameInput).toBeFocused();

    // (b) The tooltip's own button is clickable and advances the tour.
    await expect(tooltip).toContainText('2 of 7');
    await tooltip.getByRole('button', { name: 'Next' }).click();
    await expect(tooltip).toContainText('3 of 7');
    await expect(tooltip).toContainText('Go to the units step');

    // (d, second half) Click-through onto a real control INSIDE the open
    // Dialog, beneath the spotlight. This also drives the tour's own
    // click-advance, so a pass covers both the overlay and the advance wiring.
    await wizard.getByTestId('create-component-next-button').click();
    await expect(tooltip).toContainText('4 of 7', { timeout: 10000 });
    await expect(tooltip).toContainText('Add the units');

    // Still exempt from the aria-hidden sweep two steps deeper into the Dialog.
    expect(await isInAriaHiddenSubtree('[data-testid="tour-tooltip"]')(page)).toBe(false);

    // Exit cleanly: the Dialog underneath must become operable again.
    await tooltip.getByRole('button', { name: 'Exit' }).click();
    await expect(tooltip).toHaveCount(0);
    expect(
      await isInAriaHiddenSubtree('[role="dialog"][aria-labelledby="create-component-title"]')(page),
    ).toBe(false);
  });
});
