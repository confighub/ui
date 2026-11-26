// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type Page } from '@playwright/test';

import { ApiHelper } from './fixtures/api-helper';
import { confirmArchive } from './fixtures/delete-or-archive';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// The page of every Trigger in the organization (Explorers -> Triggers), and the validation
// errors and warnings Triggers leave on a Component's Variants.

interface TriggerFields {
  TriggerID: string;
  Slug: string;
  Disabled?: boolean;
  Warn?: boolean;
  HiddenReason?: string;
  Labels?: Record<string, string>;
}

const triggersIn = async (spaceId: string, includeHidden?: string): Promise<TriggerFields[]> => {
  const response = await hubApi.get(`/api/space/${spaceId}/trigger`, includeHidden ? { params: { include_hidden: includeHidden } } : undefined);
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as Array<{ Trigger: TriggerFields }>).map((t) => t.Trigger);
};

const createTrigger = async (spaceId: string, fields: Record<string, unknown>) => {
  const response = await hubApi.post(`/api/space/${spaceId}/trigger`, {
    data: { Event: 'Mutation', ToolchainType: 'Kubernetes/YAML', ...fields },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
};

const removeSpaces = async (spaceIds: string[]) => {
  for (const id of spaceIds) {
    const response = await hubApi.delete(`/api/space/${id}`, { params: { recursive: 'true' } });
    if (!response.ok()) console.warn(`Space ${id} was not removed: ${response.status()} ${await response.text()}`);
  }
};

/** The list, narrowed by its search box to the Triggers whose names start with `prefix`. */
const openTriggerList = async (page: Page, prefix: string) => {
  await page.goto('/triggers');
  await page.getByPlaceholder('Search…').fill(prefix);
};

const rowOf = (page: Page, slug: string) => page.locator('.MuiDataGrid-row', { hasText: slug });

const select = async (page: Page, slugs: string[]) => {
  for (const slug of slugs) {
    await expect(rowOf(page, slug)).toBeVisible({ timeout: 15000 });
    await rowOf(page, slug).locator('.MuiDataGrid-cellCheckbox input').check();
  }
};

test.describe('Triggers of every Space', () => {
  test('updates Disabled and Warn of Triggers in two Spaces, then deletes them', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trglist-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      for (const suffix of ['a', 'b']) {
        spaces.push((await api.createSpace({ space: { Slug: `${base}-${suffix}` } })).SpaceID!);
      }
      await createTrigger(spaces[0], { Slug: `${base}-one`, FunctionName: 'vet-schemas' });
      await createTrigger(spaces[1], { Slug: `${base}-two`, FunctionName: 'vet-schemas', Disabled: true });
      const slugs = [`${base}-one`, `${base}-two`];

      await openTriggerList(page, base);
      await select(page, slugs);
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await page.getByTestId('bulk-trigger-disabled').getByRole('button', { name: 'Enabled' }).click();
      await page.getByTestId('bulk-trigger-warn').getByRole('button', { name: 'Warn' }).click();
      await page.getByRole('button', { name: 'Update Triggers' }).click();

      await expect
        .poll(async () => (await Promise.all(spaces.map(triggersIn))).flat().map((t) => [t.Slug, !!t.Disabled, !!t.Warn]))
        .toEqual([
          [slugs[0], false, true],
          [slugs[1], false, true],
        ]);

      // The delete dialog starts on Archive: the Triggers leave the list, archived, not deleted.
      await page.getByRole('button', { name: 'Delete Trigger' }).click();
      await confirmArchive(page);
      await expect.poll(async () => (await Promise.all(spaces.map(triggersIn))).flat().length).toBe(0);
      for (const slug of slugs) await expect(rowOf(page, slug)).toHaveCount(0);
      const archived = (await Promise.all(spaces.map((spaceId) => triggersIn(spaceId, 'Archived')))).flat();
      expect(archived.map((t) => [t.Labels?.ArchivedSlug, t.HiddenReason]).sort()).toEqual(
        slugs.map((slug) => [slug, 'Archived']).sort(),
      );
    } finally {
      await removeSpaces(spaces);
    }
  });

  test('a validating Trigger shows its controls, which the search and the Annotations filter find', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgctl-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      spaces.push((await api.createSpace({ space: { Slug: base } })).SpaceID!);
      await createTrigger(spaces[0], {
        Slug: `${base}-checks`,
        FunctionName: 'vet-schemas',
        Annotations: { Controls: 'CH-0201,CH-0202,CH-0203,CH-0207' },
      });
      await createTrigger(spaces[0], { Slug: `${base}-other`, FunctionName: 'vet-schemas' });

      // A run of controls is shortened in the cell.
      await openTriggerList(page, base);
      const row = rowOf(page, `${base}-checks`);
      await expect(row.locator('[data-field="Controls"]')).toHaveText('CH-0201–CH-0203,CH-0207', { timeout: 15000 });

      // The search finds a control inside the run.
      await page.getByPlaceholder('Search…').fill('CH-0202');
      await expect(row).toBeVisible();
      await expect(rowOf(page, `${base}-other`)).toHaveCount(0);

      // The filter offers Annotations, and filters by one.
      await page.getByRole('button', { name: 'Filter', exact: true }).click();
      await expect(page.getByRole('menuitem').filter({ hasText: /^Annotations$/ })).toBeVisible();
      await page.keyboard.press('Escape');
      const where = `Annotations.Controls LIKE '%CH-0207%' AND Space.Slug = '${base}'`;
      await page.goto(`/triggers?${new URLSearchParams({ filterWhere: where })}`);
      await expect(rowOf(page, `${base}-checks`)).toBeVisible({ timeout: 15000 });
      await expect(rowOf(page, `${base}-other`)).toHaveCount(0);
    } finally {
      await removeSpaces(spaces);
    }
  });

  test('creates a Trigger with the form in the Space picked on it', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgform-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      spaces.push((await api.createSpace({ space: { Slug: base } })).SpaceID!);

      await page.goto('/triggers');
      await page.getByRole('button', { name: 'More ways to create a Trigger' }).click();
      await page.getByRole('menuitem', { name: 'With the Trigger form' }).click();
      await page.getByTestId('trigger-space-select').getByRole('combobox').fill(base);
      await page.getByRole('option', { name: base, exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${base}-made`);
      await page.getByRole('combobox', { name: 'Function Name' }).fill('vet-schemas');
      await page.getByRole('option', { name: /^vet-schemas/ }).first().click();
      await page.getByRole('button', { name: 'Create Trigger' }).click();

      await expect.poll(async () => (await triggersIn(spaces[0])).map((t) => t.Slug)).toEqual([`${base}-made`]);
    } finally {
      await removeSpaces(spaces);
    }
  });

  test("a Trigger's other Units and selections are edited in its drawer and listed in their columns", async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgother-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      const spaceId = (await api.createSpace({ space: { Slug: base } })).SpaceID!;
      spaces.push(spaceId);
      const unitIdOf = async (slug: string) =>
        ((await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' } as never })) as { UnitID: string })
          .UnitID;
      const policyA = await unitIdOf(`${base}-policy-a`);
      const policyB = await unitIdOf(`${base}-policy-b`);
      await createTrigger(spaceId, {
        Slug: `${base}-check`,
        FunctionName: 'vet-schemas',
        OtherUnitIDs: { policy: policyA },
        OtherUnitSelections: {
          workloads: {
            Where: 'Space.Slug = EvaluatingSpace.Slug',
            WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'",
          },
        },
      });
      const [trigger] = await triggersIn(spaceId);

      // The drawer shows the Unit by name and the selection as stored.
      await page.goto(`/triggers?edit=${trigger.TriggerID}`);
      await expect(page.getByTestId('trigger-other-unit-key-0')).toHaveValue('policy');
      const unitPicker = page.getByTestId('trigger-other-unit-unit-0').getByRole('combobox');
      await expect(unitPicker).toHaveValue(`${base}/${base}-policy-a`);
      await expect(page.getByTestId('trigger-selection-key-0')).toHaveValue('workloads');
      await expect(page.getByTestId('trigger-selection-where-0')).toHaveValue('Space.Slug = EvaluatingSpace.Slug');

      // Another Unit, and the selection replaced by another.
      await unitPicker.fill(`${base}-policy-b`);
      await page.getByRole('option', { name: `${base}/${base}-policy-b`, exact: true }).click();
      await page.getByRole('button', { name: 'Remove selection 1', exact: true }).click();
      await page.getByTestId('trigger-selection-add').click();
      await page.getByTestId('trigger-selection-key-0').fill('namespaces');

      // A selection with nothing to select by is refused before anything is written.
      await page.getByRole('button', { name: 'Update Trigger' }).click();
      await expect(page.getByText('Give it a Where, a Unit Filter or a Where Resource')).toBeVisible();
      await page.getByTestId('trigger-selection-where-resource-0').fill("ConfigHub.ResourceType = 'v1/Namespace'");
      await page.getByRole('button', { name: 'Update Trigger' }).click();

      await expect
        .poll(async () => {
          const response = await hubApi.get(`/api/space/${spaceId}/trigger/${trigger.TriggerID}`);
          const { OtherUnitIDs, OtherUnitSelections } = ((await response.json()) as {
            Trigger: { OtherUnitIDs?: Record<string, string>; OtherUnitSelections?: Record<string, unknown> };
          }).Trigger;
          return { OtherUnitIDs, OtherUnitSelections };
        })
        .toEqual({
          OtherUnitIDs: { policy: policyB },
          OtherUnitSelections: { namespaces: { WhereResource: "ConfigHub.ResourceType = 'v1/Namespace'" } },
        });

      // The list shows them in columns the Columns panel turns on.
      await openTriggerList(page, base);
      const row = rowOf(page, `${base}-check`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Select columns', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Other Units', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Other Unit Selections', exact: true }).check();
      await page.keyboard.press('Escape');
      await expect(row.locator('[data-field="OtherUnits"]')).toContainText(`policy=${base}/${base}-policy-b`);
      await expect(row.locator('[data-field="OtherUnitSelections"]')).toHaveText('namespaces');
    } finally {
      await removeSpaces(spaces);
    }
  });

  test('the bulk update sets a Unit and a selection on Triggers in two Spaces and removes a key from each', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgbulkod-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      for (const suffix of ['a', 'b']) {
        spaces.push((await api.createSpace({ space: { Slug: `${base}-${suffix}` } })).SpaceID!);
      }
      // One already selects under the key, with a Where the update must not keep.
      await createTrigger(spaces[0], {
        Slug: `${base}-one`,
        FunctionName: 'vet-schemas',
        OtherUnitSelections: {
          workloads: { Where: "Slug = 'old'" },
          legacy: { WhereResource: "ConfigHub.ResourceType = 'v1/Pod'" },
        },
      });
      // The other selects under the key the update gives a Unit, which replaces the selection.
      await createTrigger(spaces[1], {
        Slug: `${base}-two`,
        FunctionName: 'vet-schemas',
        OtherUnitSelections: {
          legacy: { WhereResource: "ConfigHub.ResourceType = 'v1/Pod'" },
          policy: { Where: "Slug = 'policy'" },
        },
      });
      const policyUnit = (
        (await api.createUnit({ spaceId: spaces[0], unit: { Slug: `${base}-policy`, ToolchainType: 'Kubernetes/YAML' } as never })) as {
          UnitID: string;
        }
      ).UnitID;

      await openTriggerList(page, base);
      await select(page, [`${base}-one`, `${base}-two`]);
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      await page.getByTestId('trigger-other-unit-add').click();
      await page.getByTestId('trigger-other-unit-key-0').fill('policy');
      await page.getByTestId('trigger-other-unit-unit-0').getByRole('combobox').fill(`${base}-policy`);
      await page.getByRole('option', { name: `${base}-a/${base}-policy`, exact: true }).click();
      await page.getByTestId('trigger-selection-add').click();
      await page.getByTestId('trigger-selection-key-0').fill('workloads');
      await page.getByTestId('trigger-selection-where-resource-0').fill("ConfigHub.ResourceType = 'apps/v1/Deployment'");
      await page.getByTestId('bulk-trigger-remove-other-data-add').click();
      await page.getByTestId('bulk-trigger-remove-other-data-key-0').fill('legacy');
      await page.getByRole('button', { name: 'Update Triggers' }).click();

      const otherData = async () =>
        Promise.all(
          spaces.map(async (spaceId) => {
            const response = await hubApi.get(`/api/space/${spaceId}/trigger`);
            return (
              (await response.json()) as Array<{
                Trigger: { OtherUnitIDs?: Record<string, string>; OtherUnitSelections?: Record<string, unknown> };
              }>
            ).map((t) => [t.Trigger.OtherUnitIDs, t.Trigger.OtherUnitSelections]);
          }),
        );
      const workloads = { workloads: { WhereResource: "ConfigHub.ResourceType = 'apps/v1/Deployment'" } };
      const policy = { policy: policyUnit };
      await expect.poll(otherData).toEqual([[[policy, workloads]], [[policy, workloads]]]);
    } finally {
      // The Trigger in the second Space names a Unit in the first, which refuses the first's delete
      // until the second has gone.
      await removeSpaces([...spaces].reverse());
    }
  });

  test('a Trigger is edited as YAML from its drawer', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgyaml-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    try {
      spaces.push((await api.createSpace({ space: { Slug: base } })).SpaceID!);
      await createTrigger(spaces[0], { Slug: `${base}-one`, FunctionName: 'vet-schemas' });
      const [trigger] = await triggersIn(spaces[0]);
      const read = await hubApi.get(`/api/space/${spaces[0]}/trigger/${trigger.TriggerID}/document`);
      expect(read.ok(), await read.text()).toBeTruthy();
      const { Document: document } = (await read.json()) as { Document: string };
      expect(document).not.toContain('Labels:');

      await page.goto(`/triggers?edit=${trigger.TriggerID}`);
      await page.getByTestId('trigger-edit-yaml').click();
      const editor = page.getByTestId('trigger-document-editor');
      await expect(editor).toContainText(`Slug: ${base}-one`);

      // A one-line flow mapping on a new first line, at column 0 of a top-level field, which
      // Monaco's auto-indent leaves as typed.
      const monaco = editor.locator('div.monaco-editor');
      await monaco.locator('.view-line', { hasText: 'Disabled:' }).click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.insertText('Labels: {Tier: web}');
      await page.getByTestId('trigger-document-save').click();
      await expect(editor).toBeHidden();

      await expect
        .poll(async () => {
          const response = await hubApi.get(`/api/space/${spaces[0]}/trigger/${trigger.TriggerID}`);
          return ((await response.json()) as { Trigger: { Labels?: Record<string, string> } }).Trigger.Labels;
        })
        .toEqual({ Tier: 'web' });
      // The drawer stays open and shows what was saved.
      await expect(page.getByTestId('trigger-labels-key-0')).toHaveValue('Tier');
    } finally {
      await removeSpaces(spaces);
    }
  });

  test('a refetch that fails keeps the Triggers it listed, with the error above them', async ({ page }) => {
    const api = new ApiHelper(page);
    const slug = `trgkeep-${RandomSlugGenerator.randomSlugName()}`;
    const spaceId = (await api.createSpace({ space: { Slug: slug } })).SpaceID!;
    try {
      await createTrigger(spaceId, { Slug: `${slug}-one`, FunctionName: 'vet-schemas' });
      await page.goto(`/triggers?${new URLSearchParams({ filterWhere: `SpaceID = '${spaceId}'` }).toString()}`);
      await expect(rowOf(page, `${slug}-one`)).toBeVisible({ timeout: 15000 });

      // The next read of the same list fails, as one on returning to the tab can.
      await page.route(/\/api\/trigger\?/, (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'read failed' }) }),
      );
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByTestId('triggers-read-error')).toBeVisible({ timeout: 15000 });
      await expect(rowOf(page, `${slug}-one`)).toBeVisible();
    } finally {
      await page.unroute(/\/api\/trigger\?/);
      await removeSpaces([spaceId]);
    }
  });

  test('a read the server refuses is shown as an error, with the filters to correct it', async ({ page }) => {
    await page.goto(`/triggers?${new URLSearchParams({ filterWhere: "NoSuchAttribute = 'x'" }).toString()}`);
    await expect(page.getByTestId('triggers-read-error')).toBeVisible({ timeout: 20000 });
    // The Where stays as a filter block, and nothing reads as no Triggers.
    await expect(page.getByTestId('query-builder').getByRole('textbox').first()).toHaveValue("NoSuchAttribute = 'x'");
    await expect(page.getByText(/No matching triggers|No Space has any Triggers/i)).toHaveCount(0);
  });
});

const deployment = (name: string, replicas: number) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: ${replicas}
  template:
    spec:
      containers:
        - name: ${name}
          image: nginx:1.25
`;

test.describe('validation errors and warnings on a Component', () => {
  test('a Variant shows Gated and Warnings, and its Unit chips open the Unit at the gate', async ({ page }) => {
    const api = new ApiHelper(page);
    const base = `trgchips-${RandomSlugGenerator.randomSlugName()}`;
    const spaces: string[] = [];
    let componentId: string | undefined;
    try {
      const componentSlug = `${base}-c`;
      componentId = (await api.createComponent(componentSlug)).ComponentID!;
      // No Target: a Unit with validation errors is Gated whether or not it can be released.
      const space = await api.createSpace({ space: { Slug: `${base}-dev`, ComponentID: componentId } });
      const spaceId = space.SpaceID!;
      spaces.push(spaceId);

      // A blocking check and a warning, both failed by a Deployment of 2 replicas.
      await createTrigger(spaceId, {
        Slug: `${base}-min3`,
        FunctionName: 'vet-celexpr',
        Arguments: [{ ParameterName: 'validation-expr', Value: "r.kind != 'Deployment' || r.spec.replicas >= 3" }],
      });
      await createTrigger(spaceId, {
        Slug: `${base}-min5`,
        FunctionName: 'vet-celexpr',
        Warn: true,
        Arguments: [{ ParameterName: 'validation-expr', Value: "r.kind != 'Deployment' || r.spec.replicas >= 5" }],
      });
      const unit = await api.createUnit({ spaceId, unit: { Slug: 'web', ToolchainType: 'Kubernetes/YAML' } });
      await api.uploadUnitData({ spaceId, unitId: unit.UnitID!, body: deployment('web', 2) });

      const errorGate = `${base}-dev/${base}-min3/vet-celexpr`;
      const warningGate = `${base}-dev/${base}-min5/vet-celexpr`;
      await expect
        .poll(
          async () => {
            const response = await hubApi.get(`/api/space/${spaceId}/unit/${unit.UnitID}`);
            const body = (await response.json()) as {
              Unit?: { ValidationErrors?: Record<string, boolean>; ValidationWarnings?: Record<string, boolean> };
            };
            return [Object.keys(body.Unit?.ValidationErrors ?? {}), Object.keys(body.Unit?.ValidationWarnings ?? {})];
          },
          { timeout: 30_000, message: 'the Triggers checked the Unit' },
        )
        .toEqual([[errorGate], [warningGate]]);

      await page.goto(`/components?app=${componentSlug}`);
      const card = page.locator('.react-flow__node', { hasText: `${base}-dev` }).first();
      await expect(card.getByText('Gated', { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(card.getByText('Warnings', { exact: true })).toBeVisible();

      // The card's Gated chip opens the Variant's pane, where the Unit carries both chips.
      await card.getByText('Gated', { exact: true }).click();
      const gatedChip = page.getByTestId('unit-status-gated');
      const warningsChip = page.getByTestId('unit-status-warnings');
      await expect(gatedChip).toBeVisible({ timeout: 15000 });
      await expect(warningsChip).toBeVisible();

      // Hovering names the gate; clicking opens the Unit's Overview on it.
      // The graph card's Gated peek can still be open beside the chip's tooltip, so the one naming
      // the gate is looked for rather than the only one.
      await gatedChip.hover();
      await expect(page.getByRole('tooltip').filter({ hasText: errorGate })).toBeVisible();
      await expect(warningsChip).toHaveAttribute('href', new RegExp(`gate=${encodeURIComponent(warningGate)}`));
      await gatedChip.click();
      await expect(page).toHaveURL(new RegExp(`/units/${spaceId}/${unit.UnitID}\\?tab=0&gate=${encodeURIComponent(errorGate)}`));
      await expect(page.getByText('Validation Warnings', { exact: true })).toBeVisible({ timeout: 15000 });
      // Errors are explained in the danger tone.
      await expect(page.getByRole('alert').filter({ hasText: 'About validation errors' })).toHaveClass(
        /MuiAlert-standardError/,
      );
    } finally {
      await removeSpaces(spaces);
      if (componentId) await hubApi.delete(`/api/component/${componentId}`);
    }
  });
});
