// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Gates tab of the Component side pane, against a real server: the Gated chip opens it, the
// tab counts the blocking findings, a value set "here instead" is saved as one Revision with Keep
// on merge, the Trigger runs again and the gate clears in place. A save over several Units says
// which were saved and which were not, and a save that changes nothing says so.
import type { Page, Route } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';

const deployment = (name: string, extra = '') => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: confighubplaceholder
${extra}spec:
  replicas: 1
`;

const PLACEHOLDERS_TRIGGER = {
  Slug: 'no-placeholders',
  DisplayName: 'Placeholders left',
  Description: 'Set a real value in each field.',
  FunctionName: 'vet-placeholders',
  Arguments: [],
};

/** A check that names no field, so its gate has "Re-check" and no save. */
const REPLICAS_TRIGGER = {
  Slug: 'max-two-replicas',
  DisplayName: 'Too many replicas',
  Description: 'Run at most 2 replicas.',
  FunctionName: 'vet-celexpr',
  Arguments: [
    {
      ParameterName: 'validation-expr',
      Value: "r.kind != 'Deployment' || r.spec.replicas <= 2",
    },
  ],
};

interface GatedComponent {
  slug: string;
  base: { SpaceID: string };
  dev: { SpaceID: string };
  /** Per Unit slug: the base Unit and its clone in dev. */
  units: Record<string, { baseId: string; devId: string; devHead: number }>;
  cleanup: () => Promise<void>;
}

/**
 * A Component with a base and a dev Variant (dev has a release Target, so it has the Gates tab),
 * a placeholders Trigger in dev, and each Unit created in base and cloned to dev, so Blame names
 * the base as the origin of its values. The Trigger has run on every dev Unit.
 */
const makeGatedComponent = async (
  page: Page,
  units: Record<string, string>,
  {
    baseInComponent = true,
    trigger: triggerSpec = PLACEHOLDERS_TRIGGER,
  }: { baseInComponent?: boolean; trigger?: Record<string, unknown> } = {},
): Promise<GatedComponent> => {
  const api = new ApiHelper(page);
  // Unique per test, so tests that run at once never share a Component.
  const slug = `gates-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const component = await api.createComponent(slug);
  const base = await api.createSpace({
    space: {
      Slug: `${slug}-base`,
      ...(baseInComponent ? { ComponentID: component.ComponentID } : {}),
      Labels: { Variant: 'base' },
    },
  });
  const dev = await api.createSpace({
    space: {
      Slug: `${slug}-dev`,
      ComponentID: component.ComponentID,
      Labels: { Variant: 'dev' },
    },
  });
  const target = await api.createTarget({ spaceId: dev.SpaceID, slug: 'release' });
  await api.updateSpace({ spaceId: dev.SpaceID, space: { ReleaseTargetID: target.TargetID } });
  const trigger = await hubApi.post(`/api/space/${dev.SpaceID}/trigger`, {
    data: { Event: 'Mutation', ToolchainType: 'Kubernetes/YAML', ...triggerSpec },
  });
  expect(trigger.ok(), await trigger.text()).toBe(true);
  const triggerID = ((await trigger.json()) as { TriggerID: string }).TriggerID;

  const made: GatedComponent['units'] = {};
  for (const [unitSlug, data] of Object.entries(units)) {
    const baseUnit = await api.createUnit({
      spaceId: base.SpaceID,
      unit: { Slug: unitSlug, ToolchainType: 'Kubernetes/YAML' },
    });
    await api.uploadUnitData({ spaceId: base.SpaceID, unitId: baseUnit.UnitID, body: data });
    const clone = await hubApi.post(`/api/space/${dev.SpaceID}/unit`, {
      params: { upstream_space_id: base.SpaceID, upstream_unit_id: baseUnit.UnitID },
      data: { Slug: unitSlug, ToolchainType: 'Kubernetes/YAML' },
    });
    expect(clone.ok(), await clone.text()).toBe(true);
    const devUnit = (
      (await clone.json()) as { Unit: { UnitID: string; HeadRevisionNum?: number } }
    ).Unit;
    const run = await hubApi.post('/api/function/invoke', {
      params: { executor_space: dev.SpaceID, where: `UnitID = '${devUnit.UnitID}'` },
      data: {
        ToolchainType: 'Kubernetes/YAML',
        Triggers: [triggerID],
        UpdateValidationResults: true,
        FunctionInvocations: null,
      },
    });
    expect(run.ok(), await run.text()).toBe(true);
    made[unitSlug] = {
      baseId: baseUnit.UnitID,
      devId: devUnit.UnitID,
      devHead: devUnit.HeadRevisionNum ?? 0,
    };
  }
  return {
    slug,
    base,
    dev,
    units: made,
    cleanup: async () => {
      await api.deleteSpace(dev.SpaceID, true).catch(() => {});
      await api.deleteSpace(base.SpaceID, true).catch(() => {});
      await api.deleteComponent(component.ComponentID!).catch(() => {});
    },
  };
};

