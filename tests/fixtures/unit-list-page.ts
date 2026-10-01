// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//  https://playwright.dev/docs/pom
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

import { Unit } from '@confighub/rtk-query';
import { Role } from '../types';
import { ApiHelper } from './api-helper';
import { EntityGridFixture } from './entity-grid-fixture';
import { hubApi } from './test';

export type AdvancedFilterType = {
  space: string;
  resourceType: string;
  whereData?: string;
  where?: string;
};

export type UnitCreateTypes =
  | 'todo-app-fe'
  | 'todo-app-be'
  | 'todo-app-db'
  | 'todo-app-load-balancer'
  | 'nginx'
  | 'ai-chat-app'
  | 'basic-deployment'
  | 'network-ingress'
  | 'namespace'
  | 'postgress'
  | 'crm-app'
  | 'cluster-role'
  | 'backend';

export type CreateUnitParams = {
  unitType: UnitCreateTypes;
  slug?: string;
  toolchainType?: string;
  spaceSlug?: string;
  labels?: Record<string, string>;
};

dotenv.config();
const filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(filename);
const authFile = path.join(__dirname, '../authentication.json');

const username = process.env.TEST_USER || '';
const password = process.env.TEST_PASSWORD || '';

// Test constants
const DEFAULT_TOOLCHAIN_TYPE = 'Kubernetes/YAML';

export class UnitListPage extends EntityGridFixture {
  private readonly moreItemsButton: Locator;
  private readonly cloneButton: Locator;
  private readonly deleteModalConfirm: Locator;
  private readonly functionSelect: Locator;
  private readonly invokeButton: Locator;
  private readonly recentFilterSelect: Locator;
  private readonly filterSelect: Locator;
  private readonly shareViewButton: Locator;
  private readonly shareFilterButton: Locator;
  private readonly previewLink: Locator;
  private readonly columnSelectButton: Locator;
  private readonly selectFilter: Locator;
  private readonly saveOptionsButton: Locator;
  private readonly saveInvocationButton: Locator;
  private readonly cancelButton: Locator;
  private readonly refreshButton: Locator;

  constructor(public readonly page: Page) {
    super(page);
    this.moreItemsButton = this.page.getByRole('button', { name: 'More' });
    this.cloneButton = this.page.getByRole('button', { name: 'Clone' });
    this.deleteModalConfirm = this.page.getByRole('button', { name: 'Confirm' });
    this.invokeButton = page.getByRole('button', { name: 'Invoke' });
    this.functionSelect = page.getByRole('combobox', { name: 'Functions' });
    this.recentFilterSelect = page.getByRole('combobox', { name: 'Recent Filters' });
    this.filterSelect = this.page.getByTestId('filter-select');
    this.shareViewButton = this.page.getByRole('button', { name: 'Share view' });
    this.shareFilterButton = this.page.getByRole('button', { name: 'Share filter' });
    this.previewLink = this.page.getByText('Preview');
    this.columnSelectButton = this.page.getByRole('button', { name: 'Select columns' });
    this.selectFilter = this.page.getByRole('combobox', {
      name: 'Select a filter or view...',
    });
    this.saveOptionsButton = this.page.getByRole('button', { name: 'Save', exact: true });
    this.saveInvocationButton = this.page.getByRole('button', { name: 'Save', exact: true });
    this.cancelButton = this.page.getByRole('button', { name: 'Cancel' });
    this.refreshButton = this.page.getByTestId('refresh-button');
  }

  async clickRefreshButton() {
    await this.refreshButton.click();
  }

  async clickSelectFilterAutocomplete() {
    await this.selectFilter.click();
  }

  async clickColumnSelection() {
    await this.columnSelectButton.click();
  }

  async clickPreviewLink() {
    await this.previewLink.click();
  }

  async clickShareViewButton() {
    await this.shareViewButton.click();
  }

  async clickShareFilterButton() {
    await this.shareFilterButton.click();
  }

  async goto() {
    await this.page.goto('/units');
  }

  async clickFilterSelect() {
    await this.filterSelect.click();
  }

  /**
   * No-op - QueryBuilder is always visible in the header now
   * @deprecated QueryBuilder is always visible, no need to click to expand
   */
  async clickAdvancedFilterButton() {
    // QueryBuilder is always visible in the header, no need to click
  }

  async clickUnitsLeftNavLink() {
    await this.page.getByRole('button', { name: 'Units', exact: true }).click();
  }

  async hoverOverFunctionsSelect() {
    await this.functionSelect.hover();
  }

  async clickUnitListNavItem() {
    await this.page.getByRole('button', { name: 'Units' }).click();

    // Wait for the units grid to finish loading
    await this.waitForGridReady();
  }

  async goToUnitDetailPageByRowClick(name: string) {
    const row = await this.getRowByName(name);

    // Click the unit name link within the row
    await row.getByRole('link', { name }).click();
  }

