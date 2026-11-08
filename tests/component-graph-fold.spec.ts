// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A Component with 10 or more Deployments folds in the browser: its quiet
// Deployments show as stacks under their Base, a condition on most of them
// shows once as a wave chip with one action, a stack opens in place, and the
// Group by choice lives in the URL (?graphGroup=) so a reload keeps the same
// stacks. How the fold is laid out and when it folds is covered without a
// browser by the component-graph-fold pure specs.
//
// Fixture: one Base Space with a Unit, and 10 Deployment Spaces (the fewest
// that fold), each with a Target and a Unit cloned from the Base's Unit. The
// Base's Unit then changes, so all 10 are Stale (a wave) and nothing else.
// Every Deployment Space has a Department (3 values) and a Region (2 values),
// so the default Group by is Department. The gate-mark case then adds a
// validating Trigger to each Deployment Space, so all 10 are also Gated.
import { type Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, newAuthorizedContext, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

const APP_LABEL = `e2e-fold-${RandomSlugGenerator.randomSlugName()}`;
const DEPLOYMENTS = 10;
const DEPARTMENTS = ['retail', 'payments', 'logistics'];
const REGIONS = ['eu', 'us'];

/** Fails on every ConfigMap, so each clone of the Base's Unit is Gated. */
const GATE_TRIGGER = {
  Slug: 'no-configmaps',
  DisplayName: 'No ConfigMaps',
  Description: 'Use a Secret instead.',
  FunctionName: 'vet-celexpr',
  Arguments: [{ ParameterName: 'validation-expr', Value: "r.kind != 'ConfigMap'" }],
};

function configMap(value: string): string {
  return [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: fold-config',
    'data:',
    `  value: "${value}"`,
  ].join('\n');
}

async function openApi(page: Page): Promise<ApiHelper> {
  await page.goto('/');
  await page.waitForResponse(
    (r) => r.url().includes('/api/space') && r.request().method() === 'GET' && r.ok(),
  );
  return new ApiHelper(page);
}

async function post<T>(url: string, data: unknown, params: Record<string, string> = {}) {
  const response = await hubApi.post(url, {
    params: { allow_exists: 'true', ...params },
    data,
  });
  if (!response.ok()) throw new Error(`${url}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
}

async function openComponent(page: Page): Promise<void> {
  await page.goto(`/components?app=${encodeURIComponent(APP_LABEL)}`);
  await page
    .waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: 20000 })
    .catch(() => {});
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20000 });
}

test.describe('a Component with 10 or more Deployments folds', () => {
  test.use({ storageState: 'authentication.json' });

  const baseSlug = `e2e-fold-base-${RandomSlugGenerator.randomSlugName()}`;
  let baseSpaceId = '';
  const deploymentSpaceIds: string[] = [];
  const idsByDepartment = new Map<string, string[]>();
  /** Per Deployment Space: its clone of the Base's Unit. */
  const cloneUnitIds = new Map<string, string>();

  /** A validating Trigger in each Deployment Space, run on its clone, so Gated is a wave. */
  async function gateEveryDeployment(): Promise<void> {
    await Promise.all(
      deploymentSpaceIds.map(async (spaceId) => {
        const trigger = await post<{ TriggerID: string }>(`/api/space/${spaceId}/trigger`, {
          Event: 'Mutation',
          ToolchainType: 'Kubernetes/YAML',
          ...GATE_TRIGGER,
        });
        const run = await hubApi.post('/api/function/invoke', {
          params: { executor_space: spaceId, where: `UnitID = '${cloneUnitIds.get(spaceId)}'` },
          data: {
            ToolchainType: 'Kubernetes/YAML',
            Triggers: [trigger.TriggerID],
            UpdateValidationResults: true,
            FunctionInvocations: null,
          },
        });
        if (!run.ok()) throw new Error(`invoke: ${run.status()} ${await run.text()}`);
      }),
    );
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    const api = await openApi(page);

    const { ComponentID: componentId } = await api.createComponent(APP_LABEL);
    const base = await api.createSpace({
      space: { Slug: baseSlug, ComponentID: componentId, Labels: { Owner: 'E2E' } },
    });
    baseSpaceId = base.SpaceID!;

    const baseUnit = await post<{ Unit: { UnitID: string } }>(
      `/api/space/${baseSpaceId}/unit`,
      {
        Slug: 'fold-config',
        ToolchainType: 'Kubernetes/YAML',
      },
    );
    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnit.Unit.UnitID,
      body: configMap('1'),
    });

    // A few at a time: 10 Spaces, Targets and clones one by one take long,
    // and all at once would flood the local server.
    const indexes = Array.from({ length: DEPLOYMENTS }, (_, i) => i);
    for (let start = 0; start < indexes.length; start += 6) {
      await Promise.all(
        indexes.slice(start, start + 6).map(async (i) => {
          const slug = `${baseSlug}-d${String(i + 1).padStart(2, '0')}`;
          const space = await api.createSpace({
            space: {
              Slug: slug,
              ComponentID: componentId,
              Labels: {
                Owner: 'E2E',
                Department: DEPARTMENTS[i % DEPARTMENTS.length],
                Region: REGIONS[i % REGIONS.length],
              },
            },
          });
          const spaceId = space.SpaceID!;
          deploymentSpaceIds.push(spaceId);
          const department = DEPARTMENTS[i % DEPARTMENTS.length];
          idsByDepartment.set(department, [
            ...(idsByDepartment.get(department) ?? []),
            spaceId,
          ]);
          const target = await post<{ TargetID: string }>(`/api/space/${spaceId}/target`, {
            Slug: `${slug}-tgt`,
          });
          // A Unit is released to its Space's release Target.
          await api.updateSpace({ spaceId, space: { ReleaseTargetID: target.TargetID } });
          const clone = await post<{ Unit: { UnitID: string } }>(
            `/api/space/${spaceId}/unit`,
            {
              Slug: 'fold-config',
              ToolchainType: 'Kubernetes/YAML',
            },
            { upstream_space_id: baseSpaceId, upstream_unit_id: baseUnit.Unit.UnitID },
          );
          cloneUnitIds.set(spaceId, clone.Unit.UnitID);
        }),
      );
    }

    // The Base moves on, so every clone is Stale.
    await api.uploadUnitData({
      spaceId: baseSpaceId,
      unitId: baseUnit.Unit.UnitID,
      body: configMap('2'),
    });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await newAuthorizedContext(browser);
    const page = await context.newPage();
    const api = await openApi(page);
    // Downstream first, so the Base's Unit has no clones left when it goes.
    for (const spaceId of deploymentSpaceIds) {
      await api.deleteSpace(spaceId, true).catch(() => {});
    }
    if (baseSpaceId) await api.deleteSpace(baseSpaceId, true).catch(() => {});
    await context.close();
  });

  test('quiet Deployments stack by Department under one Stale wave; a stack opens; a new Group by survives a reload', async ({
    page,
  }) => {
    await openComponent(page);
    const foldFrame = page.getByTestId(`flow-fold-${baseSpaceId}`);
    await expect(foldFrame).toBeVisible({ timeout: 30000 });

    // With no choice the fold is Auto: the default key shows, and the URL
    // stays without ?graphGroup=, so the threshold keeps deciding.
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Department');
    await expect(page).not.toHaveURL(/[?&]graphGroup=/);

    // One stack per Department, and no card for a quiet (only Stale) Deployment.
    const stacks = page.locator('[data-testid^="flow-stack-stack:"]');
    for (const department of DEPARTMENTS) {
      await expect(
        page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:${department}`),
      ).toBeVisible();
    }
    await expect(stacks).toHaveCount(3);
    for (const id of deploymentSpaceIds) {
      await expect(page.getByTestId(`flow-node-${id}`)).toHaveCount(0);
    }

    // The Base says how many variants are downstream of it.
    await expect(page.getByTestId(`flow-node-${baseSpaceId}`)).toContainText(`${DEPLOYMENTS} variants`);

    // Stale on every Deployment is one chip with one action, not one per card.
    await expect(page.getByTestId('flow-fold-wave-stale')).toContainText(`Stale · ${DEPLOYMENTS}`);
    await expect(page.getByTestId('flow-fold-wave-action-stale')).toHaveText(`Upgrade ${DEPLOYMENTS}`);

    // A stack opens in place: its members are cards now, the others stay closed.
    const stackId = `stack:${baseSpaceId}:v:retail`;
    await page.getByTestId(`flow-stack-${stackId}`).getByRole('button', { name: 'Expand stack' }).click();
    const frame = page.getByTestId(`flow-stack-frame-${stackId}`);
    await expect(frame).toBeVisible();
    const members = idsByDepartment.get('retail')!;
    expect(members).toHaveLength(Math.ceil(DEPLOYMENTS / DEPARTMENTS.length));
    for (const id of members) await expect(page.getByTestId(`flow-node-${id}`)).toBeVisible();
    await expect(page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:payments`)).toBeVisible();

    // A new Group by goes into the URL and survives a reload.
    await page.getByTestId('flow-group-by-button').click();
    await page.getByTestId('flow-group-by-option-Region').click();
    await expect(page).toHaveURL(/[?&]graphGroup=Region(&|$)/);
    for (const region of REGIONS) {
      await expect(
        page.getByTestId(`flow-stack-stack:${baseSpaceId}:v:${region}`),
      ).toBeVisible();
    }
    await expect(stacks).toHaveCount(2);

    await page.reload();
    await expect(foldFrame).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(/[?&]graphGroup=Region(&|$)/);
    await expect(page.getByTestId('flow-group-by-button')).toContainText('Region');
    await expect(stacks).toHaveCount(2);
  });

  // Declared after the Stale-only case, which shares this fixture when both
  // run in one worker, so that case never sees the gates this one adds.
  test('with Gated added as a second wave, each member of an open stack has a gate mark that opens the gate peek', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gateEveryDeployment();
    await openComponent(page);
    await expect(page.getByTestId(`flow-fold-${baseSpaceId}`)).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('flow-fold-wave-gated')).toContainText(
      `Gated · ${DEPLOYMENTS}`,
    );
    // The header says the wave once; closed stacks draw no cards, so no marks.
    await expect(page.getByTestId('gated-mark')).toHaveCount(0);

    const stackId = `stack:${baseSpaceId}:v:retail`;
    await page
      .getByTestId(`flow-stack-${stackId}`)
      .getByRole('button', { name: 'Expand stack' })
      .click();
    const members = idsByDepartment.get('retail')!;
    for (const id of members) {
      const node = page.getByTestId(`flow-node-${id}`);
      await expect(node.getByTestId('gated-mark')).toBeVisible();
      await expect(node.getByTestId('gated-mark')).toHaveAccessibleName(
        `Gated: ${GATE_TRIGGER.Slug}`,
      );
      await expect(node.getByTestId('gated-chip')).toHaveCount(0);
    }

    // Hover opens the same peek as a Gated chip.
    const peek = page.getByTestId('gate-peek');
    await page.getByTestId(`flow-node-${members[0]}`).getByTestId('gated-mark').hover();
    await expect(peek).toBeVisible();
    await expect(peek).toContainText('Gated · validation errors');
    await expect(peek).toContainText(`fold-config: ${GATE_TRIGGER.Slug}`);
    await page.mouse.move(0, 0);
    await expect(peek).toHaveCount(0);

    // So does keyboard focus, and Enter opens the Gates tab.
    await page.keyboard.press('Shift');
    const mark = page.getByTestId(`flow-node-${members[1]}`).getByTestId('gated-mark');
    await mark.focus();
    await expect(peek).toBeVisible();
    // The open peek describes the mark; it does not replace its name.
    await expect(mark).toHaveAccessibleName(`Gated: ${GATE_TRIGGER.Slug}`);
    await expect(peek).toContainText('Review the gate');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('gates-summary')).toBeVisible();
  });
});