const openGates = async (page: Page, c: GatedComponent) => {
  await page.goto(`/components?app=${c.slug}`);
  const chip = page.getByTestId(`flow-node-${c.dev.SpaceID}`).getByTestId('gated-chip');
  await expect(chip).toBeVisible({ timeout: 30000 });
  await chip.click();
  await expect(page.getByTestId('gates-summary')).toBeVisible();
};

const devHead = async (c: GatedComponent, unitSlug: string): Promise<number> => {
  const res = await hubApi.get(`/api/space/${c.dev.SpaceID}/unit`);
  const list = (await res.json()) as { Unit: { UnitID: string; HeadRevisionNum: number } }[];
  return list.find((u) => u.Unit.UnitID === c.units[unitSlug].devId)!.Unit.HeadRevisionNum;
};

/** The row of a field, by the resource it is in and its path. */
const row = (page: Page, resourceName: string, path: string) =>
  page
    .locator('[data-testid^="fix-row-1-"]')
    .filter({
      has: page.locator(
        `[data-testid^="fix-resource-"]:text-is("Deployment ${resourceName}")`,
      ),
    })
    .filter({ has: page.locator(`[data-testid^="fix-path-"]:text-is("${path}")`) });

test.describe('Gates tab', () => {
  test('opens from the Gated chip, fixes a field here and clears the gate', async ({
    page,
  }) => {
    const c = await makeGatedComponent(page, {
      web: deployment('web', '  annotations:\n    owner: confighubplaceholder\n'),
    });
    const devUnit = c.units.web;
    try {
      await openGates(page, c);

      // Two placeholder fields: two blocking findings, one gate.
      await expect(page.getByTestId('component-pane-tab-gates-count')).toHaveText('2');
      await expect(page.getByTestId('gates-summary-title')).toHaveText(
        `1 gate blocks ${c.slug}-dev`,
      );
      await expect(page.getByTestId('gate-title-1')).toHaveText('Placeholders left');
      await expect(page.getByTestId('gate-status-1')).toHaveText('2 to fix');

      // Both values came from the base: "Fix in <base>" leads, "Fix here instead" opens the input.
      await expect(page.getByTestId('fix-origin-1-1')).toContainText(
        `From ${c.slug}-base/web`,
      );
      await expect(page.getByTestId('fix-origin-link-1-1')).toHaveText(
        `Fix in ${c.slug}-base`,
      );
      // Every Unit the tab names links to that Unit's configuration page, in a new tab.
      const devHref = `/units/${c.dev.SpaceID}/${devUnit.devId}?tab=1`;
      const baseHref = `/units/${c.base.SpaceID}/${devUnit.baseId}?tab=1`;
      for (const [id, href, text] of [
        ['gate-unit-link-1', devHref, `${c.slug}-dev/web`],
        ['gate-save-hint-unit-link-1', devHref, `${c.slug}-dev/web`],
        ['fix-origin-unit-link-1-1', baseHref, `${c.slug}-base/web`],
        ['fix-origin-unit-link-1-2', baseHref, `${c.slug}-base/web`],
      ] as const) {
        const link = page.getByTestId(id);
        await expect(link).toHaveText(text);
        await expect(link).toHaveAttribute('href', href);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /noopener/);
      }
      const save = page.getByTestId('gate-save-1');
      await expect(save).toBeDisabled();
      await expect(save).toHaveText('Save fixes and re-check');

      const pathsInOrder = [
        await page.getByTestId('fix-path-1-1').textContent(),
        await page.getByTestId('fix-path-1-2').textContent(),
      ];
      const valueFor = (path: string | null) =>
        path === 'metadata.namespace' ? 'web-dev' : 'team-dev';
      for (const [i, path] of pathsInOrder.entries()) {
        await page.getByTestId(`fix-here-1-${i + 1}`).click();
        await page.getByTestId(`fix-input-1-${i + 1}`).fill(valueFor(path));
        await expect(page.getByTestId(`fix-keep-1-${i + 1}`).locator('input')).toBeChecked();
      }
      await expect(save).toHaveText('Save 2 fixes and re-check');
      await save.click();

      await expect(page.getByTestId('gate-cleared-1')).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId('gate-status-1')).toHaveText('Cleared');
      await expect(page.getByTestId('component-pane-tab-gates-count')).toHaveText('0');

      // One Revision for both values, then one for Keep on merge.
      expect(await devHead(c, 'web')).toBe(devUnit.devHead + 2);
      const data = await hubApi.get(`/api/space/${c.dev.SpaceID}/unit/${devUnit.devId}/data`);
      const text = await data.text();
      expect(text).toContain('namespace: web-dev');
      expect(text).toContain('owner: team-dev');
    } finally {
      await c.cleanup();
    }
  });

  test('a save over two Units says which were saved, and a save that changes nothing says so', async ({
    page,
  }) => {
    const c = await makeGatedComponent(page, {
      api: deployment('api'),
      web: deployment('web'),
    });
    try {
      await openGates(page, c);
      await expect(page.getByTestId('gate-status-1')).toHaveText('2 to fix');
      const save = page.getByTestId('gate-save-1');

      // A typed value equal to the current one writes nothing: the save says so, no Revision.
      const webRow = row(page, 'web', 'metadata.namespace');
      await webRow.locator('[data-testid^="fix-here-"]').click();
      await webRow.locator('[data-testid^="fix-input-"]').fill('confighubplaceholder');
      await webRow.locator('[data-testid^="fix-keep-"] input').uncheck();
      await save.click();
      await expect(page.getByTestId('save-error')).toContainText(
        `${c.slug}-dev/web: The values are already set, so nothing changed.`,
      );
      expect(await devHead(c, 'web')).toBe(c.units.web.devHead);

      // The api Unit's write fails; the web Unit's is saved, once, and its fix is cleared.
      await webRow.locator('[data-testid^="fix-input-"]').fill('web-dev');
      const apiRow = row(page, 'api', 'metadata.namespace');
      await apiRow.locator('[data-testid^="fix-here-"]').click();
      await apiRow.locator('[data-testid^="fix-input-"]').fill('api-dev');
      await apiRow.locator('[data-testid^="fix-keep-"] input').uncheck();
      const failApi = async (route: Route) =>
        decodeURIComponent(route.request().url()).includes(c.units.api.devId)
          ? route.fulfill({
              status: 500,
              json: {
                message: 'injected failure',
                Error: { Message: 'injected failure', Status: 500 },
              },
            })
          : route.continue();
      await page.route(/\/api\/function\/invoke/, failApi);
      await save.click();
      await expect(page.getByTestId('save-error')).toContainText(
        `${c.slug}-dev/api: injected failure`,
      );
      await expect(page.getByTestId('save-error')).toContainText(
        `Saved: ${c.slug}-dev/web as Revision ${c.units.web.devHead + 1}.`,
      );
      await expect
        .poll(() => devHead(c, 'web'), { timeout: 20000 })
        .toBe(c.units.web.devHead + 1);
      expect(await devHead(c, 'api')).toBe(c.units.api.devHead);
      // The api fix is still staged; saving again writes the api Unit only.
      await page.unroute(/\/api\/function\/invoke/, failApi);
      await expect(apiRow.locator('[data-testid^="fix-input-"]')).toHaveValue('api-dev');
      await expect(save).toHaveText('Save 1 fix and re-check');
      await save.click();
      await expect
        .poll(() => devHead(c, 'api'), { timeout: 20000 })
        .toBe(c.units.api.devHead + 1);
      expect(await devHead(c, 'web')).toBe(c.units.web.devHead + 1);
    } finally {
      await c.cleanup();
    }
  });

  test('"Fix in <origin>" is a link to the origin Unit when the origin is not in this Component', async ({
    page,
  }) => {
    const c = await makeGatedComponent(
      page,
      { web: deployment('web') },
      { baseInComponent: false },
    );
    const href = `/units/${c.base.SpaceID}/${c.units.web.baseId}?tab=1`;
    try {
      await openGates(page, c);
      const fix = page.getByTestId('fix-origin-link-1-1');
      await expect(fix).toHaveText(`Fix in ${c.slug}-base`);
      await expect(fix).toHaveAttribute('href', href);
      await expect(fix).toHaveAttribute('target', '_blank');
      await expect(page.getByTestId('gate-origin-fix-1')).toHaveAttribute('href', href);
    } finally {
      await c.cleanup();
    }
  });

  test('Re-check runs the Trigger again, and says so when it did not run on a Unit', async ({
    page,
  }) => {
    const c = await makeGatedComponent(
      page,
      { web: deployment('web').replace('replicas: 1', 'replicas: 3') },
      { trigger: REPLICAS_TRIGGER },
    );
    try {
      await openGates(page, c);
      await expect(page.getByTestId('gate-title-1')).toHaveText('Too many replicas');
      const recheck = page.getByTestId('gate-recheck-1');

      // The Trigger runs again on the Unit; nothing failed, so no error.
      const ran = page.waitForResponse(
        (r) => r.url().includes('/function/invoke') && r.request().method() === 'POST',
      );
      await recheck.click();
      expect((await ran).status()).toBe(200);
      await expect(recheck).toBeEnabled();
      await expect(page.getByTestId('save-error')).toHaveCount(0);

      // A 207 whose item for the Unit failed: the request "succeeds", the re-check did not.
      const fail = (route: Route) =>
        route.fulfill({
          status: 207,
          json: [
            {
              UnitID: c.units.web.devId,
              Success: false,
              Error: { Message: 'the Trigger could not run', Status: 500, Type: 'Internal' },
            },
          ],
        });
      await page.route(/\/api\/function\/invoke/, fail);
      await recheck.click();
      await expect(page.getByTestId('save-error')).toContainText(
        `Not re-checked. ${c.slug}-dev/web: the Trigger could not run`,
      );
      await page.unroute(/\/api\/function\/invoke/, fail);
    } finally {
      await c.cleanup();
    }
  });
});
