// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Locator, Page } from '@playwright/test';

export class FeedbackSurveyDialog {
  readonly page: Page;
  readonly dialog: Locator;
  readonly closeButton: Locator;
  readonly feedbackTextField: Locator;
  readonly allowContactCheckbox: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;
  readonly successIcon: Locator;
  readonly successMessage: Locator;
  readonly discordLinkInForm: Locator;
  readonly discordButtonInSuccess: Locator;
  readonly closeButtonInSuccess: Locator;
  readonly errorMessage: Locator;
  readonly unavailableErrorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog').filter({ hasText: 'Share Your Feedback' });
    this.closeButton = this.dialog.getByRole('button', { name: 'close' });
    this.feedbackTextField = this.dialog.getByLabel('Your Feedback');
    this.allowContactCheckbox = this.dialog.getByRole('checkbox', {
      name: /allow the team to contact me/i,
    });
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel' });
    this.submitButton = this.dialog.getByRole('button', { name: /submit feedback/i });
    this.successIcon = this.dialog.locator('[data-testid="CheckCircleIcon"]');
    this.successMessage = this.dialog.getByText('Thank you for your feedback!');
    this.discordLinkInForm = this.dialog.getByRole('link', { name: 'Discord' });
    this.discordButtonInSuccess = this.dialog.getByRole('button', { name: 'Join Discord' });
    this.closeButtonInSuccess = this.dialog.getByRole('button', { name: 'Close' }).last();
    this.errorMessage = this.dialog.locator('.MuiFormHelperText-root.Mui-error');
    this.unavailableErrorMessage = this.page.getByText(/feedback submission is not available/i);
  }

  async isOpen(): Promise<boolean> {
    return await this.dialog.isVisible();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
  }

  async fillFeedback(text: string): Promise<void> {
    await this.feedbackTextField.fill(text);
  }

  async toggleAllowContact(): Promise<void> {
    await this.allowContactCheckbox.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async getValidationError(): Promise<string | null> {
    return await this.errorMessage.textContent();
  }

  async isSubmitButtonDisabled(): Promise<boolean> {
    return await this.submitButton.isDisabled();
  }

  async isInSuccessState(): Promise<boolean> {
    return await this.successMessage.isVisible();
  }

  async clickDiscordLinkInForm(): Promise<void> {
    await this.discordLinkInForm.click();
  }

  async clickJoinDiscordButton(): Promise<void> {
    await this.discordButtonInSuccess.click();
  }

  async closeSuccessScreen(): Promise<void> {
    await this.closeButtonInSuccess.click();
  }

  /**
   * Checks if feedback submission is unavailable after submitting.
   * If unavailable, logs a message to console.
   * Returns true if unavailable, false if available.
   */
  async isFeedbackSubmissionUnavailable(): Promise<boolean> {
    try {
      // Wait briefly to see if the unavailable error appears
      await this.unavailableErrorMessage.waitFor({ timeout: 2000 });
      console.log('⚠️  Feedback submission is not available - skipping test assertions');
      return true;
    } catch {
      // Error message not found, feedback is available
      return false;
    }
  }
}
