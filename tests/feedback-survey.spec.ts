// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { FeedbackSurveyDialog } from './fixtures/feedback-survey-dialog';
import { Header } from './fixtures/header';
import { UnitListPage } from './fixtures/unit-list-page';

test.describe('Feedback Survey Dialog', () => {
  test.use({ storageState: 'authentication.json' });

  test('should open the dialog from the user menu, submit feedback and show success', async ({
    page,
  }) => {
    const header = new Header(page);
    const feedbackDialog = new FeedbackSurveyDialog(page);

    // Answer the submission locally, so the test does not post feedback to the team
    await page.route('**/api/userfeedback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await new UnitListPage(page).goto();
    await header.openUserMenu();
    await page.getByRole('menuitem', { name: 'Feedback' }).click();
    await expect(feedbackDialog.dialog).toBeVisible();

    await feedbackDialog.fillFeedback('Valid test feedback');
    await feedbackDialog.submit();

    await expect(feedbackDialog.successMessage).toBeVisible({ timeout: 10000 });
    await expect(feedbackDialog.successMessage).toHaveText('Thank you for your feedback!');
  });
});
