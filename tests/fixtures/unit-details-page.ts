// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class UnitDetailPage {
  public readonly overviewTab: Locator;
  public readonly configTab: Locator;
  public readonly mutationsTab: Locator;
  private readonly invokeButton: Locator;
  public readonly moreItemsButton: Locator;
  private readonly revisionsTab: Locator;
  private readonly mutationDetailsButton: Locator;

  constructor(public readonly page: Page) {
    this.overviewTab = this.page.getByRole('tab', { name: 'Overview' });
    this.configTab = this.page.getByRole('tab', { name: 'Config' });
    this.mutationsTab = this.page.getByRole('tab', { name: /^Mutations/ });
    this.revisionsTab = this.page.getByRole('tab', { name: 'Revisions' });
    this.invokeButton = this.page.getByRole('button', { name: 'Invoke' });
    this.moreItemsButton = this.page.getByRole('button', { name: 'More' });
    this.mutationDetailsButton = this.page.getByRole('button', { name: 'Mutation Details' });
  }

  async goToRevisionsTab() {
    await this.revisionsTab.click();
    // Wait for the tab to become selected
    await expect(this.revisionsTab).toHaveAttribute('aria-selected', 'true');
  }

  async goToMutationDetailsDrawer() {
    await this.mutationDetailsButton.click();
    // Wait for the mutation details drawer (MUI Drawer) to open
    await expect(this.page.locator('.MuiDrawer-root .MuiDrawer-paper')).toBeVisible();
  }

  async goToMutationsTab() {
    await this.mutationsTab.click();
    // Wait for the tab to become selected
    await expect(this.mutationsTab).toHaveAttribute('aria-selected', 'true');
  }

  async checkRowInTableByName(name: string) {
    const row = this.page.getByRole('row', { name: name }).first();

    // Ensure the row is visible
    await row.getByRole('checkbox').check();
  }

  async expectToBeVisibleByText(text: string, exact: boolean = false) {
    await expect(this.page.getByText(text, { exact }).first()).toBeVisible();
  }

  async fillNumberInputByName(name: string, value: string) {
    await this.page.getByRole('spinbutton', { name }).fill(value);
  }

  async fillTextInputByName(name: string, value: string) {
    await this.page.getByRole('textbox', { name }).fill(value);
  }

  async clickInvokeButton() {
    await this.invokeButton.click();
  }

  async openInvokerSidebar() {
    const searchField = this.page.getByPlaceholder('Search functions');
    // isVisible() returns true even when the sidebar is closed (element is off-screen
    // inside overflow:hidden width:0 container). Use bounding box width to detect true open state.
    const box = await searchField.boundingBox();
    const isOpen = box !== null && box.width > 100;
    if (!isOpen) {
      await this.page.getByRole('button', { name: 'Functions', exact: true }).click();
      // Wait for the 225ms CSS width transition to finish: the search field is fully
      // expanded once its rendered width exceeds the collapsed (off-screen) state.
      await expect
        .poll(async () => (await searchField.boundingBox())?.width ?? 0, { timeout: 5000 })
        .toBeGreaterThan(100);
    }
  }

  async selectFunctionByName(name: string) {
    await this.openInvokerSidebar();

    const searchField = this.page.getByPlaceholder('Search functions');
    await searchField.fill(name);

    const functionItem = this.page.getByTestId(`function-item-${name}`).first();
    await functionItem.waitFor({ state: 'visible', timeout: 10000 });

    // force:true bypasses Playwright's stability check so the click fires even
    // while the sidebar panel width-transition is still running (225ms).
    await functionItem.click({ force: true, timeout: 10000 });
  }

  async invokeFunctionByNameWithParameters({
    functionName,
    params,
  }: {
    functionName: string;
    params: Array<{ name: string; value: string; type?: 'string' | 'number' }>;
  }) {
    await this.selectFunctionByName(functionName);

    for (const param of params) {
      try {
        if (param.type === 'number') {
          await this.fillNumberInputByName(param.name, param.value);
        } else {
          await this.fillTextInputByName(param.name, param.value);
        }
      } catch {
        console.log(`Could not fill parameter ${param.name} with value ${param.value}`);
      }
    }

    await this.clickInvokeButton();
  }
}
