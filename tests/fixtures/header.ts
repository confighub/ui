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

  async logout() {
    await this.openUserMenu();
    await this.logoutMenuItem.click();
  }

  async openOrganizationMenu() {
    await this.organizationSwitcher.click();
    await expect(this.switchOrganizationMenuItem).toBeVisible();
  }

  /** Opens the organization menu and chooses "Switch organization". */
  async switchOrganization() {
    await this.openOrganizationMenu();
    await this.switchOrganizationMenuItem.click();
  }
}
