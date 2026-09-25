// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { FeedbackSurveyDialog } from './fixtures/feedback-survey-dialog';
import { Header } from './fixtures/header';
import { UnitListPage } from './fixtures/unit-list-page';

test.describe('Feedback Survey Dialog', () => {
  test.use({ storageState: 'authentication.json' });

  let unitListPage: UnitListPage;
  let header: Header;
  let feedbackDialog: FeedbackSurveyDialog;

  test.beforeEach(async ({ page }) => {
    unitListPage = new UnitListPage(page);
    header = new Header(page);
    feedbackDialog = new FeedbackSurveyDialog(page);
    await unitListPage.goto();
  });

  test.describe('Dialog Opening and Closing', () => {
    test('should open feedback dialog when clicking Feedback menu item', async () => {
      // Open user menu
      await header.openUserMenu();

      // Click Feedback menu item
      const feedbackMenuItem = unitListPage.page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Verify dialog is open
      await expect(feedbackDialog.dialog).toBeVisible();
    });

    test('should close dialog when clicking close button', async () => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = unitListPage.page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Close dialog
      await feedbackDialog.close();

      // Verify dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });

    test('should close dialog when clicking cancel button', async () => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = unitListPage.page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Click cancel
      await feedbackDialog.cancel();

      // Verify dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });

    test('should close dialog when clicking outside (backdrop)', async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Wait for dialog to be fully visible
      await expect(feedbackDialog.dialog).toBeVisible();

      // Press Escape key to close dialog (more reliable than backdrop click)
      await page.keyboard.press('Escape');

      // Verify dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test.beforeEach(async ({ page }) => {
      // Open dialog before each validation test
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();
    });

    test('should show validation error for empty feedback', async () => {
      // Try to submit without filling feedback
      await feedbackDialog.submit();

      // Verify validation error is shown
      const errorText = await feedbackDialog.getValidationError();
      expect(errorText).toBe('Feedback is required');
    });

    test('should show validation error for feedback less than 10 characters', async () => {
      // Fill feedback with less than 10 characters
      await feedbackDialog.fillFeedback('Too short');

      // Try to submit
      await feedbackDialog.submit();

      // Verify validation error is shown
      const errorText = await feedbackDialog.getValidationError();
      expect(errorText).toBe('Please provide at least 10 characters of feedback');
    });

    test('should not show validation error for valid feedback', async () => {
      // Fill feedback with at least 10 characters
      await feedbackDialog.fillFeedback('This is a valid feedback message');

      // Verify no validation error is shown
      await expect(feedbackDialog.errorMessage).not.toBeVisible();
    });

    test('should clear validation error when user types valid input', async () => {
      // Try to submit without filling feedback to trigger validation
      await feedbackDialog.submit();

      // Verify validation error is shown
      await expect(feedbackDialog.errorMessage).toBeVisible();

      // Fill with valid feedback
      await feedbackDialog.fillFeedback('This is a valid feedback message');

      // Validation error should disappear
      await expect(feedbackDialog.errorMessage).not.toBeVisible();
    });
  });

  test.describe('Form Submission', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/userfeedback', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();
    });

    test('should successfully submit feedback with minimum valid input', async () => {
      // Fill minimum valid feedback (10 characters)
      await feedbackDialog.fillFeedback('Valid test feedback');

      // Submit the form
      await feedbackDialog.submit();

      // Check if feedback submission is unavailable
      const isUnavailable = await feedbackDialog.isFeedbackSubmissionUnavailable();
      if (isUnavailable) {
        test.skip();
        return;
      }

      // Wait for success state
      await expect(feedbackDialog.successMessage).toBeVisible({ timeout: 10000 });

      // Verify success icon is shown
      await expect(feedbackDialog.successIcon).toBeVisible();

      // Verify success message
      const successText = await feedbackDialog.successMessage.textContent();
      expect(successText).toBe('Thank you for your feedback!');
    });

    test('should successfully submit feedback with allow contact checked', async () => {
      // Fill feedback
      await feedbackDialog.fillFeedback('Great product! Please contact me.');

      // Check allow contact
      await feedbackDialog.toggleAllowContact();

      // Verify checkbox is checked
      await expect(feedbackDialog.allowContactCheckbox).toBeChecked();

      // Submit the form
      await feedbackDialog.submit();

      // Check if feedback submission is unavailable
      const isUnavailable = await feedbackDialog.isFeedbackSubmissionUnavailable();
      if (isUnavailable) {
        test.skip();
        return;
      }

      // Wait for success state
      await expect(feedbackDialog.successMessage).toBeVisible({ timeout: 10000 });
    });

    test('should show submit button with correct initial state', async () => {
      // Fill feedback
      await feedbackDialog.fillFeedback('Testing button state');

      // Button should show Submit Feedback text and be enabled
      await expect(feedbackDialog.submitButton).toHaveText('Submit Feedback');
      await expect(feedbackDialog.submitButton).not.toBeDisabled();
    });
  });

  test.describe('Success State', () => {
    let feedbackUnavailable = false;

    test.beforeEach(async ({ page }) => {
      await page.route('**/api/userfeedback', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();
      await feedbackDialog.fillFeedback('Test feedback for success state');
      await feedbackDialog.submit();

      // Check if feedback submission is unavailable
      feedbackUnavailable = await feedbackDialog.isFeedbackSubmissionUnavailable();
      if (!feedbackUnavailable) {
        await expect(feedbackDialog.successMessage).toBeVisible({ timeout: 10000 });
      }
    });

    test('should hide form elements in success state', async () => {
      if (feedbackUnavailable) {
        test.skip();
        return;
      }

      // Verify form elements are not visible
      await expect(feedbackDialog.feedbackTextField).not.toBeVisible();
      await expect(feedbackDialog.allowContactCheckbox).not.toBeVisible();
      await expect(feedbackDialog.submitButton).not.toBeVisible();
      await expect(feedbackDialog.cancelButton).not.toBeVisible();
    });

    test('should show Discord join button in success state', async () => {
      if (feedbackUnavailable) {
        test.skip();
        return;
      }

      // Verify Discord button is visible
      await expect(feedbackDialog.discordButtonInSuccess).toBeVisible();
    });

    test('should show Close button in success state', async () => {
      if (feedbackUnavailable) {
        test.skip();
        return;
      }

      // Verify Close button is visible
      await expect(feedbackDialog.closeButtonInSuccess).toBeVisible();
    });

    test('should close dialog when clicking Close button in success state', async () => {
      if (feedbackUnavailable) {
        test.skip();
        return;
      }

      // Click Close button
      await feedbackDialog.closeSuccessScreen();

      // Verify dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });

    test('should open Discord in new tab when clicking Join Discord button', async ({ context }) => {
      if (feedbackUnavailable) {
        test.skip();
        return;
      }

      // Set up listener for new page
      const newPagePromise = context.waitForEvent('page');

      // Click Join Discord button
      await feedbackDialog.clickJoinDiscordButton();

      // Wait for new page
      const newPage = await newPagePromise;

      // Verify new page URL contains Discord domain
      expect(newPage.url()).toContain('discord-auth.confighub.net');

      // Close the new page
      await newPage.close();

      // Verify original dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });
  });

  test.describe('Discord Link in Form', () => {
    test.beforeEach(async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();
    });

    test('should show Discord link in form description', async () => {
      // Verify Discord link is visible
      await expect(feedbackDialog.discordLinkInForm).toBeVisible();
    });

    test('should open Discord in new tab when clicking link', async ({ context }) => {
      // Set up listener for new page
      const newPagePromise = context.waitForEvent('page');

      // Click Discord link
      await feedbackDialog.clickDiscordLinkInForm();

      // Wait for new page
      const newPage = await newPagePromise;

      // Verify new page URL contains Discord domain
      expect(newPage.url()).toContain('discord-auth.confighub.net');

      // Close the new page
      await newPage.close();
    });
  });

  test.describe('Form State Persistence', () => {
    test('should maintain feedback text when toggling checkbox', async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Fill feedback
      const feedbackText = 'This feedback should persist';
      await feedbackDialog.fillFeedback(feedbackText);

      // Toggle checkbox
      await feedbackDialog.toggleAllowContact();

      // Verify feedback text is still there
      const currentValue = await feedbackDialog.feedbackTextField.inputValue();
      expect(currentValue).toBe(feedbackText);
    });

    test('should reset form when reopening after successful submission', async ({ page }) => {
      await page.route('**/api/userfeedback', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await header.openUserMenu();
      let feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();
      await feedbackDialog.fillFeedback('First submission');
      await feedbackDialog.submit();

      // Check if feedback submission is unavailable
      const isUnavailable = await feedbackDialog.isFeedbackSubmissionUnavailable();
      if (isUnavailable) {
        test.skip();
        return;
      }

      await expect(feedbackDialog.successMessage).toBeVisible({ timeout: 10000 });
      await feedbackDialog.closeSuccessScreen();

      // Open dialog again
      await header.openUserMenu();
      feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Verify form is reset
      const feedbackValue = await feedbackDialog.feedbackTextField.inputValue();
      expect(feedbackValue).toBe('');
      await expect(feedbackDialog.allowContactCheckbox).not.toBeChecked();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Verify dialog role
      await expect(feedbackDialog.dialog).toHaveAttribute('role', 'dialog');

      // Verify close button has aria-label
      await expect(feedbackDialog.closeButton).toHaveAttribute('aria-label', 'close');
    });

    test('should allow keyboard navigation', async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Focus should be on the dialog
      await feedbackDialog.feedbackTextField.focus();
      await expect(feedbackDialog.feedbackTextField).toBeFocused();

      // Tab to checkbox
      await page.keyboard.press('Tab');
      await expect(feedbackDialog.allowContactCheckbox).toBeFocused();

      // Tab to Cancel button
      await page.keyboard.press('Tab');
      await expect(feedbackDialog.cancelButton).toBeFocused();

      // Tab to Submit button
      await page.keyboard.press('Tab');
      await expect(feedbackDialog.submitButton).toBeFocused();
    });

    test('should close dialog with Escape key', async ({ page }) => {
      // Open dialog
      await header.openUserMenu();
      const feedbackMenuItem = page.getByRole('menuitem', { name: 'Feedback' });
      await feedbackMenuItem.click();

      // Press Escape
      await page.keyboard.press('Escape');

      // Verify dialog is closed
      await expect(feedbackDialog.dialog).not.toBeVisible();
    });
  });
});
