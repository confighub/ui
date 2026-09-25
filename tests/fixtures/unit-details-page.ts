// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

export class UnitDetailPage {
  public readonly overviewTab: Locator;
  public readonly configTab: Locator;
  public readonly mutationsTab: Locator;
  private readonly functionSelect: Locator;
  private readonly invokeButton: Locator;
  public readonly moreItemsButton: Locator;
  private readonly revisionsTab: Locator;
  private readonly mutationDetailsButton: Locator;
  private readonly confirmButton: Locator;

  constructor(public readonly page: Page) {
    this.overviewTab = this.page.getByRole('tab', { name: 'Overview' });
    this.configTab = this.page.getByRole('tab', { name: 'Config' });
    this.mutationsTab = this.page.getByRole('tab', { name: /^Mutations/ });
    this.revisionsTab = this.page.getByRole('tab', { name: 'Revisions' });
    this.functionSelect = this.page.getByRole('combobox', { name: 'Functions' });
    this.invokeButton = this.page.getByRole('button', { name: 'Invoke' });
    this.moreItemsButton = this.page.getByRole('button', { name: 'More' });
    this.mutationDetailsButton = this.page.getByRole('button', { name: 'Mutation Details' });
    this.confirmButton = this.page.getByRole('button', { name: 'Confirm' });
  }

  async goToResourcesTab() {
    await this.page.getByRole('tab', { name: 'Resources' }).click();
  }

  async clickConfirmButton() {
    await this.confirmButton.click();
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

  // Access Elements
  getByText(text: string) {
    return this.page.getByText(text);
  }

  async checkRowInTableByName(name: string) {
    const row = this.page.getByRole('row', { name: name }).first();

    // Ensure the row is visible
    await row.getByRole('checkbox').check();
  }

  getActivityByText(text: string) {
    return this.page.getByRole('paragraph').filter({ hasText: text });
  }

  async expectToBeVisibleByText(text: string, exact: boolean = false) {
    await expect(this.page.getByText(text, { exact }).first()).toBeVisible();
  }

  async expectToHaveCountByText(text: string, count: number, timeout?: number) {
    // Try exact match first
    let elements = this.page.getByText(text);
    const exactCount = await elements.count();

    if (exactCount === count) {
      await expect(elements).toHaveCount(count, { timeout: timeout ?? 5000 });
    } else {
      // Fall back to partial match for HighlightedCell
      elements = this.page.locator(`text=${text}`);
      await expect(elements).toHaveCount(count, { timeout: timeout ?? 5000 });
    }
  }

  async expectToHaveCount(text: string, count: number) {
    const elements = this.page.getByText(text);
    await expect(elements).toHaveCount(count);
  }

  async selectMoreItemsOptionByName(text: string) {
    await this.moreItemsButton.click();
    await this.page.getByRole('menuitem', { name: text }).click();
  }

  // Unit Operations

  async updateUnitName(newName: string) {
    await this.page.getByRole('textbox', { name: 'Name' }).fill(newName);

    await this.page.getByRole('button', { name: 'Save' }).click();
  }

  /**
   * Edits the unit's raw config YAML via the Config tab's editor and submits the change.
   * There is no structured attribute-editing form any more (the Attributes tab was
   * removed), so callers replace a value directly in the source YAML text.
   */
  private async editConfigYaml(transformYaml: (yaml: string) => string, changeDescription: string) {
    // Start from a neutral state
    await this.overviewTab.click();
    await expect(this.overviewTab).toHaveAttribute('aria-selected', 'true');

    await this.configTab.click();
    await expect(this.configTab).toHaveAttribute('aria-selected', 'true');

    // Enter edit mode
    await this.page.getByRole('button', { name: 'Edit', exact: true }).click();

    const yamlFilePath = path.resolve(__dirname, '../test-data/todo-app-load-balancer.yml');
    const updatedYaml = transformYaml(readFileSync(yamlFilePath, 'utf-8'));

    // Replace the editor's whole content by pasting the updated YAML in
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate((text) => navigator.clipboard.writeText(text), updatedYaml);

    const editor = this.page.locator('div.monaco-editor');
    await editor.click();
    await editor.press('Control+A');
    await editor.press('Meta+A');
    await editor.press('Control+V');
    await editor.press('Meta+V');

    // Click Save
    await this.page.getByRole('button', { name: 'Save' }).click();

    // Add Change Description
    await this.page.getByRole('textbox', { name: 'Change Description' }).fill(changeDescription);

    // Submit the change (button click auto-waits)
    await this.page.getByRole('button', { name: 'Submit' }).click();

    // Go back to the dashboard view
    await this.overviewTab.click();
    await expect(this.overviewTab).toHaveAttribute('aria-selected', 'true');

    // Refresh and wait for the unit data to reload
    await Promise.all([
      this.page.waitForResponse(
        (resp) => resp.url().includes('/api/unit') && resp.request().method() === 'GET',
      ),
      this.page.getByTestId('refresh-button').click(),
    ]);
  }

  async updateConfigReplicas(replicas: string) {
    await this.editConfigYaml(
      (yaml) => yaml.replace(/replicas: \d+/, `replicas: ${replicas}`),
      'Update replicas',
    );
  }

  async updateConfigRepository(image: string) {
    await this.editConfigYaml(
      (yaml) => yaml.replace(/image: nginx:latest/, `image: ${image}`),
      'Update image',
    );
  }

  // Function Invocation

  async selectFunction(functionName: string) {
    // Use the improved selectFunctionByName method
    await this.selectFunctionByName(functionName);
  }

  async invokeFunction(functionName: string, parameters: Record<string, string> = {}) {
    // Select the function from the dropdown in header
    await this.selectFunction(functionName);

    // Wait for the function modal to appear
    await expect(this.page.getByRole('dialog')).toBeVisible();

    // Fill in parameters if provided
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const input = this.page.getByRole('textbox', { name: paramName });
      await input.fill(paramValue);
    }

    // Click the invoke button in the modal and wait for the invocation API call
    await Promise.all([
      this.page.waitForResponse(
        (resp) =>
          resp.url().includes('/function/invoke') && resp.request().method() === 'POST',
      ),
      this.page.getByRole('dialog').getByRole('button', { name: 'Invoke' }).click(),
    ]);
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

  async getRevisionByText(text: string | RegExp) {
    const revisionRow = await this.page.getByRole('row', { name: text });

    const checkbox = revisionRow.getByRole('checkbox');
    await checkbox.check();
    // Wait for the row selection to register
    await expect(checkbox).toBeChecked();
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

  async invokeEnsurecontextFunction(value?: string) {
    await this.selectFunctionByName('ensure-context');

    if (value) {
      // Success path: an add-context value is selected, so invoking fires the
      // /function/invoke POST. Wait for that response as the completion signal.
      // Button click auto-waits for the function form to render.
      await this.page.getByRole('button', { name: value }).click();
      await Promise.all([
        this.page.waitForResponse(
          (resp) =>
            resp.url().includes('/function/invoke') && resp.request().method() === 'POST',
        ),
        this.clickInvokeButton(),
      ]);
    } else {
      // Error path: no add-context value selected, so invoking triggers a
      // client-side validation error and never sends /function/invoke. The
      // caller's web-first assertion on the error text is the synchronization.
      await this.clickInvokeButton();
    }
  }
}