  // Removed: checkUnitByNameInTable - use selectRow() from EntityGridFixture
  // Removed: checkAllUnitsInTable - use selectAllRows() from EntityGridFixture
  // Removed: getUnitByNameInTable - use getRowByName() from EntityGridFixture

  async login() {
    await this.goto();
    await this.page.getByRole('textbox', { name: 'Email' }).fill(username);
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();

    await this.page.context().storageState({ path: authFile });
  }

  /**
   * Create a unit via API (FAST) - Use this for most tests
   */
  async createUnitViaAPI(params: CreateUnitParams) {
    const { unitType, slug, toolchainType, spaceSlug, labels } = params;
    const unitSlug = slug ?? unitType;
    const selectedToolchainType = toolchainType ?? DEFAULT_TOOLCHAIN_TYPE;

    // Read the YAML file
    const yamlFilePath = path.resolve(__dirname, `../test-data/${unitType}.yml`);
    const yamlData = readFileSync(yamlFilePath, 'utf-8');

    // Get the appropriate space
    const apiHelper = new ApiHelper(this.page);
    const space = spaceSlug
      ? await apiHelper.getSpaceBySlug(spaceSlug)
      : await apiHelper.getFirstSpace();
    const spaceId = space.SpaceID;

    // Create the unit via API. `Data` is no longer accepted inline in the
    // create body — Unit.Data is `json:"-"` server-side (config Data and
    // MutationSources split into their own APIs, #5140), so a `Data` field
    // here would be silently dropped, leaving the unit with empty config.
    // Written through the dedicated PUT .../data endpoint below instead.
    const response = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: {
        allow_exists: 'true',
      },
      data: {
        Slug: unitSlug,
        ToolchainType: selectedToolchainType,
        ...(labels && { Labels: labels }),
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to create unit: ${response.status()} ${await response.text()}`);
    }

    // Wait for the response to ensure the unit is created and save the result.
    // POST /api/space/{spaceId}/unit now returns UnitCreateOrUpdateResponseRead
    // (config Data and MutationSources split into their own APIs), so the
    // created Unit is under `.Unit` — see api-helper.ts's createUnit for the
    // same fix. Untyped here (response.json() infers `any`), so this was the
    // kind of break the compiler could not catch: the one caller that reads
    // the result (unit-detail-page.spec.ts) silently got `UnitID: undefined`
    // instead of a thrown error.
    const body = await response.json();
    const createdUnit = body?.Unit;
    // Matches `ApiHelper.createUnit`'s check on the identical response shape,
    // and for the identical reason. `createdUnit?.UnitID ?? ''` used to paper
    // over a missing id: the upload below would then POST to
    // `/api/space/<id>/unit//data`, and the test failed somewhere later with a
    // message about the page rather than about the response — the exact
    // silently-wrong-shape failure the comment above describes being caught
    // once already. Throwing here names the cause at the point it occurs.
    if (!createdUnit?.UnitID) {
      throw new Error('Invalid response: missing Unit.UnitID in created unit');
    }

    // Write the configuration (raw text, not base64) through the dedicated
    // Data endpoint now that it can no longer ride along on unit creation.
    await apiHelper.uploadUnitData({
      spaceId,
      unitId: createdUnit.UnitID,
      body: yamlData,
    });

    // Configuration is a separate write: the Unit body has nowhere to put one.
    const unitId = createdUnit.Unit?.UnitID ?? createdUnit.UnitID;
    const dataResponse = await hubApi.put(
      `/api/space/${spaceId}/unit/${unitId}/data`,
      { headers: { 'Content-Type': 'application/octet-stream' }, data: yamlData },
    );
    if (!dataResponse.ok()) {
      throw new Error(
        `Failed to set unit data: ${dataResponse.status()} ${await dataResponse.text()}`,
      );
    }

    // If already on the unit list page (not detail page), click refresh button. Otherwise navigate to the page.
    const url = new URL(this.page.url());
    const pathSegments = url.pathname.split('/').filter(Boolean);
    // Unit list page has path like /units, unit detail page has /units/:spaceSlug/:unitSlug
    const isUnitListPage = pathSegments.length === 1 && pathSegments[0] === 'units';
    if (isUnitListPage) {
      await Promise.all([
        this.page.waitForResponse(
          (resp) => resp.url().includes('/api/unit') && resp.request().method() === 'GET',
        ),
        this.page.getByTestId('refresh-button').click(),
      ]);
    } else {
      await this.goto();
    }

    return createdUnit;
  }

  /**
   * Update a unit via API using the same types as RTK Query
   */
  async updateUnitViaAPI({
    existingUnit,
    spaceId,
    unitSlug,
    toolchainType,
  }: {
    existingUnit: Unit;
    spaceId: string;
    unitSlug: string;
    toolchainType?: string;
  }) {
    const apiHelper = new ApiHelper(this.page);

    const selectedToolchainType = toolchainType ?? DEFAULT_TOOLCHAIN_TYPE;

    // Use the API helper to update the unit (same endpoint as RTK Query)
    // The existingUnit should already contain the ChangeSetID from createUnitViaAPI
    return apiHelper.updateUnit({
      spaceId,
      unitId: existingUnit.UnitID ?? '',
      changeSetId: existingUnit.ChangeSetID,
      unit: {
        Slug: unitSlug,
        ToolchainType: selectedToolchainType,
      },
    });
  }

  /**
   * Create a unit via UI (SAFE for testing the UI) - Use only for testing the Add Unit UI flow
   */
  async createUnitViaUI(params: CreateUnitParams) {
    const { unitType, slug, toolchainType, spaceSlug, labels } = params;
    const unitSlug = slug ?? unitType;
    const selectedToolchainType = toolchainType ?? DEFAULT_TOOLCHAIN_TYPE;

    await this.goto();
    await this.page.getByRole('button', { name: 'Add', exact: true }).click();

    // Fill in the name
    const nameTextBox = this.page.getByRole('textbox', { name: 'Name' });
    await nameTextBox.fill(unitSlug);

    // Select space
    await this.page.locator('#mui-component-select-SpaceID').click();
    if (spaceSlug) {
      await this.page.getByRole('listbox').getByRole('option').getByText(spaceSlug).click();
    } else {
      await this.page.getByRole('listbox').getByRole('option').first().click();
    }

    // Select toolchain type
    await this.page.getByRole('combobox', { name: 'Toolchain Type' }).click();
    await this.page.getByRole('option', { name: selectedToolchainType }).click();

    // Add labels if provided
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        const addButton = this.page.getByRole('button', { name: 'Add' }).first();
        await addButton.focus();
        await addButton.click();
        await addButton.click();
        // Key/Value fields appear after adding a label row (fill auto-waits)
        await this.page.getByRole('textbox', { name: 'Key' }).fill(key);
        await this.page.getByRole('textbox', { name: 'Value' }).fill(value);
        await this.page.getByRole('button', { name: 'Add' }).click();
        // Wait for the label row to commit (Key field resets to empty)
        await expect(this.page.getByRole('textbox', { name: 'Key' })).toHaveValue('');
      }
    }

