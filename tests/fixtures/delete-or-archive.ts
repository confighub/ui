// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, type Page } from '@playwright/test';

// A delete dialog (DeleteOrArchiveDialog) starts on Archive. These answer it either way.

/** Archives, the choice the dialog starts with. */
export async function confirmArchive(page: Page) {
  const dialog = page.getByTestId('delete-or-archive-dialog');
  await expect(dialog.getByRole('radio', { name: /^Archive/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
}

/** Deletes permanently, typing the slug when the dialog asks for it. */
export async function confirmPermanentDelete(page: Page, slug?: string) {
  const dialog = page.getByTestId('delete-or-archive-dialog');
  await dialog.getByRole('radio', { name: /^Delete permanently/ }).check();
  if (slug) await dialog.getByTestId('delete-or-archive-confirm-input').locator('input').fill(slug);
  await dialog.getByRole('button', { name: 'Delete permanently', exact: true }).click();
}
