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
  // A rule the Trigger honors the exceptions of, as one overlapping it does.
  let honoredRule = '';

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
    honoredRule = `honored-${suffix}`;
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
            Annotations: { Priority: 'High', Controls: 'CH-0340,CH-0341,CH-0342' },
            WhereResource:
              `metadata.annotations.exceptions~1guardrails~1confighub~1com/${ruleSlug} IS NULL AND ` +
              `metadata.annotations.exceptions~1guardrails~1confighub~1com/${honoredRule} IS NULL`,
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
    const card = page
      .getByTestId('validation-column-Audited')
      .getByTestId(`validation-card-${ruleSlug}`);
    await expect(card).toBeVisible({
      timeout: 20000,
    });
    // The controls the Trigger covers, a run of them written as its first and last.
    await expect(card.getByTestId('validation-card-controls')).toHaveText('CH-0340–CH-0342');
    const detail = page.getByTestId('validation-detail');
    await expect(detail.getByTestId('validation-controls')).toContainText('CH-0340–CH-0342');
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
    // Its failure is now an error, which the Enforced column totals.
    await page.getByLabel('Search Triggers').fill(ruleSlug);
    await expect(page.getByTestId('validation-column-Enforced-totals')).toHaveText('1 error');

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

  test('totals the failures of a column, and Evaluate runs a changed Trigger again', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto(`/validation/${triggerId}`);
    // Searching for the Trigger leaves its card alone in the column, so the totals are its own.
    await page.getByLabel('Search Triggers').fill(ruleSlug);
    const totals = page.getByTestId('validation-column-Audited-totals');
    await expect(totals).toHaveText('1 warning', { timeout: 20000 });
    await expect(page.getByTestId('validation-column-Enforced-totals')).toHaveCount(0);
    // Clicking the count shows only the cards with warnings.
    const warningsFilter = page.getByTestId('validation-column-Audited-filter-warning');
    await warningsFilter.click();
    await expect(warningsFilter).toHaveAttribute('aria-pressed', 'true');
    const card = page
      .getByTestId('validation-column-Audited')
      .getByTestId(`validation-card-${ruleSlug}`);
    await expect(card).toBeVisible();
    // A search that leaves no warnings turns the filter off, and it stays off when they return.
    const search = page.getByLabel('Search Triggers');
    await search.fill(`${ruleSlug}-none`);
    await expect(card).toHaveCount(0);
    await search.fill(ruleSlug);
    await expect(warningsFilter).toHaveAttribute('aria-pressed', 'false');
    await warningsFilter.click();
    await expect(warningsFilter).toHaveAttribute('aria-pressed', 'true');

    // A change to a Trigger re-evaluates only the Units of its own Space, so the Unit keeps its
    // warning until the Trigger runs on it again.
    const changed = await hubApi.patch(`/api/space/${policySpaceId}/trigger/${triggerId}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { Arguments: [{ ParameterName: 'expression', Value: 'true' }] },
    });
    expect(changed.ok(), await changed.text()).toBe(true);
    expect((await unitGates()).warnings).toHaveLength(1);

    await page.getByTestId('validation-reevaluate').click();
    await expect(page.getByTestId('validation-detail')).toContainText('Evaluated 1 Unit.');
    expect((await unitGates()).warnings).toEqual([]);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(totals).toHaveText('0 warnings', { timeout: 20000 });
    // With no warnings left, the filter is off and the card shows again.
    await expect(warningsFilter).toHaveCount(0);
    await expect(card).toBeVisible();
  });

  test('Evaluate runs a Trigger only on the Units its WhereUnit and Unit Filter select', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const patchTrigger = async (data: Record<string, unknown>) => {
      const patched = await hubApi.patch(`/api/space/${policySpaceId}/trigger/${triggerId}`, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
        data,
      });
      expect(patched.ok(), await patched.text()).toBe(true);
    };
    // The Trigger now passes everything, so a run on the Unit would clear its warning; and it is
    // narrowed to Units the Unit is not one of.
    await patchTrigger({
      Arguments: [{ ParameterName: 'expression', Value: 'true' }],
      WhereUnit: "Slug = 'not-web'",
    });

    await page.goto(`/validation/${triggerId}`);
    const detail = page.getByTestId('validation-detail');
    await detail.getByTestId('validation-reevaluate').click();
    await expect(detail).toContainText(
      'Evaluated 0 Units. The Trigger does not apply to the other 1.',
    );
    expect((await unitGates()).warnings).toHaveLength(1);

    // Selected through a Unit Filter instead, the Unit is evaluated, and passes.
    const filter = await body<{ FilterID: string }>(
      await hubApi.post(`/api/space/${policySpaceId}/filter`, {
        data: { Slug: `web-${ruleSlug}`, From: 'Unit', Where: "Slug = 'web'" },
      }),
      'filter',
    );
    await patchTrigger({ WhereUnit: null, UnitFilterID: filter.FilterID });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await detail.getByTestId('validation-reevaluate').click();
    await expect(detail).toContainText('Evaluated 1 Unit.');
    expect((await unitGates()).warnings).toEqual([]);
  });

  test("a Trigger enforced elsewhere sends its Units' old warnings to Evaluate", async ({
    page,
  }) => {
    test.setTimeout(90000);
    // Enforced outside the page, which runs it again on no Unit outside its own Space, so the
    // Unit keeps its warning.
    const enforced = await hubApi.patch(`/api/space/${policySpaceId}/trigger/${triggerId}`, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: { Warn: false },
    });
    expect(enforced.ok(), await enforced.text()).toBe(true);
    expect((await unitGates()).warnings).toHaveLength(1);

    await page.goto(`/validation/${triggerId}`);
    await page.getByLabel('Search Triggers').fill(ruleSlug);
    const totals = page.getByTestId('validation-column-Enforced-totals');
    await expect(totals).toHaveText('0 errors1 warning', { timeout: 20000 });
    const detail = page.getByTestId('validation-detail');
    await expect(detail.getByTestId('validation-stale')).toHaveText(
      '1 Unit has a warning from before the Trigger was enforced. Evaluate to update it.',
    );

    await detail.getByTestId('validation-reevaluate').click();
    await expect(detail).toContainText('Evaluated 1 Unit.');
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(totals).toHaveText('1 error', { timeout: 20000 });
    await expect(detail.getByTestId('validation-stale')).toHaveCount(0);
  });

  test("function runs on a failing Unit are made in the Trigger's ChangeSet, which the page links to", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const annotation = `${policySlug}/${ruleSlug}`;
    interface ChangeSetFields {
      ChangeSetID: string;
      Slug: string;
      State?: string;
      Annotations?: Record<string, string>;
    }
    const changeSets = async () =>
      (
        await body<Array<{ ChangeSet: ChangeSetFields }>>(
          await hubApi.get(`/api/space/${appSpaceId}/change_set`),
          'change sets',
        )
      )
        .map((entry) => entry.ChangeSet)
        .sort((a, b) => a.Slug.localeCompare(b.Slug));
    const readUnit = async () =>
      (
        await body<{ Unit: { ChangeSetID?: string; HeadRevisionNum?: number } }>(
          await hubApi.get(`/api/space/${appSpaceId}/unit/${unitId}`),
          'unit',
        )
      ).Unit;
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
    await expect
      .poll(async () => (await changeSets()).map((cs) => [cs.Slug, cs.Annotations?.Trigger]), {
        timeout: 20000,
      })
      .toEqual([[ruleSlug, annotation]]);
    const [first] = await changeSets();
    await expect.poll(unitChangeSetId).toBe(first.ChangeSetID);
    const firstHead = (await readUnit()).HeadRevisionNum ?? 0;

    // A second run is made in the same ChangeSet.
    await run('4');
    await expect
      .poll(async () => (await readUnit()).HeadRevisionNum ?? 0, { timeout: 20000 })
      .toBeGreaterThan(firstHead);
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
    await expect(
      page
        .getByText(/Nothing was run: a Unit is in a ChangeSet other than this Trigger's/)
        .first(),
    ).toBeVisible({
      timeout: 20000,
    });
    expect((await changeSets()).map((cs) => cs.Slug)).toEqual(['by-hand', ruleSlug]);

    // Free of it, the Unit's next run makes the Trigger's second ChangeSet, numbered.
    await setUnitChangeSet(null);
    await run('6');
    await expect
      .poll(async () => (await changeSets()).map((cs) => cs.Slug), { timeout: 20000 })
      .toEqual(['by-hand', ruleSlug, `${ruleSlug}-2`]);
  });

  test("a run on Units in two Spaces is made in the Trigger's ChangeSet already holding one of them", async ({
    page,
  }) => {
    test.setTimeout(120000);
    // A second Space whose Unit fails the same Trigger.
    const otherSpaceId = (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: {
            Slug: `${policySlug}-other`,
            Labels: { Owner: 'E2E' },
            WhereTrigger: `Space.Slug = '${policySlug}'`,
          },
        }),
        'other space',
      )
    ).SpaceID;
    try {
      const apiUnitId = (
        await body<{ Unit: { UnitID: string } }>(
          await hubApi.post(`/api/space/${otherSpaceId}/unit`, {
            data: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' },
          }),
          'other unit',
        )
      ).Unit.UnitID;
      await body(
        await hubApi.put(`/api/space/${otherSpaceId}/unit/${apiUnitId}/data`, {
          data: deployment,
        }),
        'other unit data',
      );
      await expect
        .poll(
          async () =>
            Object.keys(
              (
                await body<{ Unit: { ValidationWarnings?: Record<string, boolean> } }>(
                  await hubApi.get(`/api/space/${otherSpaceId}/unit/${apiUnitId}`),
                  'other unit',
                )
              ).Unit.ValidationWarnings ?? {},
            ).length,
          { timeout: 20000 },
        )
        .toBe(1);
      const changeSetOf = async (spaceId: string, id: string) =>
        (
          await body<{ Unit: { ChangeSetID?: string } }>(
            await hubApi.get(`/api/space/${spaceId}/unit/${id}`),
            'unit',
          )
        ).Unit.ChangeSetID ?? '';

      await page.goto(`/validation/${triggerId}`);
      const detail = page.getByTestId('validation-detail');
      // Both Units hold a Deployment named web, so a row is found by its checkbox, named for its Unit.
      const checkboxOf = (unitSlug: string) =>
        detail.getByRole('checkbox', { name: new RegExp(`/${unitSlug}$`) });
      await expect(checkboxOf('api')).toBeVisible({ timeout: 30000 });
      const invoker = new UnitDetailPage(page);

      // The first run, on the Unit in one Space, makes the Trigger's ChangeSet there.
      await checkboxOf('web').check();
      await invoker.selectFunctionByName('set-replicas');
      await invoker.fillNumberInputByName('Replicas', '3');
      await page.getByTestId('invoker-invoke-button').click();
      await expect
        .poll(() => changeSetOf(appSpaceId, unitId), { timeout: 20000 })
        .not.toBe('');
      const first = await changeSetOf(appSpaceId, unitId);

      // The next, on that Unit and one in the other Space, is made in the same ChangeSet,
      // without asking where a ChangeSet should go.
      await checkboxOf('api').check();
      await invoker.fillNumberInputByName('Replicas', '4');
      await page.getByTestId('invoker-invoke-button').click();
      await expect
        .poll(() => changeSetOf(otherSpaceId, apiUnitId), { timeout: 20000 })
        .toBe(first);
      await expect(page.getByTestId('change-set-space-dialog')).toHaveCount(0);
      await expect(page.getByText(/Nothing was run/)).toHaveCount(0);
    } finally {
      await hubApi
        .delete(`/api/space/${otherSpaceId}`, { params: { recursive: 'true' } })
        .catch(() => undefined);
    }
  });

  test('lists the resources excepted from a rule whose exceptions the Trigger honors', async ({
    page,
  }) => {
    const excepted = deployment.replace(
      'name: web\n  namespace',
      `name: api\n  annotations:\n    exceptions.guardrails.confighub.com/${honoredRule}: Runs as root by design\n  namespace`,
    );
    const { Unit } = await body<{ Unit: { UnitID: string } }>(
      await hubApi.post(`/api/space/${appSpaceId}/unit`, {
        data: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' },
      }),
      'unit',
    );
    await body(
      await hubApi.put(`/api/space/${appSpaceId}/unit/${Unit.UnitID}/data`, {
        data: excepted,
      }),
      'unit data',
    );

    await page.goto(`/validation/${triggerId}`);
    const honored = page.getByTestId('validation-honored-exceptions');
    await expect(honored).toContainText(honoredRule, { timeout: 20000 });
    await expect(honored).toContainText('Runs as root by design');
    await expect(honored).toContainText('default/api');
    // Removed on that rule's page, not this one.
    await expect(honored.getByRole('button', { name: 'Remove…' })).toHaveCount(0);
  });

  test('a Unit with nothing for a rule to check is not counted, nor shown as not evaluated', async ({
    page,
  }) => {
    test.setTimeout(90000);
    // A rule that checks only ConfigMaps, which the app Space's one Unit, a Deployment, has none
    // of: the server skips it there and records that, so the page leaves the Unit out.
    const configMapRule = `configmaps-${ruleSlug}`;
    const configMapTriggerId = (
      await body<{ TriggerID: string }>(
        await hubApi.post(`/api/space/${policySpaceId}/trigger`, {
          data: {
            Slug: configMapRule,
            Event: 'Mutation',
            ToolchainType: 'Kubernetes/YAML',
            FunctionName: 'vet-cel',
            Arguments: [{ ParameterName: 'expression', Value: 'has(r.data)' }],
            Warn: true,
            WhereResource: "ConfigHub.ResourceType = 'v1/ConfigMap'",
          },
        }),
        'trigger',
      )
    ).TriggerID;
    // A Trigger created in the policy Space re-evaluates only that Space's Units, so the app's
    // are evaluated against it here, as the page's Evaluate does.
    await body(
      await hubApi.post('/api/function/invoke', {
        params: { where: `UnitID = '${unitId}'` },
        data: {
          ToolchainType: 'Kubernetes/YAML',
          Triggers: [configMapTriggerId],
          UpdateValidationResults: true,
          FunctionInvocations: null,
        },
      }),
      'evaluate',
    );
    await expect
      .poll(
        async () =>
          (
            await body<{ Unit: { ValidationSkipped?: Record<string, boolean> } }>(
              await hubApi.get(`/api/space/${appSpaceId}/unit/${unitId}`),
              'unit',
            )
          ).Unit.ValidationSkipped ?? {},
        { timeout: 20000 },
      )
      .toEqual({ [`${policySlug}/${configMapRule}/vet-cel`]: true });

    await page.goto(`/validation/${configMapTriggerId}`);
    const detail = page.getByTestId('validation-detail');
    await expect(detail.getByRole('button', { name: 'All (0)' })).toBeVisible({
      timeout: 20000,
    });
    await expect(detail.getByRole('button', { name: 'Not evaluated (0)' })).toBeVisible();
    // Its card says there is nothing to report, rather than nothing at all.
    await expect(
      page
        .getByTestId(`validation-card-${configMapRule}`)
        .getByTestId('validation-card-not-applicable'),
    ).toHaveText('N/A');
  });

  test('excepts the failures of a Trigger temporarily, and lists them apart, here and on the Unit page', async ({
    page,
  }) => {
    test.setTimeout(90000);
    // A second failing Unit holds a Deployment and a Service of one name. vet-cel names the
    // failing resource without its type, so which one fails cannot be told, and it is left as it is.
    const twin =
      deployment.replace(/web/g, 'api') +
      '---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api\n  namespace: default\nspec:\n  ports:\n    - port: 80\n';
    const { Unit } = await body<{ Unit: { UnitID: string } }>(
      await hubApi.post(`/api/space/${appSpaceId}/unit`, {
        data: { Slug: 'api', ToolchainType: 'Kubernetes/YAML' },
      }),
      'unit',
    );
    await body(
      await hubApi.put(`/api/space/${appSpaceId}/unit/${Unit.UnitID}/data`, { data: twin }),
      'unit data',
    );

    await page.goto(`/validation/${triggerId}`);
    const detail = page.getByTestId('validation-detail');
    await detail.getByTestId('validation-except-temporarily').click({ timeout: 20000 });
    const dialog = page.getByTestId('temporary-exceptions-dialog');
    await expect(dialog.getByTestId('temporary-exceptions-summary')).toHaveText(
      'Excepts 1 resource in 1 Unit.',
      { timeout: 20000 },
    );
    const left = dialog.getByTestId('temporary-exceptions-not-excepted-Ambiguous');
    await expect(left).toContainText('1 Unit: Their results name a resource without its type');
    await expect(left).toContainText('/api');
    await dialog
      .getByTestId('temporary-exceptions-reason')
      .locator('textarea')
      .first()
      .fill('Limits come with the next chart release');
    await dialog.getByTestId('temporary-exceptions-submit').click();
    await expect(dialog).toHaveCount(0, { timeout: 20000 });

    await expect
      .poll(async () => (await unitGates()).warnings.length, { timeout: 20000 })
      .toBe(0);
    const temporary = detail.getByTestId('validation-temporary-exceptions');
    await expect(temporary).toContainText(
      'ToBeFixed: Limits come with the next chart release',
    );
    await expect(temporary).toContainText('default/web');
    await expect(detail.getByTestId('validation-exceptions')).toContainText('Exceptions (0)');

    // The Unit, clear of warnings now, lists its temporary exception.
    await page.goto(`/units/${appSpaceId}/${unitId}`);
    const unitTemporary = page.getByTestId('unit-temporary-exceptions');
    await expect(unitTemporary).toContainText(
      'ToBeFixed: Limits come with the next chart release',
      { timeout: 20000 },
    );
    await expect(unitTemporary).toContainText(ruleSlug);
    await expect(page.getByTestId('unit-lasting-exceptions')).toContainText('Exceptions (0)');
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
