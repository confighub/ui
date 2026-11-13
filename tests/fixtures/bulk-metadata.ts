// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page, expect } from '@playwright/test';

// Drives the labels and gates of a bulk Update drawer (Units, Triggers, Spaces, Targets): a row
// per key, as the form of one entity edits them.

type Field = 'labels' | 'delete-gates' | 'destroy-gates';

const ITEM_LABEL: Record<Field, string> = {
  labels: 'label',
  'delete-gates': 'delete gate',
  'destroy-gates': 'destroy gate',
};

const keyInputs = (page: Page, field: Field) =>
  page.locator(`[data-testid^="bulk-${field}-key-"]`);

/** The index of the row whose key is `key`. */
const rowIndexOf = async (page: Page, field: Field, key: string): Promise<number> => {
  const keys = await keyInputs(page, field).evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
  const index = keys.indexOf(key);
  expect(index, `a ${ITEM_LABEL[field]} row with key ${key}`).toBeGreaterThanOrEqual(0);
  return index;
};

/** Adds a row for each entry, setting it on every selected entity. */
export const addBulkRows = async (
  page: Page,
  field: Field,
  entries: Record<string, string> | string[],
) => {
  const pairs = Array.isArray(entries)
    ? entries.map((key) => [key, ''] as const)
    : Object.entries(entries);
  for (const [key, value] of pairs) {
    const index = await keyInputs(page, field).count();
    await page.getByTestId(`bulk-${field}-add`).click();
    await page.getByTestId(`bulk-${field}-key-${index}`).fill(key);
    if (field === 'labels') await page.getByTestId(`bulk-${field}-value-${index}`).fill(value);
  }
};

/** The value field of the label row whose key is `key`. */
export const bulkLabelValue = async (page: Page, key: string) =>
  page.getByTestId(`bulk-labels-value-${await rowIndexOf(page, 'labels', key)}`);

/** Changes the value of the label row whose key is `key`, on every selected entity. */
export const changeBulkLabel = async (page: Page, key: string, value: string) => {
  const index = await rowIndexOf(page, 'labels', key);
  await page.getByTestId(`bulk-labels-value-${index}`).fill(value);
};

/** Puts the key of the row whose key is `key`, which only some entities have, on all of them. */
export const addBulkRowToAll = async (page: Page, field: Field, key: string) => {
  const index = await rowIndexOf(page, field, key);
  await page.getByTestId(`bulk-${field}-all-${index}`).click();
};

/** Removes the row whose key is `key`, removing it from every selected entity. */
export const removeBulkRow = async (page: Page, field: Field, key: string) => {
  const index = await rowIndexOf(page, field, key);
  await page
    .getByRole('button', { name: `Remove ${ITEM_LABEL[field]} ${index + 1}`, exact: true })
    .click();
};