    await this.page.getByRole('button', { name: 'Next' }).click();

    // Paste YAML into editor
    await this.pasteYamlToEditor(unitType);

    await this.page.getByRole('button', { name: 'Next' }).click();
    await this.page.getByRole('button', { name: 'Create Unit' }).click();

    // Wait for success or error
    await Promise.race([
      this.page.waitForResponse(
        (response) => response.url().includes('/api/space') && response.status() === 200,
        { timeout: 10000 },
      ),
      this.page
        .getByRole('dialog')
        .filter({ hasText: 'A Unit with the same value already exists' })
        .waitFor({ timeout: 3000 })
        .catch(() => null),
    ]);

    // Check if there's an error dialog (unit already exists)
    const errorDialog = this.page
      .getByRole('dialog')
      .filter({ hasText: 'A Unit with the same value already exists' });
    if (await errorDialog.isVisible({ timeout: 1000 })) {
      await this.page
        .getByRole('dialog')
        .getByRole('button', { name: 'close' })
        .first()
        .click();
      await this.page.getByRole('button', { name: 'close' }).click();
    }
  }

  async checkIfUnitExists(slug: string) {
    try {
      // Make sure we're on the units page
      await this.goto();

      // Wait for the page to load and the table to be visible
      await this.page.waitForSelector('table', { timeout: 10000 });

      // Look for the unit slug in the table
      const unitElement = this.page.getByRole('link', { name: slug });

      // Check if the element is visible with a short timeout
      const isVisible = await unitElement.isVisible({ timeout: 2000 });

      return isVisible;
    } catch (error) {
      // If there's any error (timeout, element not found, etc.), assume unit doesn't exist
      console.log(`Error checking if unit exists: ${error}`);
      return false;
    }
  }

  async bulkUpdateUnitsByName({
    names,
    targetName,
    labels,
    deleteGates,
    destroyGates,
    skipUpdate = false,
  }: {
    names: string[];
    targetName?: string;
    labels?: Record<string, string>;
    deleteGates?: string[];
    destroyGates?: string[];
    skipUpdate?: boolean;
  }) {
    for (const name of names) {
      await this.selectRow(name);
    }

    await this.selectMoreItemsOptionByName('Update');

    // Select target if provided
    if (targetName) {
      await this.page.getByTestId('target-select').click();
      await this.page.waitForSelector('[role="listbox"]');
      await this.page.getByRole('option', { name: targetName, exact: true }).click();
    }

    // Add labels if provided
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        await this.page.getByRole('combobox', { name: 'key' }).fill(key);
        await this.page.getByRole('textbox', { name: 'value' }).fill(value);
        await this.page.getByTestId('add-label-button').click();
      }
    }

    // Add delete gates if provided
    if (deleteGates) {
      for (const gate of deleteGates) {
        await this.page.getByRole('combobox', { name: 'e.g., manual-review' }).fill(gate);
        await this.page.getByTestId('add-delete-gate-button').click();
      }
    }

    // Add destroy gates if provided
    if (destroyGates) {
      for (const gate of destroyGates) {
        await this.page
          .getByRole('combobox', { name: 'e.g., production-protection' })
          .fill(gate);
        await this.page.getByTestId('add-destroy-gate-button').click();
      }
    }

    if (!skipUpdate) {
      // Wait for the API call to complete by intercepting the network request
      const responsePromise = this.page.waitForResponse(
        (response) => response.url().includes('/api/unit') && response.status() === 200,
      );

      await this.page.getByRole('button', { name: 'Update Units' }).click();

      // Wait for the API response
      await responsePromise;
    }
  }

  async cloneUnit({
    slug,
    slugClone,
    labels,
    enableCloneSpace,
    spaceCloneSlug,
  }: {
    slug: string;
    slugClone: string;
    labels?: Record<string, string>;
    enableCloneSpace?: boolean;
    spaceCloneSlug?: string;
  }) {
    await this.checkRowByName(slug);

    await this.selectMoreItemsOptionByName('Clone');

    if (enableCloneSpace && spaceCloneSlug) {
      // Toggle the "Clone Space" option if specified
      await this.page.getByTestId('clone-space-radio-option').click();

      // Select the Space to clone
      await this.page.getByTestId('space-selector').click();
      await this.page.getByRole('option', { name: 'Default' }).click();

      // Add clone name
      // await this.page.getByTestId('new-space-name-input').fill(spaceCloneSlug);
      await this.page.getByRole('textbox', { name: 'Space Name' }).fill(spaceCloneSlug);
    }

    // await this.page.getByTestId('clone-name-input').fill(slugClone);
    await this.page.getByRole('textbox', { name: 'Clone Name' }).fill(slugClone);

    // Expand the Metadata section
    await this.page.getByTestId('expand-unit-metadata-toggle').click();

    // Add labels if provided
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        await this.page.getByRole('combobox', { name: 'key' }).fill(key);
        await this.page.getByRole('textbox', { name: 'value' }).fill(value);
        await this.page.getByTestId('add-label-button').click();
      }
    }

    // Wait for the clone button to be enabled (if it needs to process the prefix)
    await this.page.getByRole('button', { name: 'Clone Unit' }).waitFor({ state: 'visible' });

    // Clone the unit
    await this.clickCloneConfirmButton();

    // Wait to be redirected to the new unit
    await this.page.waitForURL((url) => url.href.includes(`units`));
  }

  /**
   * Clone multiple units at once
   * @param rowCount - Number of rows to select (selects top N rows)
   * @param labels - Optional labels to add to cloned units
   * @param enableCloneSpace - Whether to clone to a new space (clones source space)
   * @param spaceCloneSlug - Name for the cloned space (required if enableCloneSpace is true)
   */
  async cloneMultipleUnits({
    rowCount,
    labels,
    spaceSlug = 'Default',
  }: {
    rowCount: number;
    labels?: Record<string, string>;
    spaceSlug?: string;
  }) {
    // Select rows by index (start at index 1 to skip header row)
    const rows = this.page.getByRole('row').locator('input[type="checkbox"]');
    for (let i = 1; i <= rowCount; i++) {
      await rows.nth(i).check();
    }

    // Click the Clone button
    await this.selectMoreItemsOptionByName('Clone');

    // Select the source space to clone
    await this.page.getByRole('combobox', { name: 'Space' }).click();
    await this.page.getByRole('option', { name: spaceSlug }).first().click();

    // Expand the Unit Metadata section
    // (the label fields / Clone Units button below auto-wait for the section to expand)
    await this.page.getByTestId('expand-unit-metadata-toggle').click();

    // Add labels if provided
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        await this.page.getByRole('combobox', { name: 'key' }).fill(key);
        await this.page.getByRole('textbox', { name: 'value' }).fill(value);
        await this.page.getByTestId('add-label-button').click();
      }
    }

    // Wait for the clone button to be enabled
    await this.page.getByRole('button', { name: 'Clone Units' }).waitFor({ state: 'visible' });

    // Click the Clone Units button
    await this.page.getByRole('button', { name: 'Clone Units' }).click();

    // Wait for navigation to units list with filter applied, then for the grid to load
    await this.page.waitForURL((url) => url.href.includes('units'));
    await this.waitForGridReady();
  }

  async checkRowByName(name: string) {
    const row = await this.getRowByName(name);
    // Ensure the row is visible and check the checkbox
    await row.getByRole('checkbox').check();
  }

  async deleteSelectedUnits() {
    // 1) Pick the “Delete” option
    await this.selectMoreItemsOptionByName('Delete');

    // 2) Confirm the deletion
    await this.clickConfirmDelete();
  }

  async deleteUnitByName(name: string) {
    await this.selectRow(name);
    await this.selectMoreItemsOptionByName('Delete');
    await this.clickConfirmDelete();
  }

  async attemptDeleteUnitByNameExpectingError(name: string, expectedError: string) {
    await this.selectRow(name);
    await this.selectMoreItemsOptionByName('Delete');

    // Wait for the API error response
    const responsePromise = this.page.waitForResponse(
      (response) => response.url().includes('/api/unit') && response.status() >= 400,
    );

    await this.clickConfirmDelete();

    // Wait for the error response
    await responsePromise;

    // Verify the expected error message appears (auto-waits for it to render)
    await this.expectToBeVisibleByText(expectedError);
  }

  async clickConfirmDelete() {
    await this.deleteModalConfirm.click();
  }

  async clickNext() {
    await this.page.getByRole('button', { name: 'Next' }).click();
  }

  async clickCloneConfirmButton() {
    await this.page.getByRole('button', { name: 'Clone Unit' }).click();
  }

  async openInvokerSidebar() {
    // If on FunctionDetailScreen (back button visible), navigate back to the function list first
    const backButton = this.page.locator('[aria-label="back"]');
    if (await backButton.isVisible()) {
      await backButton.click();
      // Wait until we've left the function detail view (back button disappears)
      await expect(backButton).toBeHidden();
    }

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
    // openInvokerSidebar waits for the panel to finish opening; the
    // functionItem.waitFor below then auto-waits for the filtered item.
    await this.openInvokerSidebar();

    const searchField = this.page.getByPlaceholder('Search functions');
    await searchField.fill(name);

    const functionItem = this.page.getByTestId(`function-item-${name}`).first();
    await functionItem.waitFor({ state: 'visible', timeout: 10000 });

    // force:true bypasses Playwright's stability check so the click fires even
    // while the sidebar panel width-transition is still running (225ms).
    await functionItem.click({ force: true, timeout: 10000 });
  }

  async selectAndInvokeSavedFunction(name: string) {
    await this.selectFunctionByName(name);
    // Wait for the function form to load (Invoke button becomes enabled)
    await expect(this.invokeButton).toBeEnabled();
    await this.clickInvokeButton();
  }

  async fillInputByName(name: string, value: string, role: Role = 'spinbutton') {
    await this.page.getByRole(role, { name }).fill(value);
  }

  async hoverOverFunctionByName(name: string) {
    // openInvokerSidebar waits for the panel to open; fill/hover then auto-wait.
    await this.openInvokerSidebar();

    const searchField = this.page.getByPlaceholder('Search functions');
    await searchField.fill(name);

    await this.page.getByTestId(`function-item-${name}`).first().hover();
  }

  async pasteYamlToEditor(name: UnitCreateTypes) {
    // Read the YAML file into a string
    const yamlFilePath = path.resolve(__dirname, `../test-data/${name}.yml`);
    const yamlRaw = readFileSync(yamlFilePath, 'utf-8');
    const yamlDocuments = yaml.loadAll(yamlRaw);

    // Convert the parsed YAML to a string
    // Convert each YAML document back to a string and join them with `---`
    const yamlStringFormatted = yamlDocuments.map((doc) => yaml.dump(doc)).join('\n---\n');

    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      yamlStringFormatted,
    );
    const editor = this.page.locator('div.monaco-editor');
    await editor.click();
    await editor.press('Control+V');
    await editor.press('Meta+V');
  }

  async clickCloneButton() {
    await this.cloneButton.click();
  }

  async clickInvokeButton() {
    await this.invokeButton.click();
  }

  async clickRecentFilterSelect() {
    await this.recentFilterSelect.click();
  }

  async selectMoreItemsOptionByName(text: string) {
    await this.moreItemsButton.click();
    await this.page.getByRole('menuitem', { name: text }).click();
  }

  async invokeFunctionByNameWithParameters({
    name,
    functionName,
    params,
    role = 'spinbutton',
  }: {
    name: string;
    functionName: string;
    params: Array<{ name: string; value: string }>;
    role?: Role;
  }) {
    // Ensure unit is visible and selectable
    await this.selectRow(name);

    // Select function with retry logic
    await this.selectFunctionByName(functionName);

    // Fill parameters sequentially (not in parallel with forEach).
    // fillInputByName auto-waits for each field as the form renders.
    for (const param of params) {
      await this.fillInputByName(param.name, param.value, role);
    }

    // Ensure invoke button is enabled and clickable
    await this.page.waitForSelector('button:has-text("Invoke"):not([disabled])', {
      timeout: 5000,
    });

    // Click invoke and wait for the function invocation API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/function/invoke') &&
          response.request().method() === 'POST',
      ),
      this.clickInvokeButton(),
    ]);
  }

  async invokeAppConfigFunctionForAllUnitsByNameWithParameters(
    functionName: string,
    params: Array<{ name: string; value: string; Role?: Role }>,
  ) {
    // Select the first 2 rows instead of all rows
    const rows = this.page.getByRole('row').locator('input[type="checkbox"]');
    const firstCheckbox = rows.nth(1); // Skip header row (index 0)
    const secondCheckbox = rows.nth(2);

    await firstCheckbox.check();
    await secondCheckbox.check();

    await this.selectFunctionByName(functionName);

    params.forEach(async (param) => {
      await this.fillInputByName(param.name, param.value, param.Role || 'spinbutton');
    });

    await this.clickInvokeButton();
  }

  async invokeEnsurecontextFunction(name: string, value?: string) {
    await this.checkRowByName(name);

    await this.selectFunctionByName('ensure-context');

    if (value) {
      // Success path: an add-context value is selected, so invoking fires the
      // /function/invoke POST. Wait for that response as the completion signal.
      // Button click auto-waits for the function form to render.
      await this.page.getByRole('button', { name: value }).click();
      await Promise.all([
        this.page.waitForResponse(
          (response) =>
            response.url().includes('/function/invoke') &&
            response.request().method() === 'POST',
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

  async applyQuickFilterByName(filterName: string) {
    try {
      // Sometimes an error is returned even though the combo box was selected and the filter applied properly.
      // Just leaving this here for now since the tests actually work.
      await this.page.getByRole('combobox', { name: 'Quick Filters' }).click();

      await this.page.getByRole('option', { name: filterName }).click();
    } finally {
      console.log('Quick filter applied:', filterName);
    }
  }

  async groupSelectedUnits() {
    await this.selectMoreItemsOptionByName('Group');

    // Wait for the group modal to appear
    await this.page.getByRole('dialog').waitFor();

    await this.page.getByRole('textbox', { name: 'Name' }).fill('test-group');
    await this.page.getByRole('button', { name: 'Add' }).click();
  }

  async linkSelectedUnits() {
    await this.selectMoreItemsOptionByName('Link');

    // Wait for the link modal to appear
    await this.page.getByRole('dialog').waitFor();

    // Fill in the link name
    await this.page.getByRole('textbox', { name: 'Link Name' }).fill('test-link');

    // Click Add to create the link and wait for the create API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/link') && response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: 'Add' }).click(),
    ]);
  }

  async goToUnitDetailPageByName(name: string) {
    // Get the row (will automatically search if not visible)
    const row = await this.getRowByName(name);

    // Click the link within the row
    await row.getByRole('link', { name: name }).click();

    await this.page.waitForTimeout(3000);
  }

  async saveFunctionInvocationyByNameWithparameters({
    name,
    functionName,
    savedInvocationName,
    params,
    role = 'spinbutton',
  }: {
    name: string;
    functionName: string;
    savedInvocationName: string;
    params: Array<{ name: string; value: string }>;
    role?: Role;
  }) {
    // Ensure unit is visible and selectable
    await this.selectRow(name);

    // Select function with retry logic
    await this.selectFunctionByName(functionName);

    // Fill parameters sequentially (not in parallel with forEach).
    // fillInputByName auto-waits for each field.
    for (const param of params) {
      await this.fillInputByName(param.name, param.value, role);
    }

    // Open the inline save panel
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();

    // Fill in the invocation name (field is pre-filled with function name, overwrite it).
    // Matched by placeholder, not label: a bare getByLabel('Name') substring-matches
    // the grid's "namespaces" column cells too, since "Name" is a substring of
    // "namespaces" — and { exact: true } then finds nothing, because this field is
    // `required`, and MUI appends an asterisk to the computed label ("Name *"), so
    // neither a substring nor an exact match on "Name" alone is correct here.
    await this.page.getByPlaceholder('e.g., my-production-deployment').fill(savedInvocationName);

    // Select space
    await this.page.getByRole('combobox', { name: 'Space' }).click();
    await this.page.getByRole('option', { name: 'Default' }).click();

    // Save the invocation and wait for the create API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/invocation') &&
          response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);

    // Navigate back to the function list
    await this.page.locator('[aria-label="back"]').click();
  }

  async editSavedFunctionInvocationWithParameters({
    savedInvocationName,
    params,
    role = 'spinbutton',
  }: {
    savedInvocationName: string;
    params: Array<{ name: string; value: string }>;
    role?: Role;
  }) {
    // Click the saved invocation to load it with prefilled parameters.
    // fillInputByName below auto-waits for each prefilled field.
    await this.selectFunctionByName(savedInvocationName);

    // Edit parameters
    for (const param of params) {
      await this.fillInputByName(param.name, param.value, role);
    }

    // Click invoke and wait for the function invocation API call to complete
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/function/invoke') &&
          response.request().method() === 'POST',
      ),
      this.clickInvokeButton(),
    ]);
  }

  /**
   * Clear all filters using the QueryBuilder's Clear all button
   */
  async clearAllFilters() {
    // Use exact match to avoid strict mode violations with multiple "Clear all" buttons
    const clearButton = this.page.getByRole('button', { name: 'Clear all', exact: true });
    if (await clearButton.isVisible()) {
      await clearButton.click();
      // Once filters are cleared, the "Clear all" button disappears
      await expect(clearButton).toBeHidden();
    }
  }

  async applyQuickFilter(filterName: string) {
    await this.page.getByRole('combobox', { name: 'Quick Filters' }).click();
    await this.page.getByRole('option', { name: filterName }).click();
  }

  async clickViewsTab() {
    await this.page.getByRole('tab', { name: 'Views' }).click();
  }

  async createSavedView({ viewName, filterName }: { viewName: string; filterName: string }) {
    await this.page.getByRole('combobox', { name: 'Select a filter or view...' }).click();

    await this.page.getByText(filterName).click();

    await this.page.getByRole('button', { name: 'Save View' }).click();

    await this.page.getByRole('textbox', { name: 'View Name' }).fill(viewName);

    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  async addColumnToTable(columnName: string) {
    await this.page.getByRole('button', { name: 'Columns' }).click();
    await this.page.getByRole('textbox', { name: 'Search columns...' }).fill(columnName);
    await this.page.getByRole('checkbox', { name: columnName, exact: true }).check();
    // Close the panel so the grid is accessible
    await this.page.keyboard.press('Escape');
    // Wait for the column panel to close (search box disappears)
    await expect(this.page.getByRole('textbox', { name: 'Search columns...' })).toBeHidden();
  }

  /**
   * Add a grouping level using the sidebar "Add grouping level" button.
   * Supports static field labels: 'Space', 'Target', 'Toolchain Type', etc.
   */
  async groupByColumn(fieldLabel: string) {
    await this.page.getByRole('button', { name: 'Add grouping level' }).click();
    // The menuitem click auto-waits for the menu to open
    const menuItem = this.page.getByRole('menuitem', { name: fieldLabel });
    await menuItem.click();
    // Wait for the menu to close, confirming the grouping field was selected
    await expect(menuItem).toBeHidden();
  }

  async applySavedView(viewName: string) {
    // Switch to Views tab
    await this.clickViewsTab();

    // Select the saved view from dropdown
    await this.page.getByTestId('saved-view-select').click();
    await this.page.getByRole('option', { name: viewName }).click();

    // Apply the view
    await this.page.getByRole('button', { name: 'Apply View' }).click();

    // Wait for the grid to reload with the applied view
    await this.waitForGridReady();
  }

  async uncheckColumns(columns: string[]) {
    await this.clickColumnSelection();

    for (const column of columns) {
      const checkbox = this.page.getByRole('checkbox', { name: column });
      await checkbox.uncheck();
    }

    // Close the column selection dropdown
    await this.page
      .getByRole('main')
      .filter({ hasText: 'OrganizationE2E' })
      .getByRole('main')
      .click();
  }

  async selectFilterOrViewByName(name: string) {
    await this.clickSelectFilterAutocomplete();
    await this.page.getByRole('option', { name }).click();
  }

  async clearSelectedFilter() {
    await this.selectFilter.fill('');
  }

  async expectToBeVisibleByRole(role: Role, name: string) {
    await expect(this.page.getByRole(role, { name })).toBeVisible();
  }

  async expectToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text).first()).toBeVisible();
  }

  async expectFilterOrViewToBeSelected(expectedValue: string) {
    // Verify the MUI Autocomplete combobox has the expected value selected
    await expect(this.selectFilter).toHaveValue(expectedValue);
  }

  async expectToBeVisibleByTestId(locatorName: string) {
    await expect(this.page.getByTestId(locatorName)).toBeVisible();
  }

  async expectNotToBeVisibleByRole(role: Role, name: string) {
    await expect(this.page.getByRole(role, { name })).not.toBeVisible();
  }

  async expectToBeDisabledByRole(role: Role, name: string) {
    await expect(this.page.getByRole(role, { name })).toBeDisabled();
  }

  async expectNotToBeVisibleByText(text: string) {
    await expect(this.page.getByText(text)).not.toBeVisible();
  }

  async expectToHaveCount(text: string, count: number) {
    await expect(this.page.getByText(text)).toHaveCount(count);
  }

  async searchInGrid(searchTerm: string) {
    // The GridToolbarQuickFilter in MUI DataGrid Premium is typically a search textbox
    const searchInput = this.page.getByPlaceholder('Search…');
    await searchInput.fill(searchTerm);
    // Callers (getRowByName) auto-wait for the filtered row via waitFor()
  }

  /**
   * Override to add automatic quick search for units
   */
  async getRowByName(name: string, exact = false) {
    const row = this.page.getByRole('row', { name, exact });

    // First, try to find the row without searching
    const isVisible = await row.first().isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      // Row not immediately visible, try searching for it
      await this.searchInGrid(name);
      // Wait for the row to appear after search; use .first() to avoid strict mode
      // violations when the locator transiently matches multiple elements (e.g. a data
      // row plus a MUI DataGrid group-header row) during a search transition.
      await row.first().waitFor({ state: 'visible', timeout: 5000 });
    }

    return row.first();
  }

  // =============================================================
  // Visual Query Builder Methods
  // =============================================================

  /**
   * Add a filter in the Visual Builder
   * Clicks the "Filter" button (when no filters) or "Add filter" button (when filters exist)
   * Optionally fills in a value for text-based filters (Slug, Where, Where Data)
   */
  async addVisualBuilderFilter(
    fieldType:
      | 'Space'
      | 'Slug'
      | 'Toolchain'
      | 'Created'
      | 'Updated'
      | 'Head Revision'
      | 'Live Revision'
      | 'Where'
      | 'Where Data',
    value?: string,
  ) {
    // Map display names to internal field names used in data-field attribute
    const fieldTypeToDataField: Record<string, string> = {
      Space: 'space',
      Slug: 'slug',
      Toolchain: 'toolchainType',
      Created: 'createdAt',
      Updated: 'updatedAt',
      'Head Revision': 'headRevisionNum',
      'Live Revision': 'liveRevisionNum',
      Where: 'where',
      'Where Data': 'whereData',
    };

    // Map field types to their input placeholders
    const fieldTypeToPlaceholder: Record<string, string> = {
      Slug: 'Search slugs...',
      Where: "Slug LIKE '%prod%'",
      'Where Data': 'spec.replicas > 1',
    };

    // The Filter button is shown when no filters exist
    // The add button (when filters exist) has aria-label="Add filter" and just shows an icon
    const filterButton = this.page.locator('button').filter({ hasText: /^Filter$/ });
    const addButton = this.page.getByLabel('Add filter');

    // Wait for the grid toolbar to be available (filter button lives inside the DataGrid toolbar)
    await this.page.waitForSelector('[role="grid"]', { timeout: 15000 });

    // Dismiss any active focus/tooltips that might intercept clicks
    await this.page.locator('body').click({ position: { x: 1, y: 1 } });

    // Try to find and click the appropriate button (isVisible below polls for it)
    if (await filterButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterButton.click();
    } else if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();
    } else {
      // Fallback: try clicking any button that has "Filter" text
      await this.page.locator('button').filter({ hasText: 'Filter' }).first().click();
    }

    // Wait for menu to appear and contain menuitems
    await this.page.waitForSelector('[role="menuitem"]', { timeout: 10000 });

    // Use data-field attribute for precise targeting (avoids matching text in descriptions)
    const dataField = fieldTypeToDataField[fieldType];
    const fieldMenuItem = dataField
      ? this.page.locator(`[role="menuitem"][data-field="${dataField}"]`)
      : this.page.locator(`[role="menuitem"]:has-text("${fieldType}")`).first();
    await fieldMenuItem.click();

    // Wait for the field-picker menu to close (the selected menuitem detaches)
    // before returning. Otherwise the still-open menu can intercept the caller's
    // next action (e.g. clicking the value dropdown's "Select..." button), leaving
    // the value dropdown unopened.
    await expect(fieldMenuItem).toBeHidden();

    // If a value is provided and this field type has a text input, fill it.
    // input.fill auto-waits for the filter's input to appear after the menu closes.
    if (value !== undefined) {
      const placeholder = fieldTypeToPlaceholder[fieldType];
      if (placeholder) {
        const input = this.page.getByPlaceholder(placeholder);
        await input.fill(value);
      }
    }
  }

  /**
   * Set a slug filter value in the Visual Builder
   */
  async setSlugFilter(value: string) {
    await this.page.getByPlaceholder('Search slugs...').fill(value);
  }

  /**
   * Clear all filters in the Visual Builder
   */
  async clearAllVisualBuilderFilters() {
    // Use the text "Clear all" with exact match since data-testid might be on a different element
    const clearButton = this.page.getByRole('button', { name: 'Clear all', exact: true });
    if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearButton.click();
      // Wait for the Filter button to reappear (indicates filters are cleared)
      await this.page
        .locator('button')
        .filter({ hasText: /^Filter$/ })
        .waitFor({
          state: 'visible',
          timeout: 5000,
        })
        .catch(() => {
          // Fallback: filters may already be cleared
        });
    }
  }

  /**
   * Check if a Filter block with a selected value is visible
   * @param filterName The expected filter name displayed in the block
   */
  async isFilterBlockVisible(filterName?: string): Promise<boolean> {
    if (filterName) {
      const filterBlock = this.page.locator('button').filter({ hasText: filterName });
      return await filterBlock.isVisible({ timeout: 2000 }).catch(() => false);
    }

    // Check if any filter row exists that's not showing "Select..."
    const filterRows = this.page.locator('[class*="FilterRow"], [class*="filter-row"]');
    const count = await filterRows.count();
    return count > 0;
  }

  /**
   * Wait for the grid to finish loading
   * Alias for waitForGridReady from EntityGridFixture
   */
  async waitForGridLoad(): Promise<void> {
    await this.waitForGridReady();
  }
}
