// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { APIResponse } from '@playwright/test';

import { expect, hubApi, test } from './fixtures/test';
import { UnitDetailPage } from './fixtures/unit-details-page';

/**
 * The Validation page tracks a validating Trigger through its enforcement: selected in a Space while
 * it warns, it is in Audit with the Unit that fails it listed; its priority is set from the page;
 * and enforcing it from the page records when, and re-evaluates the Unit so its warning becomes a
 * ValidationError.
 */

const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 1
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
          image: nginx:1.27
`;

const LIMITS =
  "r.kind != 'Deployment' || r.spec.template.spec.containers.all(c, has(c.resources) && has(c.resources.limits))";

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok())
    throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

test.describe('the Validation page', () => {
  let policySpaceId = '';
  let policySlug = '';
  let appSpaceId = '';
  let triggerId = '';
  let unitId = '';
  let ruleSlug = '';

  const trigger = async () =>
    (
      await body<{ Trigger: { Warn?: boolean; Annotations?: Record<string, string> } }>(
        await hubApi.get(`/api/space/${policySpaceId}/trigger/${triggerId}`),
        'trigger',
      )
    ).Trigger;
  const unitGates = async () => {
    const { Unit } = await body<{
      Unit: {
        ValidationErrors?: Record<string, boolean>;
        ValidationWarnings?: Record<string, boolean>;
      };
    }>(await hubApi.get(`/api/space/${appSpaceId}/unit/${unitId}`), 'unit');
    return {
      errors: Object.keys(Unit.ValidationErrors ?? {}),
      warnings: Object.keys(Unit.ValidationWarnings ?? {}),
    };
  };

  test.beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    policySlug = `validation-policy-${suffix}`;
    // Unique, so the cards of tests running at once are told apart.
    ruleSlug = `needs-limits-${suffix}`;
    policySpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: policySlug, Labels: { Owner: 'E2E' } },
        }),
        'policy space',
      )
    ).SpaceID;
    triggerId = (
      await body<{ TriggerID: string }>(
        await hubApi.post(`/api/space/${policySpaceId}/trigger`, {
          data: {
            Slug: ruleSlug,
            Description: 'Every container sets resources.limits.',
            Event: 'Mutation',
            ToolchainType: 'Kubernetes/YAML',
            FunctionName: 'vet-cel',
            Arguments: [{ ParameterName: 'expression', Value: LIMITS }],
            Warn: true,
            Annotations: { Priority: 'High' },
            WhereResource: `metadata.annotations.exceptions~1guardrails~1confighub~1com/${ruleSlug} IS NULL`,
          },
        }),
        'trigger',
      )
    ).TriggerID;
    appSpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: {
            Slug: `validation-app-${suffix}`,
            Labels: { Owner: 'E2E' },
            WhereTrigger: `Space.Slug = '${policySlug}'`,
          },
        }),
        'app space',
      )
    ).SpaceID;
    unitId = (
      await body<{ Unit: { UnitID: string } }>(
        await hubApi.post(`/api/space/${appSpaceId}/unit`, {
          data: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await body(
      await hubApi.put(`/api/space/${appSpaceId}/unit/${unitId}/data`, { data: deployment }),
      'unit data',
    );
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
  });

  test.afterEach(async () => {
    for (const id of [appSpaceId, policySpaceId]) {
      if (id)
        await hubApi
          .delete(`/api/space/${id}`, { params: { recursive: 'true' } })
          .catch(() => undefined);
    }
  });

  test('tracks a Trigger from Audit to Enforced', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`/validation/${triggerId}`);

    // In Audit, with its card on the board and the failing Unit listed.
    await expect(
      page.getByTestId('validation-column-Audited').getByTestId(`validation-card-${ruleSlug}`),
    ).toBeVisible({
      timeout: 20000,
    });
    const detail = page.getByTestId('validation-detail');
    await expect(detail.getByTestId('validation-stage')).toHaveText('Audited');
    await expect(detail.getByRole('button', { name: 'Failing (1)' })).toBeVisible();
    await expect(
      detail.getByTestId('validation-unit-row').filter({ hasText: 'web' }),
    ).toBeVisible();

    // Priority is set from the page.
    await detail.getByTestId('validation-priority').click();
    await page.getByRole('option', { name: 'Low', exact: true }).click();
    await expect.poll(async () => (await trigger()).Annotations?.Priority).toBe('Low');

    // Enforcing asks first, says what it will block, records when, and re-evaluates the Unit.
    await detail.getByTestId('validation-mode-enforce').click();
    const dialog = page.getByRole('dialog', { name: 'Enforce this Trigger?' });
    await expect(dialog).toContainText('1 Unit now warned by it will be blocked.');
    await dialog.getByTestId('validation-mode-confirm').click();
    await expect.poll(async () => (await trigger()).Warn ?? false).toBe(false);
    expect((await trigger()).Annotations?.EnforcedAt).toBeTruthy();
    await expect
      .poll(async () => (await unitGates()).errors.length, { timeout: 20000 })
      .toBe(1);
    expect((await unitGates()).warnings).toEqual([]);

    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(detail.getByTestId('validation-stage')).toHaveText('Enforced', {
      timeout: 20000,
    });

    // Returning to audit runs the Trigger again on the Unit it fails, which turns the gate
    // blocking it back into a warning.
    await detail.getByTestId('validation-mode-audit').click();
    const auditDialog = page.getByRole('dialog', { name: 'Return to audit?' });
    await expect(auditDialog).toContainText('The Trigger runs again on the 1 Unit it fails.');
    await auditDialog.getByTestId('validation-mode-confirm').click();
    await expect.poll(async () => (await trigger()).Warn ?? false).toBe(true);
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
    expect((await unitGates()).errors).toEqual([]);
  });

  test('function runs on a failing Unit are made in the Trigger\'s ChangeSet, which the page links to', async ({ page }) => {
    test.setTimeout(120000);
    const annotation = `${policySlug}/${ruleSlug}`;
    interface ChangeSetFields { ChangeSetID: string; Slug: string; State?: string; Annotations?: Record<string, string> }
    const changeSets = async () =>
      (
        await body<Array<{ ChangeSet: ChangeSetFields }>>(await hubApi.get(`/api/space/${appSpaceId}/change_set`), 'change sets')
      )
        .map((entry) => entry.ChangeSet)
        .sort((a, b) => a.Slug.localeCompare(b.Slug));
    const readUnit = async () =>
      (await body<{ Unit: { ChangeSetID?: string; HeadRevisionNum?: number } }>(await hubApi.get(`/api/space/${appSpaceId}/unit/${unitId}`), 'unit')).Unit;
    const unitChangeSetId = async () => (await readUnit()).ChangeSetID ?? '';
    const setUnitChangeSet = async (changeSetId: string | null) =>
      body(
        await hubApi.patch('/api/unit', {
          params: { where: `UnitID = '${unitId}'` },
          headers: { 'Content-Type': 'application/merge-patch+json' },
          data: { ChangeSetID: changeSetId },
        }),
        'unit change set',
      );

    await page.goto(`/validation/${triggerId}`);
    const detail = page.getByTestId('validation-detail');
    const row = detail.getByTestId('validation-unit-row').filter({ hasText: 'web' });
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole('checkbox').check();
    // The Units checked here are the invoker's, and its runs are for this Trigger.
    const invoker = new UnitDetailPage(page);
    // The function stays open in the invoker, so each run sets its argument and invokes it again.
    await invoker.selectFunctionByName('set-replicas');
    const run = async (replicas: string) => {
      await invoker.fillNumberInputByName('Replicas', replicas);
      await page.getByTestId('invoker-invoke-button').click();
    };

    // The first run makes a ChangeSet named after the Trigger and annotated with it, and leaves
    // the Unit in it, open, for the change to be reviewed.
    await run('3');
    await expect.poll(async () => (await changeSets()).map((cs) => [cs.Slug, cs.Annotations?.Trigger]), { timeout: 20000 }).toEqual([
      [ruleSlug, annotation],
    ]);
    const [first] = await changeSets();
    await expect.poll(unitChangeSetId).toBe(first.ChangeSetID);
    const firstHead = (await readUnit()).HeadRevisionNum ?? 0;

    // A second run is made in the same ChangeSet.
    await run('4');
    await expect.poll(async () => (await readUnit()).HeadRevisionNum ?? 0, { timeout: 20000 }).toBeGreaterThan(firstHead);
    expect(await unitChangeSetId()).toBe(first.ChangeSetID);
    expect((await changeSets()).map((cs) => cs.Slug)).toEqual([ruleSlug]);

    // The box under the Units names the annotation and opens the ChangeSets carrying it.
    const changes = detail.getByTestId('validation-trigger-changes');
    await expect(changes).toContainText(`Trigger=${annotation}`);
    await expect(changes.getByRole('link', { name: 'Open its ChangeSets' })).toHaveAttribute(
      'href',
      `/change-sets?${new URLSearchParams({ filterWhere: `Annotations.Trigger = '${annotation}'` }).toString()}`,
    );

    // Taken out of it, which closes it, and put in a ChangeSet of its own, the Unit is refused.
    await setUnitChangeSet(null);
    await expect.poll(async () => (await changeSets())[0].State).toBe('Closed');
    const other = await body<{ ChangeSetID: string }>(
      await hubApi.post(`/api/space/${appSpaceId}/change_set`, { data: { Slug: 'by-hand' } }),
      'other change set',
    );
    await setUnitChangeSet(other.ChangeSetID);
    await run('5');
    await expect(page.getByText(/Nothing was run: a Unit is in a ChangeSet other than this Trigger's/).first()).toBeVisible({
      timeout: 20000,
    });
    expect((await changeSets()).map((cs) => cs.Slug)).toEqual(['by-hand', ruleSlug]);

    // Free of it, the Unit's next run makes the Trigger's second ChangeSet, numbered.
    await setUnitChangeSet(null);
    await run('6');
    await expect.poll(async () => (await changeSets()).map((cs) => cs.Slug), { timeout: 20000 }).toEqual([
      'by-hand',
      ruleSlug,
      `${ruleSlug}-2`,
    ]);
  });

  test('a run on Units in two Spaces is made in the Trigger\'s ChangeSet already holding one of them', async ({ page }) => {
    test.setTimeout(120000);
    // A second Space whose Unit fails the same Trigger.
    const otherSpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: `${policySlug}-other`, Labels: { Owner: 'E2E' }, WhereTrigger: `Space.Slug = '${policySlug}'` },
        }),
        'other space',
      )
    ).SpaceID;
    try {
      const apiUnitId = (
        await body<{ Unit: { UnitID: string } }>(
          await hubApi.post(`/api/space/${otherSpaceId}/unit`, { data: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' } }),
          'other unit',
        )
      ).Unit.UnitID;
      await body(await hubApi.put(`/api/space/${otherSpaceId}/unit/${apiUnitId}/data`, { data: deployment }), 'other unit data');
      await expect
        .poll(
          async () =>
            Object.keys(
              (await body<{ Unit: { ValidationWarnings?: Record<string, boolean> } }>(
                await hubApi.get(`/api/space/${otherSpaceId}/unit/${apiUnitId}`),
                'other unit',
              )).Unit.ValidationWarnings ?? {},
            ).length,
          { timeout: 20000 },
        )
        .toBe(1);
      const changeSetOf = async (spaceId: string, id: string) =>
        (await body<{ Unit: { ChangeSetID?: string } }>(await hubApi.get(`/api/space/${spaceId}/unit/${id}`), 'unit')).Unit.ChangeSetID ?? '';

      await page.goto(`/validation/${triggerId}`);
      const detail = page.getByTestId('validation-detail');
      // Both Units hold a Deployment named web, so a row is found by its checkbox, named for its Unit.
      const checkboxOf = (unitSlug: string) => detail.getByRole('checkbox', { name: new RegExp(`/${unitSlug}$`) });
      await expect(checkboxOf('api')).toBeVisible({ timeout: 30000 });
      const invoker = new UnitDetailPage(page);

      // The first run, on the Unit in one Space, makes the Trigger's ChangeSet there.
      await checkboxOf('web').check();
      await invoker.selectFunctionByName('set-replicas');
      await invoker.fillNumberInputByName('Replicas', '3');
      await page.getByTestId('invoker-invoke-button').click();
      await expect.poll(() => changeSetOf(appSpaceId, unitId), { timeout: 20000 }).not.toBe('');
      const first = await changeSetOf(appSpaceId, unitId);

      // The next, on that Unit and one in the other Space, is made in the same ChangeSet,
      // without asking where a ChangeSet should go.
      await checkboxOf('api').check();
      await invoker.fillNumberInputByName('Replicas', '4');
      await page.getByTestId('invoker-invoke-button').click();
      await expect.poll(() => changeSetOf(otherSpaceId, apiUnitId), { timeout: 20000 }).toBe(first);
      await expect(page.getByTestId('change-set-space-dialog')).toHaveCount(0);
      await expect(page.getByText(/Nothing was run/)).toHaveCount(0);
    } finally {
      await hubApi.delete(`/api/space/${otherSpaceId}`, { params: { recursive: 'true' } }).catch(() => undefined);
    }
  });

  test('excepts a failing resource, and removes the exception', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`/validation/${triggerId}`);
    const detail = page.getByTestId('validation-detail');
    const row = detail.getByTestId('validation-unit-row').filter({ hasText: 'web' });
    await row.getByRole('button', { name: 'Except…' }).click({ timeout: 20000 });

    const dialog = page.getByTestId('exception-dialog');
    await dialog
      .getByTestId('exception-reason')
      .locator('textarea')
      .first()
      .fill('Sized by its autoscaler');
    await dialog.getByTestId('exception-submit').click();
    await expect(dialog).toHaveCount(0);

    // The resource carries the exception, and the Trigger no longer warns on it.
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(0);
    const exceptions = detail.getByTestId('validation-exceptions');
    await expect(exceptions).toContainText('Sized by its autoscaler');

    await exceptions.getByRole('button', { name: 'Remove…' }).click();
    await page.getByTestId('exception-dialog').getByTestId('exception-submit').click();
    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(1);
  });
});
