// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The service account page's "Granted on" table lists the entities whose
 * Permissions name the account. A Link is one of them, opened on the Links tab
 * of the Unit it is from, and a Link that grants it nothing is not listed. Past
 * four similar grants (one type, one Space, the same permissions) the newest
 * three are listed and the rest counted, until Show all lists them.
 */
import type { Page } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ACCOUNT = `sa-grants-${suffix}`;
const SPACE = `sa-grants-${suffix}`;
/** Created in this order, so the last three are the newest. */
const MANAGED_TAGS = ['release-1', 'release-2', 'release-3', 'release-9', 'release-10'];

let serviceAccountId = '';
let spaceId = '';
let fromUnitId = '';

async function ok<T>(
  response: Awaited<ReturnType<typeof hubApi.post>>,
  what: string,
): Promise<T> {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
}

test.beforeAll(async () => {
  const account = await ok<{ ServiceAccountID: string; UserID: string }>(
    await hubApi.post('/api/service_account', { data: { Slug: ACCOUNT } }),
    'create the service account',
  );
  serviceAccountId = account.ServiceAccountID;
  const grant = (action: string) => ({
    Permissions: { [action]: { UserIDs: { [account.UserID]: true } } },
  });

  spaceId = (
    await ok<{ SpaceID: string }>(
      await hubApi.post('/api/space', { data: { Slug: SPACE } }),
      'create the space',
    )
  ).SpaceID;
  const unit = async (slug: string) =>
    (
      await ok<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
        }),
        `create unit ${slug}`,
      )
    ).Unit.UnitID;
  fromUnitId = await unit('app');
  const toUnitId = await unit('ns');
  const link = async (slug: string) =>
    (
      await ok<{ LinkID: string }>(
        await hubApi.post(`/api/space/${spaceId}/link`, {
          data: { Slug: slug, FromUnitID: fromUnitId, ToUnitID: toUnitId, ToSpaceID: spaceId },
        }),
        `create link ${slug}`,
      )
    ).LinkID;
  const grantedLinkId = await link('granted');
  await link('ungranted');
  await ok(
    await hubApi.patch(`/api/space/${spaceId}/link/${grantedLinkId}`, {
      headers: MERGE_PATCH,
      data: grant('View'),
    }),
    'grant the service account View on the link',
  );

  const tag = async (slug: string, action: string) => {
    const created = await ok<{ TagID: string }>(
      await hubApi.post(`/api/space/${spaceId}/tag`, { data: { Slug: slug } }),
      `create tag ${slug}`,
    );
    await ok(
      await hubApi.patch(`/api/space/${spaceId}/tag/${created.TagID}`, {
        headers: MERGE_PATCH,
        data: grant(action),
      }),
      `grant ${action} on tag ${slug}`,
    );
  };
  for (const slug of MANAGED_TAGS) await tag(slug, 'Manage');
  await tag('pinned', 'Edit');
});

test.afterAll(async () => {
  if (spaceId)
    await hubApi
      .delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } })
      .catch(() => undefined);
  if (serviceAccountId)
    await hubApi.delete(`/api/service_account/${serviceAccountId}`).catch(() => undefined);
});

/** The row for the entity named `name`, matched whole. */
const grantRow = (page: Page, name: string) =>
  page
    .getByTestId('service-account-grant-row')
    .filter({ has: page.getByText(name, { exact: true }) });

test('a Link that grants the service account a permission is listed, and opens on its Unit', async ({
  page,
}) => {
  await page.goto(`/service-accounts/${ACCOUNT}`);

  const linkRow = grantRow(page, `${SPACE}/granted`);
  await expect(linkRow).toHaveCount(1, { timeout: 30_000 });
  await expect(linkRow).toContainText('Link');
  await expect(linkRow).toContainText('View');
  const href = await linkRow
    .getByRole('link', { name: `${SPACE}/granted`, exact: true })
    .getAttribute('href');
  const url = new URL(href ?? '', 'http://localhost');
  expect(url.pathname).toBe(`/units/${spaceId}/${fromUnitId}`);
  expect(url.searchParams.get('tab')).toBe('3');
  expect(url.searchParams.get('linkDirection')).toBe('from');

  await expect(grantRow(page, `${SPACE}/ungranted`)).toHaveCount(0);
});

test('past four similar grants, the newest three are listed and the rest counted until Show all', async ({
  page,
}) => {
  await page.goto(`/service-accounts/${ACCOUNT}`);

  const more = page.getByTestId('service-account-grant-more');
  await expect(more).toHaveCount(1, { timeout: 30_000 });
  await expect(more).toContainText(`2 more in ${SPACE}`);
  await expect(more).toContainText('Manage');

  for (const slug of ['release-3', 'release-9', 'release-10'])
    await expect(grantRow(page, `${SPACE}/${slug}`)).toHaveCount(1);
  for (const slug of ['release-1', 'release-2'])
    await expect(grantRow(page, `${SPACE}/${slug}`)).toHaveCount(0);
  // One granted something else is not counted with the rest.
  await expect(grantRow(page, `${SPACE}/pinned`)).toContainText('Edit');

  await more.getByTestId('service-account-grant-show-all').click();
  await expect(more).toHaveCount(0);
  for (const slug of MANAGED_TAGS)
    await expect(grantRow(page, `${SPACE}/${slug}`)).toHaveCount(1);
});
