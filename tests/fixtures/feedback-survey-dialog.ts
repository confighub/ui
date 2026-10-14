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

  async fillFeedback(text: string): Promise<void> {
    await this.feedbackTextField.fill(text);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
