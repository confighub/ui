// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// Deleting a Channel offers Archive, which can be undone and needs no typing, or Delete
// permanently, which waits for the Channel's slug to be typed.

test('a Channel is archived without typing its slug, which only a permanent delete needs', async ({
  page,
}) => {
  const api = new ApiHelper(page);
  await page.goto('/');
  const space = await api.createSpace({
    space: { Slug: `chdel-${RandomSlugGenerator.randomSlugName()}` },
  });
  const spaceId = space.SpaceID!;
  try {
    const created = await hubApi.post(`/api/space/${spaceId}/channel`, {
      data: { Slug: 'functions' },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const channelId = ((await created.json()) as { ChannelID: string }).ChannelID;

    await page.goto(`/channels/${space.Slug}/functions`);
    await page.getByTestId('channel-delete').click();
    const dialog = page.getByTestId('delete-or-archive-dialog');
    const confirm = dialog.getByTestId('delete-or-archive-confirm');
    const typed = dialog.getByTestId('delete-or-archive-confirm-input');

    await expect(dialog.getByRole('radio', { name: /^Archive/ })).toBeChecked();
    await expect(typed).toHaveCount(0);
    await expect(confirm).toHaveText('Archive');
    await expect(confirm).toBeEnabled();

    await dialog.getByRole('radio', { name: /^Delete permanently/ }).check();
    await expect(confirm).toHaveText('Delete permanently');
    await expect(confirm).toBeDisabled();
    await typed.locator('input').fill('function');
    await expect(confirm).toBeDisabled();
    await typed.locator('input').fill('functions');
    await expect(confirm).toBeEnabled();

    await dialog.getByRole('radio', { name: /^Archive/ }).check();
    await expect(typed).toHaveCount(0);
    await confirm.click();
    await expect(dialog).toHaveCount(0);

    const archived = await hubApi.get(`/api/space/${spaceId}/channel/${channelId}`);
    expect(archived.ok(), await archived.text()).toBeTruthy();
    const channel = (
      (await archived.json()) as {
        Channel: { HiddenReason?: string; Labels?: Record<string, string> };
      }
    ).Channel;
    expect(channel.HiddenReason).toBe('Archived');
    expect(channel.Labels?.ArchivedSlug).toBe('functions');
  } finally {
    await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } });
  }
});
