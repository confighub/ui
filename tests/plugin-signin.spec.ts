import { expect, test } from '@playwright/test';

test('redeems fresh tickets added to the current sign-in page once each', async ({ page }) => {
  await page.goto('/tests/fixtures/plugin-ui/signin.html');
  await expect(page.getByRole('heading', { name: 'Sign in from the command line' })).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = 'ticket=first-ticket';
  });
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __pluginSignInAttempts: string[] }).__pluginSignInAttempts,
      ),
    )
    .toEqual(['first-ticket']);
  await expect(page).not.toHaveURL(/ticket=/);

  await page.evaluate(() => {
    window.location.hash = 'ticket=second-ticket';
  });
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __pluginSignInAttempts: string[] }).__pluginSignInAttempts,
      ),
    )
    .toEqual(['first-ticket', 'second-ticket']);
  await expect(page).not.toHaveURL(/ticket=/);
});

test('initial fragment survives StrictMode replay and accepts a later ticket after failure', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/plugin-ui/signin.html#ticket=initial-ticket');
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __pluginSignInAttempts: string[] }).__pluginSignInAttempts,
      ),
    )
    .toEqual(['initial-ticket']);
  await expect(page).not.toHaveURL(/ticket=/);

  await page.evaluate(() => {
    window.location.hash = 'ticket=after-failure';
  });
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __pluginSignInAttempts: string[] }).__pluginSignInAttempts,
      ),
    )
    .toEqual(['initial-ticket', 'after-failure']);
  await expect(page).not.toHaveURL(/ticket=/);
});
