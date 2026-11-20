// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis: a Unit a ChangeSet is open on. Its write-at-once actions (Apply, Dismiss, a
// guard's Remove) wait for the person to acknowledge that the change will be part of the
// ChangeSet, then name it, as the Blame tab's do (tests/blame-change-set-lock.spec.ts).
import type { APIResponse } from '@playwright/test';

import { encodeFres } from '../src/pages/x/apps/field-diagnosis/componentFocus';
import { type FieldDiagnosisSeed, seedFieldDiagnosis } from './fixtures/field-diagnosis/seed';
import { expect, hubApi, test } from './fixtures/test';

let seed: FieldDiagnosisSeed;
let changeSetId = '';

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok()) throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  seed = await seedFieldDiagnosis();
  const { spaceId, unitId } = seed.prod;
  changeSetId = (
    await body<{ ChangeSetID: string }>(
      await hubApi.post(`/api/space/${spaceId}/change_set`, { data: { Slug: 'hold', DisplayName: 'hold' } }),
      'change set',
    )
  ).ChangeSetID;
  await body(
    await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
      params: { change_set_id: changeSetId },
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { ChangeSetID: changeSetId },
    }),
    'open the change set',
  );
});

test.afterAll(async () => {
  await seed?.cleanup();
});

test('Dismiss on a Unit in a ChangeSet waits for the acknowledgement, then names the ChangeSet', async ({ page }) => {
  const { spaceId, unitId } = seed.prod;
  const fres = encodeFres('apps/v1/Deployment', 'default/web') ?? '';
  await page.goto(
    `/components?app=${encodeURIComponent(seed.component)}&space=${spaceId}&unit=${unitId}&field=spec.minReadySeconds&fres=${encodeURIComponent(fres)}`,
  );
  const details = page.getByTestId('fd-details');
  await expect(details.getByTestId('fd-conflict-text')).toContainText('Upstream wants 30', { timeout: 30_000 });
  await details.getByTestId('fd-need-secondary-conflict').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This Unit is in a ChangeSet, which locks it.');
  const dismiss = dialog.getByRole('button', { name: /^Dismiss/ });
  await expect(dismiss).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /hold/ }).check();
  await expect(dismiss).toBeEnabled();

  const request = page.waitForRequest((r) => r.url().includes(`/unit/${unitId}/conflicts`) && r.method() !== 'GET');
  await dismiss.click();
  const sent = (await request).postDataJSON() as { ChangeSetID?: string };
  expect(sent.ChangeSetID).toBe(changeSetId);
  await expect(details.getByTestId('fd-need-conflict')).toHaveCount(0, { timeout: 20_000 });
});
