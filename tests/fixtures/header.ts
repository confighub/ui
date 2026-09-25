// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Locator, Page, expect } from '@playwright/test';

export class Header {
  readonly page: Page;
  readonly userAvatar: Locator;
  readonly userMenu: Locator;
  readonly logoutMenuItem: Locator;
  readonly helpMenuItem: Locator;
  readonly organizationSwitcher: Locator;
  readonly organizationMenu: Locator;
  readonly switchOrganizationMenuItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userAvatar = page.locator('[data-testid="user-avatar"]');
    this.userMenu = page.locator('#account-menu');
    this.logoutMenuItem = page.getByRole('menuitem', { name: 'Logout' });
    this.helpMenuItem = page.getByRole('menuitem', { name: 'Help' });
    this.organizationSwitcher = page.locator('[data-testid="organization-switcher"]');
    this.organizationMenu = page.locator('#organization-menu');
    this.switchOrganizationMenuItem = page.getByRole('menuitem', {
      name: 'Switch organization',
    });
  }

  async openUserMenu() {
    await this.userAvatar.click();
  }

  async closeUserMenu() {
    // Click outside the menu to close it
    await this.page.locator('body').click({ position: { x: 0, y: 0 } });
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutMenuItem.click();
  }

  async openHelp() {
    await this.openUserMenu();

    // Set up listener for new page (tab) before clicking
    const newPagePromise = this.page.context().waitForEvent('page');
    await this.helpMenuItem.click();

    return newPagePromise;
  }

  async getUserDisplayName(): Promise<string | null> {
    // Hover over avatar to see tooltip
    await this.userAvatar.hover();

    // Get the tooltip text
    const tooltip = this.page.getByRole('tooltip');

    // Wait for tooltip to be visible with increased timeout for new layout
    await tooltip.waitFor({ state: 'visible', timeout: 2000 });
    return await tooltip.textContent();
  }

  /**
   * The current organization's display name, as shown in the page header.
   * Waits for the name to arrive: the switcher fades in only once the
   * organization list has loaded.
   */
  async getCurrentOrganization(): Promise<string | null> {
    await expect(this.organizationSwitcher).not.toBeEmpty();
    const text = await this.organizationSwitcher.textContent();

    return text ? text.trim() : null;
  }

  async openOrganizationMenu() {
    await this.organizationSwitcher.click();
    await expect(this.switchOrganizationMenuItem).toBeVisible();
  }

  async closeOrganizationMenu() {
    await this.page.keyboard.press('Escape');
    await expect(this.organizationMenu).not.toBeVisible();
  }

  /** Opens the organization menu and chooses "Switch organization". */
  async switchOrganization() {
    await this.openOrganizationMenu();
    await this.switchOrganizationMenuItem.click();
  }
}
