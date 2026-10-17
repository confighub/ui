// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The close gates of a ChangeSet a ChangeWorkflow governs: Close is disabled while a gate
// does not hold, the Close gates section says which and where, Force close… closes it anyway
// with a reason it records, and an approval opens the gate.

import { type Page } from '@playwright/test';

import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';
import { ApiHelper } from './fixtures/api-helper';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/acme/web:1.0.0
`;

test.describe.configure({ mode: 'serial' });

test.describe('ChangeSet close gates', () => {
  test.use({ storageState: 'authentication.json' });

  let fixturePage: Page;
  let api: ApiHelper;
  let spaceId = '';
  let spaceSlug = '';
  let workflowSlug = '';
  const changeSetIds: Record<string, string> = {};

  /** A ChangeSet governed by the workflow, open on a Unit of its own, which it changed. */
  async function governedChangeSet(slug: string, workflowId: string) {
    const changeSet = await api.createChangeSet({ spaceId, changeSet: { Slug: slug, ChangeWorkflowID: workflowId } as never });
    const changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;
    const unit = await api.createUnit({ spaceId, unit: { Slug: `${slug}-web`, ToolchainType: 'Kubernetes/YAML' } as never });
    const unitId = unit.UnitID as string;
    await api.uploadUnitData({ spaceId, unitId, body: deployment(1) });
    const attach = await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
      params: { change_set_id: changeSetId },
      headers: MERGE_PATCH,
      data: { ChangeSetID: changeSetId },
    });
    expect(attach.ok(), await attach.text()).toBe(true);
    await api.uploadUnitData({ spaceId, unitId, body: deployment(3), changeSetId });
    changeSetIds[slug] = changeSetId;
  }

  test.beforeAll(async ({ browser }) => {
    const context = await newAuthorizedContext(browser);
    fixturePage = await context.newPage();
    api = new ApiHelper(fixturePage);
    spaceSlug = `e2e-csg-${RandomSlugGenerator.randomSlugName()}`;
    const space = await api.createSpace({ space: { Slug: spaceSlug } as never });
    spaceId = (space as { SpaceID: string }).SpaceID;
    workflowSlug = 'review-to-close';
    const workflow = await hubApi.post(`/api/space/${spaceId}/change_workflow`, {
      data: {
        Slug: workflowSlug,
        DisplayName: workflowSlug,
        Final: { Prerequisites: ['reviewed'] },
        AttestationPrerequisites: [{ Name: 'reviewed', AllowAuthors: true }],
      },
    });
    expect(workflow.ok(), await workflow.text()).toBe(true);
    const workflowId = ((await workflow.json()) as { ChangeWorkflowID: string }).ChangeWorkflowID;
    await governedChangeSet('held', workflowId);
    await governedChangeSet('approved', workflowId);
  });

  test.afterAll(async () => {
    try {
      if (spaceId) await api.deleteSpace(spaceId, true);
    } finally {
      if (fixturePage) await fixturePage.close();
    }
  });

  test('a gate that does not hold disables Close and says where', async ({ page }) => {
    await page.goto(`/change-sets/${spaceSlug}/held`);
    const summary = page.getByRole('region', { name: 'ChangeSet summary' });
    await expect(summary.getByTestId('change-set-gates-status')).toHaveText('0 of 1 close gates hold.', { timeout: 30000 });
    await expect(summary.getByTestId('change-set-close')).toBeDisabled();
    await expect(summary.getByTestId('change-set-force-close')).toBeVisible();

    const gates = page.getByRole('region', { name: 'ChangeSet close gates' });
    await expect(gates.getByTestId('change-set-gates-workflow')).toHaveText(`${spaceSlug}/${workflowSlug}`);
    await expect(gates.getByTestId('change-order-gate-close-reviewed')).toContainText(`Does not hold in ${spaceSlug}.`);
    await expect(gates.getByTestId(`change-set-gate-failure-reviewed-${spaceSlug}`)).toContainText('requires reviewed');
  });

  test('Force close closes it with a reason, which the page then shows', async ({ page }) => {
    await page.goto(`/change-sets/${spaceSlug}/held`);
    const summary = page.getByRole('region', { name: 'ChangeSet summary' });
    await summary.getByTestId('change-set-force-close').click({ timeout: 30000 });
    const dialog = page.getByTestId('change-set-force-close-dialog');
    await expect(dialog).toContainText('requires reviewed');
    // A reason is required.
    await dialog.getByTestId('change-set-force-close-confirm').click();
    await expect(dialog).toContainText('Say why the gates are overridden.');
    await dialog.getByTestId('change-set-force-close-reason').fill('approved in the incident channel');
    await dialog.getByTestId('change-set-force-close-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30000 });

    await expect(summary).toContainText('Closed', { timeout: 30000 });
    const gates = page.getByRole('region', { name: 'ChangeSet close gates' });
    await expect(gates.getByTestId('change-set-close-override')).toContainText('Closed past a gate that did not hold');
    await expect(gates.getByTestId('change-set-close-override-reason')).toHaveText('Reason: approved in the incident channel');

    const read = await hubApi.get(`/api/space/${spaceId}/change_set/${changeSetIds.held}`);
    const override = ((await read.json()) as { ChangeSet?: { CloseOverride?: { Reason?: string; FailedGates?: string[] } } }).ChangeSet?.CloseOverride;
    expect(override?.Reason).toBe('approved in the incident channel');
    expect(override?.FailedGates).toHaveLength(1);
  });

  test('an approval opens the gate, and Close closes it', async ({ page }) => {
    const changeSetId = changeSetIds.approved;
    const attest = await hubApi.post('/api/attest', {
      data: {
        WhereSpace: `SpaceID = '${spaceId}'`,
        WhereUnit: `ChangeSetID = '${changeSetId}'`,
        Revision: `ChangeSet:${changeSetId}`,
        Type: 'Approval',
        Result: 'Pass',
      },
    });
    expect(attest.ok(), await attest.text()).toBe(true);

    await page.goto(`/change-sets/${spaceSlug}/approved`);
    const summary = page.getByRole('region', { name: 'ChangeSet summary' });
    await expect(summary.getByTestId('change-set-gates-status')).toHaveText('Its close gate holds.', { timeout: 30000 });
    await expect(summary.getByTestId('change-set-force-close')).toHaveCount(0);
    const gates = page.getByRole('region', { name: 'ChangeSet close gates' });
    await expect(gates.getByTestId('change-order-gate-close-reviewed')).toContainText('Holds in its Space.');

    await summary.getByTestId('change-set-close').click();
    const dialog = page.getByTestId('change-set-close-dialog');
    await expect(dialog).toContainText('Gates: Its close gate holds.');
    await dialog.getByTestId('change-set-close-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30000 });
    await expect(summary).toContainText('Closed', { timeout: 30000 });
    await expect(gates.getByTestId('change-set-gates-closed')).toHaveText('It closed with every gate holding.');
  });
});
