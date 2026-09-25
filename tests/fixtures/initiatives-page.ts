// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { hubApi } from './test';

/**
 * Page object for the Initiatives page (/x/initiatives and /x/initiatives/:id).
 *
 * Initiatives are backed by View + Filter entities in ConfigHub. Each initiative
 * card in the kanban represents a View with Labels.initiative = 'true'.
 */
export class InitiativesPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/x/initiatives');
  }

  /** Click the "New Initiative" button in the header to navigate to the create form. */
  async clickNewInitiative() {
    // Wait for the spaces list to load — the form silently does nothing if no space is found.
    // Set up the response promise BEFORE the click to avoid a race where the request
    // resolves before waitForResponse is registered.
    const spaceResponse = this.page.waitForResponse(
      (r) => r.url().includes('/api/space') && r.status() === 200,
    );
    await this.page.getByRole('button', { name: 'New Initiative' }).click();
    await this.page.waitForURL('**/x/initiatives/new');
    await spaceResponse;
  }

  /**
   * Fill in the initiative creation/edit form.
   * Only fills fields that are provided.
   */
  async fillInitiativeForm({
    name,
    description,
    priority,
  }: {
    name?: string;
    description?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  }) {
    if (name !== undefined) {
      const nameField = this.page.getByRole('textbox', { name: 'Initiative name' });
      await nameField.clear();
      await nameField.fill(name);
    }

    if (description !== undefined) {
      const descField = this.page.getByRole('textbox', { name: 'Description' });
      await descField.clear();
      await descField.fill(description);
    }

    if (priority !== undefined) {
      await this.page.getByRole('button', { name: priority, exact: true }).click();
    }
  }

  /** Submit the create form by clicking "Save Initiative". */
  async saveInitiative() {
    await this.page.getByRole('button', { name: 'Save Initiative' }).click();
    // Wait for navigation back to the initiatives list.
    // The form creates a Filter + View before navigating, so allow up to 30s.
    await this.page.waitForURL('**/x/initiatives', { timeout: 30000 });
  }

  /** Submit the edit form by clicking "Update Initiative". */
  async updateInitiative() {
    await this.page.getByRole('button', { name: 'Update Initiative' }).click();
    await this.page.waitForURL('**/x/initiatives', { timeout: 30000 });
  }

  /**
   * Get the kanban card locator for a given initiative name.
   * Uses .first() to avoid strict mode violations since the name text appears
   * in both MuiCard-root and MuiCardContent-root.
   */
  private getCard(initiativeName: string) {
    return this.page
      .locator('[class*="MuiCard-root"]')
      .filter({ hasText: initiativeName })
      .first();
  }

  /** Open the ⋮ context menu on a initiative card by name. */
  async openCardMenu(initiativeName: string) {
    const card = this.getCard(initiativeName);
    await card.hover();
    // The MoreVert icon button is inside the card header area
    await card.getByRole('button').first().click();
  }

  /** Click "Edit" from the open card context menu. */
  async clickEditFromMenu() {
    await this.page.getByRole('menuitem', { name: 'Edit' }).click();
  }

  /** Click "Delete" from the open card context menu. */
  async clickDeleteFromMenu() {
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
  }

  /** Click "Activate" from the open card context menu (draft → in_progress). */
  async clickActivateFromMenu() {
    await this.page.getByRole('menuitem', { name: 'Activate' }).click();
  }

  /** Click "Mark Completed" from the open card context menu (in_progress → completed). */
  async clickMarkCompletedFromMenu() {
    await this.page.getByRole('menuitem', { name: 'Mark Completed' }).click();
  }

  /** Confirm the delete dialog by clicking the "Delete" button. */
  async confirmDelete() {
    // The dialog has a "Cancel" and a "Delete" button — use the one inside the dialog
    await this.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    // Wait for dialog to close
    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  }

  /** Click the initiative card to select it and show the detail view. */
  async selectInitiative(initiativeName: string) {
    await this.getCard(initiativeName).click();
  }

  /**
   * Click the Back button in the initiative editor left pane.
   * Uses `locator('button')` to avoid matching <div role="button"> sidebar elements.
   */
  async clickBackButton() {
    // Exact name: a substring match on 'Back' also selects the header's "Feedback" button,
    // which does not navigate.
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await this.page.waitForURL('**/x/initiatives');
  }

  /** Assert a initiative card with the given name is visible in the kanban. */
  async expectInitiativeVisible(initiativeName: string) {
    await expect(this.getCard(initiativeName)).toBeVisible();
  }

  /** Assert no initiative card with the given name is present. */
  async expectInitiativeNotVisible(initiativeName: string) {
    await expect(this.getCard(initiativeName)).not.toBeVisible();
  }

  /** Assert the empty-state message is visible (no initiatives yet). */
  async expectEmptyState() {
    await expect(this.page.getByText('No initiatives yet')).toBeVisible();
  }

  /** Assert we are on the initiatives list page. */
  async expectOnInitiativesPage() {
    await expect(this.page).toHaveURL(/\/x\/initiatives$/);
  }

  /**
   * Create a initiative via the UI and wait for the kanban to show it.
   */
  async createInitiativeViaUI(options: {
    name: string;
    description?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  }): Promise<void> {
    await this.clickNewInitiative();
    await this.fillInitiativeForm(options);
    await this.saveInitiative();
    await this.expectInitiativeVisible(options.name);
  }

  /**
   * Delete a initiative by name via the kanban card context menu.
   */
  async deleteInitiativeViaUI(initiativeName: string): Promise<void> {
    await this.openCardMenu(initiativeName);
    await this.clickDeleteFromMenu();
    await this.confirmDelete();
  }

  /**
   * Delete a initiative (View + Filter) via direct API calls.
   * Used for test cleanup when the initiative was created via UI.
   */
  async deleteInitiativeViaAPI(initiativeName: string): Promise<void> {
    // Find the view with this initiative name and initiative label
    const viewResponse = await hubApi.get('/api/view', {
      params: {
        where: `Labels.initiative = 'true' AND DisplayName = '${initiativeName}'`,
        include: 'FilterID',
      },
    });

    if (!viewResponse.ok()) return;

    const views = await viewResponse.json();
    if (!Array.isArray(views) || views.length === 0) return;

    for (const ev of views) {
      const viewId = ev.View?.ViewID;
      const spaceId = ev.View?.SpaceID;
      // FilterID can be on the View directly or on the included Filter object
      const filterId = ev.View?.FilterID ?? ev.Filter?.FilterID;

      if (viewId && spaceId) {
        await hubApi.delete(`/api/space/${spaceId}/view/${viewId}`);
      }
      if (filterId && spaceId) {
        await hubApi.delete(`/api/space/${spaceId}/filter/${filterId}`);
      }
    }
  }
}
