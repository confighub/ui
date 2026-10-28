// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * The "create a ChangeOrder" draft (`/change-orders/new`), driven the way a person drives it,
 * against a live server, over data this file seeds for itself:
 *
 *     base ──▶ dev (Stage=dev)
 *          ├─▶ prod-eu, prod-us, prod-ap (Stage=prod)
 *
 * The Component's policy allows one workflow (dev → prod) and requires it. The last ChangeOrder
 * took dev, prod-eu and prod-us (not prod-ap), so "as last time" is three of four variants. Since
 * then the base has a closed ChangeSet (image 1.0.0 → 1.1.0 and a ConfigMap value) and, after
 * it, a memory change that prod-us keeps out with a protected local override: prod-us is the
 * one outlier when the draft ends at the latest change.
 *
 * A facts Space outside the Component holds a shared source (a telemetry ConfigMap), which dev
 * and prod-eu read through staged TransformPaths Links: both took it once, and it has moved
 * since, so a Transform paths draft over them has one change to carry. prod-ap reads nothing.
 *
 * Requests the page makes are observed or answered with `page.route` where a test is about what
 * the page sends (Create, which is answered without creating anything) or how it takes a failure
 * (the upgrade dry run). One test creates a ChangeOrder for real and deletes it.
 */
import { type Page, type Request } from '@playwright/test';

import { draftCopy } from '../src/pages/change-orders/draft/draftCopy';
import { ApiHelper } from './fixtures/api-helper';
import { createChangeWorkflow } from './fixtures/change-order-fixture';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';
import { test, expect, newAuthorizedContext, hubApi } from './fixtures/test';

const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

const deployment = (tag: string, memory: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/draft-api:${tag}
          resources:
            limits:
              memory: ${memory}
        - name: proxy
          image: ghcr.io/acme/draft-proxy:2.0.0
`;

/** The shared source a Transform paths draft carries a change of. */
const telemetry = (endpoint: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: telemetry
  namespace: platform
data:
  otlpEndpoint: "${endpoint}"
`;
/** The variants whose api-config reads the shared source. */
const LINKED: VariantName[] = ['dev', 'prod-eu'];

const configMap = (feature: string) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  FEATURE_X: "${feature}"
`;

/** The variants, by display name: [stage, region]. */
const VARIANTS = {
  dev: ['dev', 'eu'],
  'prod-eu': ['prod', 'eu'],
  'prod-us': ['prod', 'us'],
  'prod-ap': ['prod', 'ap'],
} as const;
type VariantName = keyof typeof VARIANTS;
/** What the last ChangeOrder covered. */
const LAST_SCOPE: VariantName[] = ['dev', 'prod-eu', 'prod-us'];

interface DraftSeed {
  label: string;
  componentId: string;
  baseSlug: string;
  baseSpaceId: string;
  /** The last ChangeOrder: dated, so the draft's name is that date moved to today. */
  lastSlug: string;
  /** The closed ChangeSet the draft can end at. */
  releaseSlug: string;
  workflowSlug: string;
  /** A second workflow the policy allows (prod only), so the Workflow fact has a choice. */
  hotfixSlug: string;
  variants: Record<VariantName, { slug: string; spaceId: string }>;
  /** Every Space seeded, in creation order; deleted in reverse. */
  spaceIds: string[];
  /** A saved image tag Invocation in the workflows' Space, as the function slot names it. */
  imageInvocation: { invocationId: string; ref: string };
  /** The shared source's Space and Unit, which the LINKED variants read. */
  factsSlug: string;
}

const spaceIdOf = (created: unknown) => (created as { SpaceID: string }).SpaceID;

async function patchOrThrow(path: string, data: unknown, params?: Record<string, string>) {
  const response = await hubApi.patch(path, { headers: MERGE_PATCH, data, ...(params ? { params } : {}) });
  if (!response.ok()) throw new Error(`PATCH ${path}: ${response.status()} ${await response.text()}`);
}

async function seedDraft(page: Page): Promise<DraftSeed> {
  const api = new ApiHelper(page);
  const label = `e2e-draft-${RandomSlugGenerator.randomSlugName()}`;
  const spaceIds: string[] = [];
  const component = await api.createComponent(label);
  const componentId = component.ComponentID as string;
  const seed: Partial<DraftSeed> = { label, componentId, spaceIds };

  try {
    // The workflow lives outside the Component, so its Space is not taken for a variant.
    const platformId = spaceIdOf(await api.createSpace({ space: { Slug: `${label}-platform`, Labels: { Owner: 'E2E' } } as never }));
    spaceIds.push(platformId);
    const workflowSlug = `${label}-line`;
    const workflowId = await createChangeWorkflow(page, platformId, {
      Slug: workflowSlug,
      Stages: [
        { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
        { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released'] },
      ],
    });
    const hotfixSlug = `${label}-hotfix`;
    const hotfixId = await createChangeWorkflow(page, platformId, {
      Slug: hotfixSlug,
      Stages: [{ Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" }],
    });

    // A parameterized image tag Invocation saved before, as the seed's platform one is.
    const savedImage = await hubApi.post(`/api/space/${platformId}/invocation`, {
      data: {
        Slug: `${label}-set-image`,
        ToolchainType: 'Kubernetes/YAML',
        FunctionInvocations: [
          {
            FunctionName: 'set-container-image',
            Arguments: [
              { ParameterName: 'container-name', Value: '{{ .Params.container_name }}', Evaluator: 'template' },
              { ParameterName: 'container-image', Value: '{{ .Params.image }}', Evaluator: 'template' },
            ],
          },
        ],
        Parameters: [
          { ParameterName: 'container_name', DataType: 'string', Required: true },
          { ParameterName: 'image', DataType: 'string', Required: true },
        ],
      },
    });
    if (!savedImage.ok()) throw new Error(`invocation: ${savedImage.status()} ${await savedImage.text()}`);
    const imageInvocation = { invocationId: ((await savedImage.json()) as { InvocationID: string }).InvocationID, ref: `${label}-platform/${label}-set-image` };

    // The shared source, outside the Component. Seeded before the variants, so deleted after them.
    const factsSlug = `${label}-facts`;
    const factsId = spaceIdOf(await api.createSpace({ space: { Slug: factsSlug, Labels: { Owner: 'E2E' } } as never }));
    spaceIds.push(factsId);
    const factsUnitId = ((await api.createUnit({ spaceId: factsId, unit: { Slug: 'telemetry', ToolchainType: 'Kubernetes/YAML' } as never })) as { UnitID: string }).UnitID;
    await api.uploadUnitData({ spaceId: factsId, unitId: factsUnitId, body: telemetry('https://otel.eu.acme.internal:4317') });

    const baseSlug = `${label}-base`;
    const baseSpaceId = spaceIdOf(
      await api.createSpace({ space: { Slug: baseSlug, ComponentID: componentId, Labels: { Owner: 'E2E', Variant: 'base' } } as never }),
    );
    spaceIds.push(baseSpaceId);

    const variants = {} as DraftSeed['variants'];
    for (const [name, [stage, region]] of Object.entries(VARIANTS) as [VariantName, readonly [string, string]][]) {
      const slug = `${label}-${name}`;
      const spaceId = spaceIdOf(
        await api.createSpace({
          space: {
            Slug: slug,
            DisplayName: name,
            ComponentID: componentId,
            Labels: { Owner: 'E2E', Variant: name, Stage: stage, Region: region },
            Annotations: { UpstreamSpaceID: baseSpaceId },
          } as never,
        }),
      );
      spaceIds.push(spaceId);
      variants[name] = { slug, spaceId };
      // A release Target is what tells a deployment from a base ("New ChangeOrder" lists bases).
      const target = await api.createTarget({ spaceId, slug: `${slug}-oci` });
      await api.updateSpace({ spaceId, space: { ReleaseTargetID: (target as { TargetID: string }).TargetID } as never });
    }

    const baseUnits = { api: '', config: '' };
    for (const [key, slug, body] of [
      ['api', 'api', deployment('1.0.0', '512Mi')],
      ['config', 'api-config', configMap('false')],
    ] as const) {
      const unit = await api.createUnit({ spaceId: baseSpaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' } as never });
      baseUnits[key] = (unit as { UnitID: string }).UnitID;
      await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnits[key], body });
    }

    // The bulk clone is what makes the UpgradeUnit Links a promotion follows.
    const inList = Object.values(variants).map((variant) => `'${variant.spaceId}'`).join(', ');
    const clone = await hubApi.post('/api/unit', {
      params: { where: `SpaceID = '${baseSpaceId}'`, where_space: `SpaceID IN (${inList})` },
      headers: MERGE_PATCH,
      data: {},
    });
    if (!clone.ok()) throw new Error(`clone: ${clone.status()} ${await clone.text()}`);
    const cloned = (await clone.json()) as { Error?: { Message?: string } | null }[];
    const refused = cloned.filter((entry) => entry.Error);
    if (refused.length > 0) throw new Error(`clone refused: ${refused.map((entry) => entry.Error?.Message).join('; ')}`);

    // prod-us keeps its own memory limit through every merge: the outlier.
    const usUnits = await api.listUnits({ where: `SpaceID = '${variants['prod-us'].spaceId}' AND Slug = 'api'`, select: 'UnitID,Slug' });
    const usApi = usUnits[0]?.Unit?.UnitID;
    if (usApi === undefined) throw new Error('prod-us has no api Unit after the clone');
    await api.uploadUnitData({ spaceId: variants['prod-us'].spaceId, unitId: usApi, body: deployment('1.0.0', '1Gi'), protect: true });

    // dev and prod-eu read the shared source through a staged Link, and take it as it is now.
    for (const name of LINKED) {
      const { spaceId } = variants[name];
      const [config] = await api.listUnits({ where: `SpaceID = '${spaceId}' AND Slug = 'api-config'`, select: 'UnitID,Slug' });
      const configId = config?.Unit?.UnitID;
      if (configId === undefined) throw new Error(`${name} has no api-config Unit after the clone`);
      await api.createLink({
        spaceId,
        link: {
          Slug: 'otel-endpoint',
          FromUnitID: configId,
          ToUnitID: factsUnitId,
          ToSpaceID: factsId,
          UpdateType: 'TransformPaths',
          UpstreamPaths: [{ Name: 'endpoint', Path: 'data.otlpEndpoint', Resource: { ResourceType: 'v1/ConfigMap', ResourceName: 'platform/telemetry' } }],
          DownstreamPaths: [
            {
              Path: 'data.OTEL_EXPORTER_OTLP_ENDPOINT',
              DataType: 'string',
              Evaluator: 'template',
              Expression: '{{ .Params.endpoint }}',
              Resource: { ResourceType: 'v1/ConfigMap', ResourceName: '/api-config' },
            },
          ],
        } as never,
      });
      await patchOrThrow(`/api/space/${spaceId}/unit/${configId}`, {}, { resolve: "Link:UpdateType = 'TransformPaths'" });
    }
    // The platform moves its collector since: what a Transform paths draft carries.
    await api.uploadUnitData({ spaceId: factsId, unitId: factsUnitId, body: telemetry('https://otel.acme.internal:4317') });

    const lastSlug = `${label}-2026-10-01`;
    await api.createChangeOrder({
      spaceId: baseSpaceId,
      changeOrder: {
        Slug: lastSlug,
        Description: '1.0.0',
        ChangeWorkflowID: workflowId,
        InScopeSpaceIDs: LAST_SCOPE.map((name) => variants[name].spaceId),
      } as never,
    });

    // Waiting in the base since: a closed ChangeSet, then one change after it.
    const releaseSlug = `${label}-release`;
    const changeSet = await api.createChangeSet({ spaceId: baseSpaceId, changeSet: { Slug: releaseSlug, Description: 'Release 1.1.0' } });
    const changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;
    for (const unitId of Object.values(baseUnits)) {
      await patchOrThrow(`/api/space/${baseSpaceId}/unit/${unitId}`, { ChangeSetID: changeSetId }, { change_set_id: changeSetId });
    }
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnits.api, body: deployment('1.1.0', '512Mi'), changeSetId });
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnits.config, body: configMap('true'), changeSetId });
    // Detaching every Unit closes the ChangeSet and lands its end Tag.
    for (const unitId of Object.values(baseUnits)) {
      await patchOrThrow(`/api/space/${baseSpaceId}/unit/${unitId}`, { ChangeSetID: null });
    }
    await api.uploadUnitData({ spaceId: baseSpaceId, unitId: baseUnits.api, body: deployment('1.1.0', '768Mi') });

    // Last: a ChangeSet cannot be opened in a Component that requires a workflow.
    await patchOrThrow(`/api/component/${componentId}`, { AllowedChangeWorkflowIDs: [workflowId, hotfixId], ChangeWorkflowRequired: true });

    return { label, componentId, baseSlug, baseSpaceId, lastSlug, releaseSlug, workflowSlug, hotfixSlug, variants, spaceIds, imageInvocation, factsSlug };
  } catch (error) {
    await teardownDraft(seed);
    throw error;
  }
}

/** Never throws: it runs after a failure, and must not replace it. It says what it left behind. */
async function teardownDraft(seed: Partial<DraftSeed> | undefined): Promise<void> {
  if (seed === undefined) return;
  const failures: string[] = [];
  for (const spaceId of [...(seed.spaceIds ?? [])].reverse()) {
    const response = await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true', detach: 'true' } }).catch(() => undefined);
    if (!response?.ok()) failures.push(`Space ${spaceId}: ${response?.status() ?? 'no response'}`);
  }
  if (seed.componentId !== undefined) {
    const response = await hubApi.delete(`/api/component/${seed.componentId}`).catch(() => undefined);
    if (!response?.ok()) failures.push(`Component ${seed.componentId}: ${response?.status() ?? 'no response'}`);
  }
  if (failures.length > 0) console.warn(`[change-order-draft] teardown left behind:\n  ${failures.join('\n  ')}`);
}

/** A part of the summary card: the facts row, the dry run's outcome under it, What and How much. */
const cardPart = (page: Page, part: 'facts' | 'outcome' | 'change') => page.getByTestId(`draft-${part}`);
const sideColumn = (page: Page) => page.getByRole('complementary', { name: draftCopy.page.side.label });
const createButton = (page: Page) => sideColumn(page).getByTestId('draft-create');
const nameField = (page: Page) => page.getByRole('textbox', { name: draftCopy.page.nameLabel, exact: true });
const descriptionField = (page: Page) => page.getByRole('textbox', { name: draftCopy.page.descriptionLabel, exact: true });
const pathRegion = (page: Page) => page.getByRole('region', { name: draftCopy.path.heading });

const searchParam = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);

/** `YYYY-MM-DD` today, in the browser's own time zone, as the draft dates its name. */
const browserToday = (page: Page) =>
  page.evaluate(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });

/** A POST that creates (or dry-runs a create of) a ChangeOrder. */
const isChangeOrderCreate = (request: Request) =>
  request.method() === 'POST' && /^\/api\/space\/[^/]+\/change_order$/.test(new URL(request.url()).pathname);

test.describe('ChangeOrder draft', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  let fx: DraftSeed;
  let fixturePage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    fixturePage = await (await newAuthorizedContext(browser)).newPage();
    fx = await seedDraft(fixturePage);
  });

  test.afterAll(async () => {
    await teardownDraft(fx);
    await fixturePage?.context().close();
  });

  const draftPath = (params: Record<string, string> = {}) => `/change-orders/new?${new URLSearchParams({ space: fx.baseSlug, ...params })}`;

  /** The draft has read its context and drawn its decisions. */
  async function draftDrawn(page: Page) {
    await expect(cardPart(page, 'facts')).toBeVisible({ timeout: 30_000 });
    await expect(nameField(page)).toBeVisible();
  }

  async function openDraft(page: Page, params: Record<string, string> = {}) {
    await page.goto(draftPath(params));
    await draftDrawn(page);
  }

  /** What "re-aimed from the last ChangeOrder" means on screen. */
  async function expectPrefilledFromLast(page: Page) {
    const today = await browserToday(page);
    await expect(page.getByTestId('draft-template')).toContainText(fx.lastSlug);
    // Name: the last one's, dated today.
    await expect(nameField(page)).toHaveValue(fx.lastSlug.replace('2026-10-01', today));
    // Workflow: the one the policy allows, and requires, as last time.
    const facts = cardPart(page, 'facts');
    const workflow = facts.getByTestId('draft-workflow');
    await expect(workflow).toHaveAccessibleName(`${draftCopy.page.facts.workflow}: ${fx.workflowSlug}`);
    await expect(workflow).not.toHaveAttribute('data-changed');
    await expect(facts.getByTestId('draft-workflow-required')).toBeVisible();
    // Scope: as last time — three of the four variants, so not "all".
    const scope = facts.getByTestId('draft-scope');
    await expect(scope).toHaveAccessibleName(`${draftCopy.page.scope.title}: ${draftCopy.page.facts.variants(LAST_SCOPE.length)}`);
    await expect(scope).not.toHaveAttribute('data-changed');
    // A draft has not been opened: its dates are empty, and not something to fill in.
    await expect(facts.getByRole('definition').filter({ hasText: /^—$/ })).toHaveCount(2);
  }

  test('"New ChangeOrder" on the console opens the draft, re-aimed from the last ChangeOrder', async ({ page }) => {
    await page.goto('/change-orders');
    const newButton = page.getByTestId('new-change-order');
    await expect(newButton).toBeVisible({ timeout: 30_000 });
    // With several base Spaces it asks which; with one it is a link straight to the draft.
    await expect(newButton).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await newButton.click();
    const picker = page.getByRole('dialog', { name: draftCopy.page.newChangeOrder });
    await expect(picker.or(cardPart(page, 'facts'))).toBeVisible();
    if (await picker.isVisible()) await picker.locator(`[data-base="${fx.baseSlug}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/change-orders/new\\?space=${fx.baseSlug}$`));
    await draftDrawn(page);
    await expectPrefilledFromLast(page);
  });

  test('"Re-aim" on a console row opens the draft from that ChangeOrder', async ({ page }) => {
    await page.goto('/change-orders');
    const rowMenu = page.getByRole('button', { name: `ChangeOrder actions for ${fx.lastSlug}`, exact: true });
    await expect(rowMenu).toBeVisible({ timeout: 30_000 });
    await rowMenu.click();
    await page.getByTestId('change-order-row-reaim').click();

    await expect(page).toHaveURL(/\/change-orders\/new\?/);
    expect(searchParam(page, 'space')).toBe(fx.baseSlug);
    expect(searchParam(page, 'from')).toBe(fx.lastSlug);
    await draftDrawn(page);
    await expectPrefilledFromLast(page);
  });

  /** No popover is open, or closing: nothing invisible is left over the page. */
  const popoversGone = (page: Page) => expect(page.locator('.MuiPopover-root')).toHaveCount(0);

  test("the facts row's slots open their popovers, each choice reaches the URL, and the way back undoes it", async ({ page }) => {
    await openDraft(page);
    const facts = cardPart(page, 'facts');
    const { facts: factsCopy, scope: scopeCopy } = draftCopy.page;
    // The update type is not a fact: it is under the change's kind.
    await expect(facts.getByTestId('draft-update-type-bar')).toHaveCount(0);

    // Workflow: last time's is marked; Escape closes onto the slot; picking the other one changes
    // it, and the way back returns to last time's.
    const workflow = facts.getByTestId('draft-workflow');
    await workflow.click();
    const workflowMenu = page.getByRole('menu', { name: draftCopy.page.workflow.title(fx.label) });
    const line = workflowMenu.getByRole('menuitemradio', { name: new RegExp(`^${fx.workflowSlug}`) });
    await expect(line).toHaveAttribute('aria-checked', 'true');
    await expect(line.getByRole('img', { name: factsCopy.lastTime })).toBeVisible();
    await page.keyboard.press('Escape');
    await popoversGone(page);
    await expect(workflow).toBeFocused();
    await workflow.click();
    await workflowMenu.getByRole('menuitemradio', { name: new RegExp(`^${fx.hotfixSlug}`) }).click();
    await expect.poll(() => searchParam(page, 'wf')).toBe(fx.hotfixSlug);
    await popoversGone(page);
    await expect(workflow).toBeFocused();
    await expect(workflow).toHaveAccessibleName(`${factsCopy.workflow}: ${fx.hotfixSlug}, ${factsCopy.was(fx.workflowSlug)}`);
    await expect(workflow).toHaveAttribute('data-changed', '');

    // Re-aiming from the template the draft already re-aims changes nothing.
    await page.getByTestId('draft-template').click();
    await page.getByRole('menu', { name: draftCopy.page.template.reAim }).getByRole('menuitemradio', { name: new RegExp(`^${fx.lastSlug}`) }).click();
    await popoversGone(page);
    expect(searchParam(page, 'wf')).toBe(fx.hotfixSlug);

    await facts.getByRole('button', { name: factsCopy.backTo(fx.workflowSlug), exact: true }).click();
    await expect.poll(() => searchParam(page, 'wf')).toBeNull();
    await expect(workflow).toHaveAccessibleName(`${factsCopy.workflow}: ${fx.workflowSlug}`);
    await expect(workflow).toBeFocused();

    // Scope: unticking dev leaves it out, in the URL; the slot counts what is left, says what it
    // was, and the way back is last time's scope.
    const scope = facts.getByTestId('draft-scope');
    await scope.click();
    await page.getByRole('menu', { name: scopeCopy.title }).locator(`[data-variant="${fx.variants.dev.slug}"]`).click();
    await expect.poll(() => searchParam(page, 'out')?.split(',') ?? []).toContain(fx.variants.dev.slug);
    await page.keyboard.press('Escape');
    await popoversGone(page);
    await expect(scope).toBeFocused();
    const remaining = LAST_SCOPE.length - 1;
    await expect(scope).toHaveAccessibleName(`${scopeCopy.title}: ${factsCopy.variants(remaining)}, ${factsCopy.was(factsCopy.variants(LAST_SCOPE.length))}`);
    await expect(scope).toHaveAttribute('data-changed', '');
    await facts.getByRole('button', { name: factsCopy.backToScope(LAST_SCOPE.length), exact: true }).click();
    await expect.poll(() => searchParam(page, 'out')).toBeNull();
    await expect(scope).toHaveAccessibleName(`${scopeCopy.title}: ${factsCopy.variants(LAST_SCOPE.length)}`);
    await expect(scope).toBeFocused();
  });

  test('the update type offers only the types whose Links reach the scope, and says why the other cannot be chosen', async ({ page }) => {
    const { updateType: updateCopy, facts: factsCopy } = draftCopy.page;
    const bar = () => page.getByTestId('draft-update-type-bar');
    const option = (type: string) => bar().getByRole('radio', { name: new RegExp(`^${type}`) });

    // Only clones so far: UpgradeUnit Links reach every variant, no MergeUnits Link reaches any.
    await openDraft(page);
    await expect(bar()).toHaveAccessibleName(`${updateCopy.title}: UpgradeUnit`);
    await expect(option('UpgradeUnit')).toHaveAttribute('aria-checked', 'true');
    // Last time's type is marked on its option.
    await expect(option('UpgradeUnit')).toHaveAccessibleName(new RegExp(factsCopy.lastTime));
    await expect(option('MergeUnits')).toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await option('MergeUnits').hover();
    await expect(page.getByRole('tooltip')).toHaveText(draftCopy.problems.updateTypeNoLink('MergeUnits'));
    // One tab stop; the arrows skip the type that cannot be chosen, and a click does nothing.
    await option('UpgradeUnit').focus();
    await page.keyboard.press('ArrowRight');
    await expect(option('UpgradeUnit')).toBeFocused();
    await option('MergeUnits').click({ force: true });
    expect(searchParam(page, 'update')).toBeNull();

    // A MergeUnits Link from the base into prod-eu: MergeUnits reaches the scope.
    const api = new ApiHelper(page);
    const unitOf = async (spaceId: string) =>
      (await api.listUnits({ where: `SpaceID = '${spaceId}' AND Slug = 'api-config'`, select: 'UnitID,Slug' }))[0]?.Unit?.UnitID as string;
    const variantUnit = await unitOf(fx.variants['prod-eu'].spaceId);
    const baseUnit = await unitOf(fx.baseSpaceId);
    const link = await api.createLink({
      spaceId: fx.variants['prod-eu'].spaceId,
      link: {
        Slug: `${fx.label}-merge`,
        FromUnitID: variantUnit,
        ToUnitID: baseUnit,
        ToSpaceID: fx.baseSpaceId,
        UpdateType: 'MergeUnits',
      } as never,
    });
    try {
      await openDraft(page);
      await expect(option('MergeUnits')).not.toHaveAttribute('aria-disabled', { timeout: 30_000 });
      // The arrows choose it: it goes into the URL, and the bar says what last time had.
      await option('UpgradeUnit').focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => searchParam(page, 'update')).toBe('MergeUnits');
      await expect(option('MergeUnits')).toBeFocused();
      await expect(option('MergeUnits')).toHaveAttribute('aria-checked', 'true');
      await expect(bar()).toHaveAccessibleName(`${updateCopy.title}: MergeUnits, ${factsCopy.was('UpgradeUnit')}`);
      await expect(bar()).not.toHaveAttribute('aria-invalid');

      // Leaving prod-eu out leaves no MergeUnits Link in scope: the problem, said under the
      // change, describes the bar, and its fix takes the type that can be promoted.
      await page.getByTestId('draft-scope').click();
      await page.getByRole('menu', { name: draftCopy.page.scope.title }).locator(`[data-variant="${fx.variants['prod-eu'].slug}"]`).click();
      await page.keyboard.press('Escape');
      await popoversGone(page);
      const problem = cardPart(page, 'change').locator('[data-problem="update-type-no-link"]');
      await expect(problem).toContainText(draftCopy.problems.updateTypeNoLink('MergeUnits'), { timeout: 30_000 });
      await expect(bar()).toHaveAttribute('aria-invalid', 'true');
      await expect(bar()).toHaveAccessibleDescription(new RegExp(draftCopy.problems.updateTypeNoLink('MergeUnits')));
      await expect(createButton(page)).toBeDisabled();
      // The blocker beside Create takes the keyboard to the chosen option.
      const blocker = sideColumn(page).getByTestId('draft-blocker');
      await expect(blocker).toHaveText(draftCopy.page.blockers.same);
      await blocker.click();
      await expect(option('MergeUnits')).toBeFocused();
      await problem.getByRole('button', { name: draftCopy.fixes.useUpdateType('UpgradeUnit') }).click();
      await expect.poll(() => searchParam(page, 'update')).toBeNull();
      await expect(option('UpgradeUnit')).toHaveAttribute('aria-checked', 'true');
      await expect(option('MergeUnits')).toHaveAttribute('aria-disabled', 'true');
      await expect(problem).toHaveCount(0);
    } finally {
      await hubApi.delete(`/api/space/${fx.variants['prod-eu'].spaceId}/link/${link.LinkID}`).catch(() => undefined);
    }
  });

  test('a popover reopened while it is still closing never leaves an invisible one over the page', async ({ page }) => {
    await openDraft(page);
    const facts = cardPart(page, 'facts');
    const workflow = facts.getByTestId('draft-workflow');
    const menu = page.getByRole('menu', { name: draftCopy.page.workflow.title(fx.label) });
    const chosen = menu.getByRole('menuitemradio', { name: new RegExp(`^${fx.workflowSlug}`) });
    // Escape, reopen at once (while the last one is still closing), and pick: twenty times over.
    for (let cycle = 0; cycle < 20; cycle += 1) {
      await workflow.click();
      await expect(chosen).toBeFocused();
      await page.keyboard.press('Escape');
      await workflow.click();
      await chosen.click();
      await expect(page.locator('.MuiPopover-root')).toHaveCount(0, { timeout: 3_000 });
    }
    // Nothing takes the page's clicks: the scope opens.
    await facts.getByTestId('draft-scope').click();
    await expect(page.getByRole('menu', { name: draftCopy.page.scope.title })).toBeVisible();
  });

  test('a name that is not the default has the way back to it beside it', async ({ page }) => {
    await openDraft(page);
    const original = await nameField(page).inputValue();
    const back = page.getByRole('button', { name: draftCopy.page.facts.backTo(original), exact: true });
    await expect(back).toHaveCount(0);

    await nameField(page).fill(`${original}-x`);
    await nameField(page).blur();
    await expect.poll(() => searchParam(page, 'name')).toBe(`${original}-x`);
    await back.click();
    await expect.poll(() => searchParam(page, 'name')).toBeNull();
    await expect(nameField(page)).toHaveValue(original);
    await expect(nameField(page)).toBeFocused();
    await expect(back).toHaveCount(0);
  });

  test("each blocker takes the keyboard to what fixes it, and the fact it is about is described by it", async ({ page }) => {
    // A workflow the policy does not allow: the Workflow fact, invalid, described by the problem.
    await openDraft(page, { wf: 'nope' });
    const blocker = sideColumn(page).getByTestId('draft-blocker');
    await expect(blocker).toHaveText(draftCopy.page.blockers.path, { timeout: 30_000 });
    await blocker.click();
    const workflow = cardPart(page, 'facts').getByTestId('draft-workflow');
    await expect(workflow).toBeFocused();
    await expect(workflow).toHaveAttribute('aria-invalid', 'true');
    await expect(workflow).toHaveAccessibleDescription(new RegExp(draftCopy.problems.workflowNotAllowed('nope')));

    // An end that names nothing: no end chip is drawn, so the keyboard goes to the problem's fix.
    await openDraft(page, { end: 'nope' });
    await expect(blocker).toHaveText(draftCopy.page.blockers.howMuch, { timeout: 30_000 });
    await blocker.click();
    await expect(cardPart(page, 'change').getByRole('button', { name: draftCopy.fixes.endAtLatest, exact: true })).toBeFocused();
  });

  test('a name typed and Create clicked at once sends the typed name', async ({ page }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route(
      (url) => /^\/api\/space\/[^/]+\/change_order$/.test(url.pathname),
      async (route) => {
        const request = route.request();
        if (request.method() !== 'POST' || new URL(request.url()).searchParams.get('dry_run') === 'true') return route.fallback();
        const body = request.postDataJSON() as Record<string, unknown>;
        sent.push(body);
        // Answered here: nothing is created.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...body, ChangeOrderID: '00000000-0000-4000-8000-0000000000c0', SpaceID: fx.baseSpaceId }),
        });
      },
    );
    await openDraft(page);
    await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });

    const typed = `${fx.label}-typed`;
    await nameField(page).fill(typed);
    await createButton(page).click();

    await expect.poll(() => sent.length, { timeout: 30_000 }).toBe(1);
    expect(sent[0].Slug).toBe(typed);
    expect(new Set(sent[0].InScopeSpaceIDs as string[])).toEqual(new Set(LAST_SCOPE.map((name) => fx.variants[name].spaceId)));
    await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${typed}$`));
  });

  test('editing the description, then "End at <ChangeSet>", keeps both in the URL', async ({ page }) => {
    await openDraft(page);
    const endAt = page.getByTestId('draft-end-suggestion');
    await expect(endAt).toHaveText(`${draftCopy.page.ribbon.endAt} ${fx.releaseSlug}`, { timeout: 30_000 });
    // The page has suggested its description (the image tag the change moves to) before the
    // reader edits it. Losing the edit depends on that: the field then re-seeds from the suggestion.
    await expect(descriptionField(page)).toHaveValue('1.1.0', { timeout: 30_000 });

    const urlSays = () => ({ desc: searchParam(page, 'desc'), end: searchParam(page, 'end') });
    // Both ways round, each a separate chance for the two writes to race.
    for (const [description, end, chip] of [
      ['Typed by hand', fx.releaseSlug, `${draftCopy.page.ribbon.endAt} ${fx.releaseSlug}`],
      ['Typed again', null, draftCopy.page.ribbon.endAtLatest],
    ] as const) {
      await expect(endAt).toHaveText(chip);
      await descriptionField(page).fill(description);
      await endAt.click();

      await expect.poll(urlSays, { timeout: 10_000 }).toEqual({ desc: description, end });
      // Settled: Create is enabled only once no field holds text the URL has not drawn and the
      // create dry run has passed for exactly this draft. Both must still be there then.
      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      expect(urlSays()).toEqual({ desc: description, end });
      await expect(descriptionField(page)).toHaveValue(description);
    }
  });

  test('"Leave out" on an outlier names it in a toast, and Undo puts it back', async ({ page }) => {
    await openDraft(page);
    const where = cardPart(page, 'outcome');
    await expect(where.getByTestId('draft-same-figure')).toHaveText(`2${draftCopy.page.facts.ofSame(3)}`, { timeout: 45_000 });
    const chip = where.locator('[data-outlier="prod-us"]');
    await expect(chip).toContainText('1Gi');

    await chip.click();
    await page.getByRole('button', { name: draftCopy.page.outlier.leaveOut, exact: true }).click();

    const toast = page.getByTestId('draft-toast');
    await expect(toast).toContainText(draftCopy.page.outlier.leftOut('prod-us'));
    const undo = toast.getByRole('button', { name: draftCopy.page.outlier.undo });
    await expect(undo).toBeFocused();
    await expect.poll(() => searchParam(page, 'out')?.split(',') ?? []).toContain(fx.variants['prod-us'].slug);
    await expect(page.getByTestId('draft-scope')).toHaveAccessibleName(
      `${draftCopy.page.scope.title}: ${draftCopy.page.facts.variants(2)}, ${draftCopy.page.facts.was(draftCopy.page.facts.variants(3))}`,
    );

    await undo.click();
    await expect.poll(() => searchParam(page, 'out')).toBeNull();
    // Undo has gone with the toast: the keyboard is on the fact it changed back.
    await expect(page.getByTestId('draft-scope')).toBeFocused();
    await expect(page.getByTestId('draft-scope')).toHaveAccessibleName(`${draftCopy.page.scope.title}: ${draftCopy.page.facts.variants(3)}`);
    await expect(where.locator('[data-outlier="prod-us"]')).toBeVisible({ timeout: 45_000 });
  });

  test('an empty scope cannot be established, blocks Create, and asks the server nothing', async ({ page }) => {
    // Every create (and create dry run) the page sends, by the scope it asks about.
    const scopes: string[][] = [];
    page.on('request', (request) => {
      if (isChangeOrderCreate(request)) scopes.push(((request.postDataJSON() ?? {}) as { InScopeSpaceIDs?: string[] }).InScopeSpaceIDs ?? []);
    });
    await openDraft(page, { out: Object.values(fx.variants).map((variant) => variant.slug).join(',') });

    // Nothing to say, quietly, and the problem under the line says why; the live region says so too.
    await expect(cardPart(page, 'outcome')).toHaveText(draftCopy.page.facts.none);
    await expect(page.locator('[data-testid="draft-problems"][data-place="outcome"] [data-problem="scope-empty"]')).toHaveText(draftCopy.problems.scopeEmpty);
    // No variant in scope is reached by any Link: the scope's problem says so, once; the update type adds none.
    await expect(page.locator('[data-problem="update-type-no-link"]')).toHaveCount(0);
    await expect(sideColumn(page).getByRole('status')).toContainText(draftCopy.page.side.sentenceFailed, { timeout: 30_000 });
    const blocker = sideColumn(page).getByTestId('draft-blocker');
    await expect(blocker).toHaveText(draftCopy.page.blockers.where);
    await expect(createButton(page)).toBeDisabled();

    // The blocker takes the keyboard to what fixes it.
    await blocker.click();
    const scopeControl = page.getByTestId('draft-scope');
    await expect(scopeControl).toBeFocused();
    await expect(scopeControl).toHaveAttribute('aria-invalid', 'true');
    await expect(scopeControl).toHaveAccessibleDescription(draftCopy.problems.scopeEmpty);

    // The way back out: putting dev in scope asks the server about dev. That request is the
    // control that the page is asking at all; the first request it sent must be that one, and
    // none may name an empty scope.
    await scopeControl.click();
    const dryRun = page.waitForRequest(isChangeOrderCreate, { timeout: 30_000 });
    await page
      .getByRole('menu', { name: draftCopy.page.scope.title })
      .locator(`[data-variant="${fx.variants.dev.slug}"]`)
      .click();
    await dryRun;
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.filter((scope) => scope.length === 0)).toEqual([]);
    expect(scopes[0]).toEqual([fx.variants.dev.spaceId]);
  });

  test('an end that names nothing says so, and "End at latest" fixes it', async ({ page }) => {
    await openDraft(page, { end: 'nope' });
    const problem = cardPart(page, 'change').locator('[data-problem="end-not-found"]');
    await expect(problem).toContainText(draftCopy.problems.endNotFound('nope'));

    await problem.getByRole('button', { name: draftCopy.fixes.endAtLatest }).click();
    await expect.poll(() => searchParam(page, 'end')).toBeNull();
    await expect(page.locator('[data-problem="end-not-found"]')).toHaveCount(0);
    await expect(page.getByTestId('draft-change-card').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('draft-end-suggestion')).toHaveText(`${draftCopy.page.ribbon.endAt} ${fx.releaseSlug}`, { timeout: 30_000 });
  });

  test('a template that names nothing says so, and one click starts from the last ChangeOrder', async ({ page }) => {
    await openDraft(page, { from: 'nope' });
    const problem = page.locator('[data-problem="template-not-found"]');
    await expect(problem).toContainText(draftCopy.problems.templateNotFound('nope'));

    await problem.getByRole('button', { name: draftCopy.fixes.lastChangeOrder }).click();
    await expect.poll(() => searchParam(page, 'from')).toBeNull();
    await expect(problem).toHaveCount(0);
    await expectPrefilledFromLast(page);
  });

  test('a failed dry run cannot be established, and Retry recovers it', async ({ page }) => {
    let failing = true;
    let failed = 0;
    await page.route(
      (url) => url.pathname === '/api/unit' && url.searchParams.get('dry_run') === 'true' && url.searchParams.get('upgrade') === 'true',
      async (route) => {
        if (route.request().method() !== 'PATCH' || !failing) return route.fallback();
        failed += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'injected failure' }) });
      },
    );
    await openDraft(page);

    const where = cardPart(page, 'outcome');
    await expect(where).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
    await expect(where.getByText(draftCopy.couldNotEstablish, { exact: true })).toBeVisible({ timeout: 45_000 });
    expect(failed).toBeGreaterThan(0);
    await expect(where.getByTestId('draft-same-figure')).toHaveCount(0);

    failing = false;
    await where.getByRole('button', { name: /^Retry/ }).click();
    await expect(where.getByTestId('draft-same-figure')).toHaveText(`2${draftCopy.page.facts.ofSame(3)}`, { timeout: 45_000 });
    await expect(where.getByText(draftCopy.couldNotEstablish, { exact: true })).toHaveCount(0);
  });

  test('the rail selects a stage, and the URL says stage=source / stage=complete', async ({ page }) => {
    await openDraft(page);
    const rail = pathRegion(page);
    await expect(rail).toBeVisible({ timeout: 30_000 });

    const source = rail.getByRole('button', { name: /^source\b/ });
    await source.click();
    await expect.poll(() => searchParam(page, 'stage')).toBe('source');
    await expect(source).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('draft-source-card')).toBeVisible();

    const complete = rail.getByTestId('stage-rail-complete');
    await complete.click();
    await expect.poll(() => searchParam(page, 'stage')).toBe('complete');
    await expect(complete).toHaveAttribute('aria-pressed', 'true');
    await expect(source).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('draft-complete-card')).toBeVisible();

    const prod = rail.getByRole('button', { name: /^prod\b/ });
    await prod.click();
    await expect.poll(() => searchParam(page, 'stage')).toBe('prod');
    await expect(prod).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: draftCopy.path.stageRegion('prod') })).toBeVisible();

    // A reload opens the same stage: the URL is the draft.
    await page.reload();
    await draftDrawn(page);
    await expect(pathRegion(page).getByRole('button', { name: /^prod\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).not.toContain('__change_order');
  });

  test('says "resource", never "Unit", and does not scroll sideways at 1280×800', async ({ page }) => {
    await openDraft(page);
    // Settled: the dry run, the ribbon, the change at the source and the stage card have all answered.
    await expect(cardPart(page, 'outcome').getByTestId('draft-same-figure')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('draft-change-card').first()).toBeVisible();
    await expect(page.getByTestId('draft-hero-loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('draft-writes-loading')).toHaveCount(0, { timeout: 30_000 });

    const text = await page.getByTestId('change-order-draft').innerText();
    expect(text.match(/\bunits?\b/gi) ?? []).toEqual([]);

    const overflow = await page.getByTestId('change-order-draft').evaluate((root) => {
      const wide: string[] = [];
      const check = (element: Element, name: string) => {
        if (element.scrollWidth > element.clientWidth + 1) {
          const style = getComputedStyle(element);
          if (element === document.documentElement || element === document.body || ['auto', 'scroll'].includes(style.overflowX)) {
            wide.push(`${name}: ${element.scrollWidth} > ${element.clientWidth}`);
          }
        }
      };
      for (let element: Element | null = root; element !== null; element = element.parentElement) {
        check(element, element === root ? 'draft' : element.tagName.toLowerCase() + (element.id ? `#${element.id}` : ''));
      }
      return { wide, windowScrolls: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(overflow).toEqual({ wide: [], windowScrolls: false });
  });

  test('Create creates the ChangeOrder and opens it', async ({ page }) => {
    await openDraft(page);
    const slug = `${fx.label}-created`;
    await nameField(page).fill(slug);
    await nameField(page).blur();
    await expect.poll(() => searchParam(page, 'name')).toBe(slug);
    await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });

    const findCreated = async () => {
      const listed = await hubApi.get(`/api/space/${fx.baseSpaceId}/change_order`, { params: { where: `Slug = '${slug}'` } });
      expect(listed.ok()).toBe(true);
      const [entry] = (await listed.json()) as { ChangeOrder: { ChangeOrderID: string; InScopeSpaceIDs: string[] } }[];
      return entry?.ChangeOrder;
    };
    let deleted = false;
    try {
      await createButton(page).click();

      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      await expect(page.getByRole('heading', { level: 1, name: slug })).toBeVisible({ timeout: 30_000 });

      const created = await findCreated();
      expect(new Set(created?.InScopeSpaceIDs)).toEqual(new Set(LAST_SCOPE.map((name) => fx.variants[name].spaceId)));
      const response = await hubApi.delete(`/api/space/${fx.baseSpaceId}/change_order/${created?.ChangeOrderID}`, { params: { detach: 'true' } });
      expect(response.ok()).toBe(true);
      deleted = true;
    } finally {
      // Whatever failed above, a ChangeOrder this test made does not outlive it. Never throws:
      // the failure above is the one to report.
      if (!deleted) {
        const created = await findCreated().catch(() => undefined);
        if (created !== undefined) {
          const response = await hubApi
            .delete(`/api/space/${fx.baseSpaceId}/change_order/${created.ChangeOrderID}`, { params: { detach: 'true' } })
            .catch(() => undefined);
          if (!response?.ok()) console.warn(`[change-order-draft] could not delete ChangeOrder ${slug}: ${response?.status() ?? 'no response'}`);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // The kinds of change
  // ---------------------------------------------------------------------------

  const kindTrack = (page: Page) => page.getByTestId('draft-kind-track');
  /** The image function's tag: the input in its Run row. */
  const tagInput = (page: Page) => page.getByTestId('draft-invoke-tag');
  const kindSegment = (page: Page, name: string) => kindTrack(page).getByRole('radio', { name: new RegExp(`^${name}`) });

  interface CreatedInvoke {
    ChangeOrderID: string;
    UpdateType: string;
    InvocationID: string;
    Parameters: Record<string, unknown>;
    WhereUnit?: string;
  }
  const findChangeOrder = async (slug: string): Promise<CreatedInvoke | undefined> => {
    const listed = await hubApi.get(`/api/space/${fx.baseSpaceId}/change_order`, { params: { where: `Slug = '${slug}'` } });
    expect(listed.ok()).toBe(true);
    return ((await listed.json()) as { ChangeOrder: CreatedInvoke }[])[0]?.ChangeOrder;
  };
  const findInvocations = async (slug: string): Promise<{ InvocationID: string }[]> => {
    const listed = await hubApi.get(`/api/space/${fx.baseSpaceId}/invocation`, { params: { where: `Slug = '${slug}'` } });
    expect(listed.ok()).toBe(true);
    return ((await listed.json()) as { Invocation: { InvocationID: string } }[]).map((entry) => entry.Invocation);
  };
  /** Deletes what a Create test made: the ChangeOrder, then the Invocation it ran. Never throws. */
  const cleanUpCreate = async (slug: string) => {
    const created = await findChangeOrder(slug).catch(() => undefined);
    if (created !== undefined) {
      const response = await hubApi.delete(`/api/space/${fx.baseSpaceId}/change_order/${created.ChangeOrderID}`, { params: { detach: 'true' } }).catch(() => undefined);
      if (!response?.ok()) console.warn(`[change-order-draft] could not delete ChangeOrder ${slug}: ${response?.status() ?? 'no response'}`);
    }
    for (const invocation of await findInvocations(slug).catch(() => [])) {
      const response = await hubApi.delete(`/api/space/${fx.baseSpaceId}/invocation/${invocation.InvocationID}`).catch(() => undefined);
      if (!response?.ok()) console.warn(`[change-order-draft] could not delete Invocation ${slug}: ${response?.status() ?? 'no response'}`);
    }
  };
  /** Opens an Invoke draft under a name of its own, governed by the dev → prod workflow. */
  async function openInvokeDraft(page: Page, slug: string, params: Record<string, string>) {
    await openDraft(page, { wf: fx.workflowSlug, name: slug, ...params });
    await expect(page.getByTestId('draft-invoke-function')).toBeVisible({ timeout: 30_000 });
  }
  /** The POSTs that save an Invocation for real (not its dry run), as the page sends them. */
  const invocationSaves = (page: Page) => {
    const saves: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && /^\/api\/space\/[^/]+\/invocation$/.test(url.pathname) && url.searchParams.get('dry_run') !== 'true') saves.push(request.url());
    });
    return saves;
  };
  /** The real (not dry-run) creates of a ChangeOrder the page sends. */
  const changeOrderCreates = (page: Page) => {
    const creates: string[] = [];
    page.on('request', (request) => {
      if (isChangeOrderCreate(request) && new URL(request.url()).searchParams.get('dry_run') !== 'true') creates.push(request.url());
    });
    return creates;
  };
  /** Saves an Invocation in the base through the API, as another Create would have. */
  const saveInvocation = async (body: Record<string, unknown>): Promise<string> => {
    const response = await hubApi.post(`/api/space/${fx.baseSpaceId}/invocation`, { data: { ToolchainType: 'Kubernetes/YAML', ...body } });
    if (!response.ok()) throw new Error(`invocation: ${response.status()} ${await response.text()}`);
    return ((await response.json()) as { InvocationID: string }).InvocationID;
  };
  /** The Invocation an inline set-label call saves, as the draft builds it. */
  const SET_LABEL_INVOCATION = {
    FunctionInvocations: [
      {
        FunctionName: 'set-label',
        Arguments: [
          { ParameterName: 'label-key', Value: '{{ .Params.label_key }}', Evaluator: 'template' },
          { ParameterName: 'label-value', Value: '{{ .Params.label_value }}', Evaluator: 'template' },
        ],
      },
    ],
    Parameters: [
      { ParameterName: 'label_key', DataType: 'string', Required: true },
      { ParameterName: 'label_value', DataType: 'string', Required: true },
    ],
  };
  const deleteInvocationById = async (invocationId: string) => {
    const response = await hubApi.delete(`/api/space/${fx.baseSpaceId}/invocation/${invocationId}`).catch(() => undefined);
    if (!response?.ok() && response?.status() !== 404) console.warn(`[change-order-draft] could not delete Invocation ${invocationId}: ${response?.status() ?? 'no response'}`);
  };
  const createFailed = (page: Page) => sideColumn(page).getByTestId('draft-create-failed');

  test('the What track offers Base changes, Invoke and Transform paths: no Image tag, and no Derived rule', async ({ page }) => {
    await openDraft(page);
    await expect(kindTrack(page).getByRole('radio')).toHaveCount(3);
    await expect(kindSegment(page, draftCopy.kinds.baseChanges)).toHaveAttribute('aria-checked', 'true');
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toBeVisible();
    await expect(kindTrack(page).getByRole('radio', { name: /^Image tag/ })).toHaveCount(0);
    // The scope holds variants that read the shared source: Transform paths can be chosen.
    await expect(kindSegment(page, draftCopy.kinds.transformPaths)).not.toHaveAttribute('aria-disabled');
    await expect(page.getByText(/Derived rule|Value everywhere/i)).toHaveCount(0);
    // Base changes keeps its update type and its ribbon; re-aiming a Base changes ChangeOrder, it is last time's kind.
    await expect(page.getByTestId('draft-update-type-bar')).toBeVisible();
    await expect(page.getByTestId('draft-invoke-rows')).toHaveCount(0);
    await expect(page.getByRole('button', { name: draftCopy.kinds.backTo(draftCopy.kinds.baseChanges) })).toHaveCount(0);
  });

  test('the track is one tab stop: the arrows, Home and End choose a kind and take the keyboard with them', async ({ page }) => {
    await openDraft(page);
    const base = kindSegment(page, draftCopy.kinds.baseChanges);
    await base.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => searchParam(page, 'kind')).toBe('invoke');
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toBeFocused();
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect.poll(() => searchParam(page, 'kind')).toBe('transform');
    await expect(kindSegment(page, draftCopy.kinds.transformPaths)).toBeFocused();
    await expect(kindSegment(page, draftCopy.kinds.transformPaths)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => searchParam(page, 'kind')).toBe('invoke');
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toBeFocused();
    await page.keyboard.press('Home');
    await expect.poll(() => searchParam(page, 'kind')).toBe('base');
    await expect(base).toBeFocused();
    // The unchosen segments are not tab stops.
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toHaveAttribute('tabindex', '-1');
  });

  test('switching kind sets each kind’s fields aside and back again; the way back returns to the re-aimed ChangeOrder’s kind', async ({ page }) => {
    await openDraft(page, { from: fx.lastSlug, kind: 'invoke', fn: 'set-label', 'p.label-key': 'team', tag: '1.4.0', end: fx.releaseSlug, wf: fx.workflowSlug });
    await expect(page.getByTestId('draft-invoke-arg-label-key')).toHaveValue('team', { timeout: 30_000 });
    await expect(page.getByTestId('draft-update-type-bar')).toHaveCount(0);
    // Re-aiming a Base changes ChangeOrder as Invoke: that is the change from last time.
    const backToBase = page.getByRole('button', { name: draftCopy.kinds.backTo(draftCopy.kinds.baseChanges) });
    await expect(backToBase).toBeVisible();

    await kindSegment(page, draftCopy.kinds.transformPaths).click();
    await expect.poll(() => searchParam(page, 'kind')).toBe('transform');
    // The template is the kind's own now; what was typed for the other kinds stays in the URL.
    expect(searchParam(page, 'from')).toBeNull();
    expect(searchParam(page, 'fn')).toBe('set-label');
    expect(searchParam(page, 'p.label-key')).toBe('team');
    expect(searchParam(page, 'tag')).toBe('1.4.0');
    expect(searchParam(page, 'end')).toBe(fx.releaseSlug);
    expect(searchParam(page, 'wf')).toBe(fx.workflowSlug);
    await expect(kindSegment(page, draftCopy.kinds.transformPaths)).toHaveAttribute('aria-checked', 'true');

    await kindSegment(page, draftCopy.kinds.invoke).click();
    await expect(page.getByTestId('draft-invoke-arg-label-key')).toHaveValue('team', { timeout: 30_000 });
    await kindSegment(page, draftCopy.kinds.baseChanges).click();
    await expect(page.getByTestId('draft-update-type-bar')).toBeVisible();
    expect(searchParam(page, 'end')).toBe(fx.releaseSlug);

    // The way back: open as another kind than the ChangeOrder named, and undo.
    await openDraft(page, { from: fx.lastSlug, kind: 'invoke' });
    await backToBase.click();
    await expect.poll(() => searchParam(page, 'kind')).toBeNull();
    expect(searchParam(page, 'from')).toBe(fx.lastSlug);
    await expect(kindSegment(page, draftCopy.kinds.baseChanges)).toHaveAttribute('aria-checked', 'true');
  });

  test('Invoke opens on the image function, the default; another function and back keeps the tag typed', async ({ page }) => {
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug });
    const slot = page.getByTestId('draft-invoke-function');
    await expect(slot).toHaveAccessibleName(`${draftCopy.invoke.function}: set-container-image`, { timeout: 30_000 });
    await tagInput(page).fill('1.4.0');
    await expect.poll(() => searchParam(page, 'tag')).toBe('1.4.0');

    // The image function is listed first among the functions, marked as the default.
    await slot.click();
    const dialog = page.getByRole('dialog', { name: draftCopy.invoke.function });
    const functions = dialog.getByRole('menu', { name: draftCopy.invoke.functions }).getByRole('menuitemradio');
    await expect(functions.first()).toHaveAttribute('data-function', 'set-container-image');
    await expect(functions.first()).toContainText(draftCopy.invoke.isDefault);
    await dialog.locator('[data-function="set-label"]').click();
    await expect.poll(() => searchParam(page, 'fn')).toBe('set-label');
    // Another function: its own arguments, and no tag.
    await expect(page.getByTestId('draft-invoke-arg-label-key')).toBeVisible({ timeout: 30_000 });
    await expect(tagInput(page)).toHaveCount(0);
    await expect(page.getByTestId('draft-invoke-repository')).toHaveCount(0);
    expect(searchParam(page, 'tag')).toBe('1.4.0');

    // The image function again: it is the default, so nothing of its own is written, and the tag is back.
    await slot.click();
    await dialog.locator('[data-function="set-container-image"]').click();
    await expect.poll(() => searchParam(page, 'fn')).toBeNull();
    await expect(tagInput(page)).toHaveValue('1.4.0', { timeout: 30_000 });
  });

  test('the old kind=value and kind=image open Invoke, which the URL then names kind=invoke', async ({ page }) => {
    await openDraft(page, { kind: 'value', wf: fx.workflowSlug });
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('draft-invoke-function')).toBeVisible({ timeout: 30_000 });
    await kindSegment(page, draftCopy.kinds.baseChanges).click();
    await expect(kindSegment(page, draftCopy.kinds.baseChanges)).toHaveAttribute('aria-checked', 'true');
    await kindSegment(page, draftCopy.kinds.invoke).click();
    await expect.poll(() => searchParam(page, 'kind')).toBe('invoke');

    // kind=image: Invoke, on the image function.
    await openDraft(page, { kind: 'image', wf: fx.workflowSlug, tag: '1.5.0' });
    await expect(kindSegment(page, draftCopy.kinds.invoke)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('draft-invoke-function')).toHaveAccessibleName(`${draftCopy.invoke.function}: set-container-image`, { timeout: 30_000 });
    await expect(tagInput(page)).toHaveValue('1.5.0');
  });

  test('Transform paths cannot be chosen where no variant in scope reads a shared source, and says why', async ({ page }) => {
    await openDraft(page, { out: LINKED.map((name) => fx.variants[name].slug).join(',') });
    const segment = kindSegment(page, draftCopy.kinds.transformPaths);
    await expect(segment).toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await expect(segment).toHaveAccessibleName(new RegExp(draftCopy.kinds.noSharedSource));
    await segment.click({ force: true });
    expect(searchParam(page, 'kind')).toBeNull();
    await expect(kindSegment(page, draftCopy.kinds.baseChanges)).toHaveAttribute('aria-checked', 'true');
  });

  test('Transform paths: the shared source, its change and the end preview what the Links carry; Create makes a TransformPaths ChangeOrder', async ({ page }) => {
    const slug = `${fx.label}-facts-carried`;
    const creates = changeOrderCreates(page);
    try {
      await openDraft(page, { kind: 'transform', wf: fx.workflowSlug, name: slug });
      await expect(kindSegment(page, draftCopy.kinds.transformPaths)).toHaveAttribute('aria-checked', 'true');
      // One type's Links reach the scope: it is said, not offered as a choice.
      await expect(page.getByTestId('draft-fan-out-type')).toHaveText('TransformPaths', { timeout: 30_000 });
      await expect(page.getByTestId('draft-update-type-bar')).toHaveCount(0);
      const source = page.getByTestId('draft-fan-out-source');
      await expect(source).toHaveAttribute('data-source', `${fx.factsSlug}/telemetry`);
      await expect(page.getByTestId('draft-fan-out-sources')).toContainText(/rev \d+ → rev \d+/);
      await expect(page.getByTestId('draft-fan-out-change')).toHaveCount(1);
      await expect(page.getByTestId('draft-fan-out-end')).toContainText(draftCopy.fanOut.latest);
      // The source's diff, narrowed to what the Links read.
      const atTheSource = page.getByRole('region', { name: draftCopy.path.atTheSource });
      await expect(atTheSource).toContainText('otlpEndpoint', { timeout: 30_000 });
      await expect(atTheSource).toContainText('https://otel.acme.internal:4317');
      // The variants that read it change; prod-us, which reads nothing, does not.
      await expect(page.getByTestId('draft-same-figure')).toBeVisible({ timeout: 30_000 });

      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      const created = await findChangeOrder(slug);
      expect(created?.UpdateType).toBe('TransformPaths');
      expect(created?.InvocationID ?? '').toBe('');
      expect(creates).toHaveLength(1);
    } finally {
      await cleanUpCreate(slug);
    }
  });

  test('the image function: the tag is typed inline in the Run row, and the hero only reads it; picking another container starts with no tag', async ({ page }) => {
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug, tag: '1.5.0' });
    const tag = tagInput(page);
    await expect(tag).toHaveValue('1.5.0', { timeout: 30_000 });
    // Inline, after the repository it completes; the hero below is read-only, the detail view's own.
    const run = page.getByTestId('draft-invoke-run');
    await expect(run.getByTestId('draft-invoke-repository')).toHaveText('ghcr.io/acme/draft-api');
    await expect(page.getByTestId('change-order-image-hero')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('draft-invoke-sections').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByTestId('change-order-image-hero-variants')).toContainText(draftCopy.invoke.inVariants(4));
    await tag.fill('1.6.0');
    await expect.poll(() => searchParam(page, 'tag')).toBe('1.6.0');

    await page.getByTestId('draft-invoke-container').click();
    await page.getByRole('dialog', { name: draftCopy.invoke.container }).locator('[data-choice="proxy"]').click();
    await expect.poll(() => searchParam(page, 'container')).toBe('proxy');
    expect(searchParam(page, 'tag')).toBe('');
    await expect(tag).toHaveValue('');
    await expect(run.getByTestId('draft-invoke-repository')).toHaveText('ghcr.io/acme/draft-proxy');
    // Nothing has run: no hero rather than "No image change".
    await expect(page.getByTestId('change-order-image-hero')).toHaveCount(0);
    await expect(page.getByTestId('change-order-no-image-change')).toHaveCount(0);
    await expect(sideColumn(page).getByTestId('draft-blocker')).toHaveText(draftCopy.invoke.problems.tagEmpty);
    // The blocker takes the keyboard to the inline tag.
    await sideColumn(page).getByTestId('draft-blocker').click();
    await expect(tag).toBeFocused();
  });

  test('the tag suggests the next tags as a combobox: the arrows choose one, Enter takes it, Escape closes the list', async ({ page }) => {
    const words = draftCopy.invoke.suggest;
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug });
    const tag = tagInput(page);
    await expect(tag).toBeVisible({ timeout: 30_000 });
    // The example is the next patch of what the variants run.
    await expect(tag).toHaveAttribute('placeholder', '1.0.1…');
    await tag.focus();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(tag).toHaveAttribute('aria-expanded', 'true');
    // The variants run 1.0.0, the base 1.1.0: their next tags, each once.
    await expect(list.getByRole('option')).toHaveText([
      `1.0.1${words.patch}`,
      `1.1.0${words.minor}`,
      `2.0.0${words.major}`,
      `1.1.1${words.patch}`,
      `1.2.0${words.minor}`,
    ]);
    await expect(page.getByRole('status').filter({ hasText: words.count(5) })).toHaveCount(1);
    // The arrows move through the list without writing anything; Enter takes the one chosen.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option').nth(1)).toHaveClass(/Mui-focused/);
    await expect(tag).toHaveValue('');
    await page.keyboard.press('Enter');
    await expect(tag).toHaveValue('1.1.0');
    await expect.poll(() => searchParam(page, 'tag')).toBe('1.1.0');
    await expect(tag).toBeFocused();
    // Typing narrows the list to the tags that go on from what is typed; Escape closes it and keeps the text.
    await tag.fill('1.1.');
    await expect(list.getByRole('option')).toHaveText([`1.1.0${words.minor}`, `1.1.1${words.patch}`]);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(tag).toHaveValue('1.1.');
    // A whole image reference pasted in is taken for its tag.
    await tag.fill('ghcr.io/acme/draft-api:1.3.0');
    await expect(tag).toHaveValue('1.3.0');
    await expect.poll(() => searchParam(page, 'tag')).toBe('1.3.0');
  });

  test('the warnings sit beside the tag: a downgrade, a base on another tag, a move that is not the patch it looks like', async ({ page }) => {
    const words = draftCopy.invoke.warnings;
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug, container: 'api', tag: '0.9.0' });
    const warnings = page.getByTestId('draft-invoke-run').getByTestId('draft-invoke-tag-warning');
    await expect(warnings).toHaveCount(2, { timeout: 30_000 });
    await expect(warnings.nth(0)).toHaveAttribute('data-warning', 'tag');
    await expect(warnings.nth(0)).toContainText(words.downgrade);
    await expect(warnings.nth(1)).toContainText('1.1.0');
    // Said in words to the input, whichever form the chips draw.
    await expect(tagInput(page)).toHaveAccessibleDescription(new RegExp(words.downgradeTip('0.9.0', '1.0.0').replace(/\./g, '\\.')));
    // Not on the outcome line any more.
    await expect(cardPart(page, 'outcome').getByTestId('draft-invoke-tag-warning')).toHaveCount(0);

    // 1.0.0 → 1.1.1 is a minor move for the variants, though it is a patch of the base's 1.1.0.
    await tagInput(page).fill('1.1.1');
    await expect(warnings).toHaveCount(1);
    await expect(warnings.first()).toContainText(words.notAPatchShort);
    await expect(tagInput(page)).toHaveAccessibleDescription(words.notAPatchTip('1.0.0', '1.1.1', 'minor', '1.1.0'));
    // The base's own tag: nothing to say.
    await tagInput(page).fill('1.1.0');
    await expect(warnings).toHaveCount(0);
  });

  test('a call that changes nothing anywhere blocks Create, and the stages are drawn empty, not "same change"', async ({ page }) => {
    // Every variant runs api at 1.0.0 already.
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug, container: 'api', tag: '1.0.0' });
    await expect(page.getByTestId('draft-outcome-idle')).toHaveText(draftCopy.invoke.problems.nothingChanges, { timeout: 30_000 });
    await expect(sideColumn(page).getByTestId('draft-blocker')).toHaveText(draftCopy.invoke.problems.tagUnchanged('1.0.0'));
    await expect(createButton(page)).toBeDisabled();
    await expect(sideColumn(page).getByTestId('draft-stage-track-empty')).toHaveCount(2);
    await expect(sideColumn(page).getByRole('status')).toContainText(draftCopy.page.side.sentenceIdle(draftCopy.invoke.problems.nothingChanges));
    await expect(page.getByTestId('draft-same-figure')).toHaveCount(0);
  });

  test('the image function: a container and a tag preview the change; Create saves the Invocation, then the Invoke ChangeOrder', async ({ page }) => {
    const slug = `${fx.label}-image`;
    const saves = invocationSaves(page);
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke' });
      // Nothing runs before the tag is typed, and Create says what it waits for.
      await expect(cardPart(page, 'outcome')).toContainText(draftCopy.invoke.nothingYet);
      await expect(sideColumn(page).getByTestId('draft-blocker')).toHaveText(draftCopy.invoke.problems.tagEmpty);
      // Inline: the function slot says Create saves it.
      await expect(page.getByTestId('draft-invoke-function')).toHaveAttribute('data-runs', 'saved-on-create');

      await tagInput(page).fill('1.2.0');
      await expect.poll(() => searchParam(page, 'tag')).toBe('1.2.0');

      // The dry run of the call: every variant runs api, so the same change everywhere.
      await expect(page.getByTestId('draft-same-figure')).toContainText(draftCopy.page.facts.ofSame(4), { timeout: 30_000 });
      await expect(tagInput(page)).toHaveValue('1.2.0');
      await expect(page.getByTestId('change-order-image-hero-variants')).toContainText(draftCopy.invoke.inVariants(4));
      // The rail's source names what runs, in the detail view's words.
      await expect(pathRegion(page)).toContainText('set-container-image');
      await expect(pathRegion(page)).toContainText(draftCopy.invoke.changeDefined);

      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      // The new ChangeOrder's title has the keyboard.
      await expect(page.getByTestId('change-order-title')).toBeFocused({ timeout: 30_000 });

      // Two writes: the Invocation, saved under the ChangeOrder's name, then the ChangeOrder that runs it.
      expect(saves).toHaveLength(1);
      const [invocation] = await findInvocations(slug);
      const created = await findChangeOrder(slug);
      expect(created).toMatchObject({
        UpdateType: 'Invoke',
        InvocationID: invocation.InvocationID,
        Parameters: { container_name: 'api', container_image: 'ghcr.io/acme/draft-api:1.2.0' },
        WhereUnit: "Slug = 'api'",
      });
    } finally {
      await cleanUpCreate(slug);
    }
    expect(await findChangeOrder(slug)).toBeUndefined();
    expect(await findInvocations(slug)).toEqual([]);
  });

  test('Invoke: set-label with a key and a value previews and creates', async ({ page }) => {
    const slug = `${fx.label}-label`;
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label' });
      await expect(page.getByTestId('draft-invoke-function')).toHaveAccessibleName(`${draftCopy.invoke.function}: set-label`);
      await expect(sideColumn(page).getByTestId('draft-blocker')).toHaveText(draftCopy.invoke.problems.argEmpty('key'));

      await page.getByTestId('draft-invoke-arg-label-key').fill('team');
      await page.getByTestId('draft-invoke-arg-label-value').fill('payments');
      await expect.poll(() => searchParam(page, 'p.label-value')).toBe('payments');
      await expect(page.getByTestId('draft-same-figure')).toContainText(draftCopy.page.facts.ofSame(4), { timeout: 30_000 });
      // No image moves: the quiet band, and the full diff "At the source", grouped as the detail view groups it.
      await expect(page.getByTestId('change-order-no-image-change')).toBeVisible();
      await expect(page.getByTestId('draft-source-group').first()).toContainText(draftCopy.invoke.groupCaption(['dev', 'prod-ap', 'prod-eu', 'prod-us']));
      // The description suggests what it sets.
      await expect(descriptionField(page)).toHaveValue('team=payments');

      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      const [invocation] = await findInvocations(slug);
      expect(await findChangeOrder(slug)).toMatchObject({
        UpdateType: 'Invoke',
        InvocationID: invocation.InvocationID,
        Parameters: { label_key: 'team', label_value: 'payments' },
      });
    } finally {
      await cleanUpCreate(slug);
    }
  });

  test('the function popover lists the 3 most recent saved Invocations above the functions; the search finds every one, by name or function', async ({ page }) => {
    await openDraft(page, { kind: 'invoke', wf: fx.workflowSlug });
    await page.getByTestId('draft-invoke-function').click();
    const dialog = page.getByRole('dialog', { name: draftCopy.invoke.function });
    const recent = dialog.getByTestId('draft-invoke-invocations');
    await expect(recent.getByRole('menuitemradio')).not.toHaveCount(0);
    expect(await recent.getByRole('menuitemradio').count()).toBeLessThanOrEqual(3);
    // No heading over the recent few; the functions follow, the image function first and marked the default.
    await expect(dialog.getByRole('heading', { name: draftCopy.invoke.savedInvocations })).toHaveCount(0);
    const functions = dialog.getByRole('menu', { name: draftCopy.invoke.functions }).getByRole('menuitemradio');
    await expect(functions.first()).toHaveAttribute('data-function', 'set-container-image');
    await expect(functions.first()).toContainText(draftCopy.invoke.isDefault);

    // A search: the saved Invocations that run the function, in their own group, and the function itself.
    const search = dialog.getByRole('textbox', { name: draftCopy.invoke.searchFunctions });
    await search.fill('set-container-image');
    await expect(dialog.getByRole('heading', { name: draftCopy.invoke.savedInvocations })).toBeVisible();
    await expect(recent.locator(`[data-invocation="${fx.imageInvocation.ref}"]`)).toBeVisible();
    await expect(dialog.locator('[data-function="set-container-image"]')).toBeVisible();
    await expect(dialog.locator('[data-function="set-label"]')).toHaveCount(0);
    // By its name too, and the keyboard reaches it.
    await search.fill(`${fx.label}-set-image`);
    await expect(recent.getByRole('menuitemradio')).toHaveCount(1);
    await expect(functions).toHaveCount(0);
    await recent.getByRole('menuitemradio').press('Enter');
    await expect.poll(() => searchParam(page, 'inv')).toBe(fx.imageInvocation.ref);
  });

  test('picking a previous Invocation runs it, and Create saves nothing new', async ({ page }) => {
    const slug = `${fx.label}-picked`;
    const saves = invocationSaves(page);
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', container: 'api', tag: '1.3.0' });
      await page.getByTestId('draft-invoke-function').click();
      // Found by its name: the popover lists only the most recent few until a search.
      const dialog = page.getByRole('dialog', { name: draftCopy.invoke.function });
      await dialog.getByRole('textbox', { name: draftCopy.invoke.searchFunctions }).fill(`${fx.label}-set-image`);
      await dialog.locator(`[data-invocation="${fx.imageInvocation.ref}"]`).click();
      await expect.poll(() => searchParam(page, 'inv')).toBe(fx.imageInvocation.ref);
      // A saved image Invocation keeps the inline tag.
      await expect(tagInput(page)).toHaveValue('1.3.0');
      await expect(page.getByTestId('draft-invoke-function')).toHaveAttribute('data-runs', fx.imageInvocation.ref);
      await expect(page.getByTestId('draft-same-figure')).toContainText(draftCopy.page.facts.ofSame(4), { timeout: 30_000 });

      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      expect(saves).toEqual([]);
      expect(await findInvocations(slug)).toEqual([]);
      expect(await findChangeOrder(slug)).toMatchObject({
        InvocationID: fx.imageInvocation.invocationId,
        Parameters: { container_name: 'api', image: 'ghcr.io/acme/draft-api:1.3.0' },
      });
    } finally {
      await cleanUpCreate(slug);
    }
  });

  test("an identical Invocation the base has saved already is adopted, whatever its name: Create saves nothing", async ({ page }) => {
    const slug = `${fx.label}-adopt`;
    const savedSlug = `${fx.label}-labels`;
    const saves = invocationSaves(page);
    const savedId = await saveInvocation({ Slug: savedSlug, ...SET_LABEL_INVOCATION });
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': 'silver' });
      await expect(page.getByTestId('draft-invoke-function')).toHaveAttribute('data-runs', `${fx.baseSlug}/${savedSlug}`, { timeout: 30_000 });
      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      expect(saves).toEqual([]);
      expect(await findChangeOrder(slug)).toMatchObject({ InvocationID: savedId, Parameters: { label_key: 'tier', label_value: 'silver' } });
    } finally {
      await cleanUpCreate(slug);
      await deleteInvocationById(savedId);
    }
  });

  test('an Invocation of the draft’s name that runs something else is said on the name, and nothing is sent', async ({ page }) => {
    const slug = `${fx.label}-clash`;
    const creates = changeOrderCreates(page);
    const saves = invocationSaves(page);
    const otherId = await saveInvocation({
      Slug: slug,
      FunctionInvocations: [{ FunctionName: 'set-annotation', Arguments: [{ ParameterName: 'annotation-key', Value: 'a' }, { ParameterName: 'annotation-value', Value: 'b' }] }],
    });
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': 'bronze' });
      await expect(page.getByText(draftCopy.invoke.problems.invocationNameTaken(slug, fx.baseSlug))).toBeVisible({ timeout: 30_000 });
      await expect(sideColumn(page).getByTestId('draft-blocker')).toHaveText(draftCopy.page.blockers.name);
      await expect(createButton(page)).toBeDisabled();
      expect(saves).toEqual([]);
      expect(creates).toEqual([]);
    } finally {
      await deleteInvocationById(otherId);
      await cleanUpCreate(slug);
    }
  });

  test('a ChangeOrder refused after its Invocation was saved deletes the Invocation again, and says so', async ({ page }) => {
    const slug = `${fx.label}-refused`;
    const saves = invocationSaves(page);
    await page.route(
      (url) => url.pathname === `/api/space/${fx.baseSpaceId}/change_order`,
      async (route) => {
        const request = route.request();
        if (request.method() !== 'POST' || new URL(request.url()).searchParams.get('dry_run') === 'true') return route.fallback();
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'refused for the test' }) });
      },
    );
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': 'gold' });
      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(createFailed(page)).toContainText(draftCopy.invoke.problems.notCreated, { timeout: 30_000 });
      await expect(createFailed(page)).toContainText(draftCopy.invoke.problems.invocationRemoved(slug));
      await expect(createFailed(page)).toBeFocused();
      expect(saves).toHaveLength(1);
      expect(await findInvocations(slug)).toEqual([]);
      expect(await findChangeOrder(slug)).toBeUndefined();
      // Nothing is held: the draft is as it was.
      expect(searchParam(page, 'inv')).toBeNull();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await cleanUpCreate(slug);
    }
  });

  for (const failure of ['5xx', 'network'] as const) {
    test(`the ChangeOrder's write failing (${failure}) keeps the Invocation, holds it, and a renamed retry runs it`, async ({ page }) => {
      const slug = `${fx.label}-kept-${failure === '5xx' ? 'a' : 'b'}`;
      const renamed = `${slug}-2`;
      const saves = invocationSaves(page);
      let failed = false;
      await page.route(
        (url) => url.pathname === `/api/space/${fx.baseSpaceId}/change_order`,
        async (route) => {
          const request = route.request();
          if (request.method() !== 'POST' || new URL(request.url()).searchParams.get('dry_run') === 'true' || failed) return route.fallback();
          failed = true;
          if (failure === 'network') return route.abort('connectionreset');
          return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'bad gateway' }) });
        },
      );
      let keptId: string | undefined;
      try {
        await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': `kept-${failure === '5xx' ? 'a' : 'b'}` });
        await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
        await createButton(page).click();
        await expect(createFailed(page)).toContainText(draftCopy.invoke.problems.unknownCreated, { timeout: 30_000 });
        await expect(createFailed(page)).toContainText(draftCopy.invoke.problems.invocationKept(slug, fx.baseSlug));
        expect(saves).toHaveLength(1);
        const [kept] = await findInvocations(slug);
        keptId = kept.InvocationID;
        // Held in the URL: the draft runs it from now on, whatever its name.
        await expect.poll(() => searchParam(page, 'inv')).toBe(`${fx.baseSlug}/${slug}`);
        expect(searchParam(page, 'p.label_key')).toBe('tier');

        await nameField(page).fill(renamed);
        await nameField(page).blur();
        await expect.poll(() => searchParam(page, 'name')).toBe(renamed);
        await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
        await createButton(page).click();
        await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${renamed}$`), { timeout: 30_000 });
        expect(saves).toHaveLength(1);
        expect(await findChangeOrder(renamed)).toMatchObject({ InvocationID: keptId });
      } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await cleanUpCreate(renamed);
        await cleanUpCreate(slug);
        if (keptId !== undefined) await deleteInvocationById(keptId);
      }
    });

    test(`the Invocation's save failing (${failure}) leaves nothing, and the next Create saves it once`, async ({ page }) => {
      const slug = `${fx.label}-save-${failure === '5xx' ? 'a' : 'b'}`;
      const saves = invocationSaves(page);
      const creates = changeOrderCreates(page);
      let failed = false;
      await page.route(
        (url) => url.pathname === `/api/space/${fx.baseSpaceId}/invocation`,
        async (route) => {
          const request = route.request();
          if (request.method() !== 'POST' || new URL(request.url()).searchParams.get('dry_run') === 'true' || failed) return route.fallback();
          failed = true;
          if (failure === 'network') return route.abort('connectionreset');
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) });
        },
      );
      try {
        await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': `save-${failure === '5xx' ? 'a' : 'b'}` });
        await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
        await createButton(page).click();
        await expect(createFailed(page)).toContainText(draftCopy.couldNotEstablish, { timeout: 30_000 });
        expect(creates).toEqual([]);
        expect(await findInvocations(slug)).toEqual([]);

        await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
        await createButton(page).click();
        await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
        expect(saves).toHaveLength(2);
        expect(await findInvocations(slug)).toHaveLength(1);
      } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await cleanUpCreate(slug);
      }
    });
  }

  test('a name another Invocation takes between the check and the save: the identical one is run, never a second', async ({ page }) => {
    const slug = `${fx.label}-raced`;
    const saves = invocationSaves(page);
    // The Invocation lands after the page has read the list, as another tab's Create would.
    await page.route(
      (url) => url.pathname === '/api/invocation',
      async (route) => {
        const response = await route.fetch();
        const listed = ((await response.json()) as { Invocation: { Slug: string } }[]).filter((entry) => entry.Invocation.Slug !== slug);
        return route.fulfill({ response, json: listed });
      },
    );
    await page.route(
      (url) => url.pathname === `/api/space/${fx.baseSpaceId}/invocation` && url.searchParams.get('dry_run') === 'true',
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() ?? '{}' }),
    );
    let racedId: string | undefined;
    try {
      racedId = await saveInvocation({ Slug: slug, ...SET_LABEL_INVOCATION });
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': 'raced' });
      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).click();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      // The save was refused as taken, and the one there is the very call: it runs.
      expect(saves).toHaveLength(1);
      expect(await findInvocations(slug)).toHaveLength(1);
      expect(await findChangeOrder(slug)).toMatchObject({ InvocationID: racedId });
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await cleanUpCreate(slug);
    }
  });

  test('a double click on Create makes one Invocation and one ChangeOrder', async ({ page }) => {
    const slug = `${fx.label}-twice`;
    const saves = invocationSaves(page);
    const creates = changeOrderCreates(page);
    try {
      await openInvokeDraft(page, slug, { kind: 'invoke', fn: 'set-label', 'p.label-key': 'tier', 'p.label-value': 'twice' });
      await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
      await createButton(page).dblclick();
      await expect(page).toHaveURL(new RegExp(`/change-orders/${fx.baseSlug}/${slug}$`), { timeout: 30_000 });
      expect(saves).toHaveLength(1);
      expect(creates).toHaveLength(1);
      expect(await findInvocations(slug)).toHaveLength(1);
    } finally {
      await cleanUpCreate(slug);
    }
  });

  test('a name edited back to what it was, after the URL took the edit, goes back into the URL', async ({ page }) => {
    await openDraft(page);
    const original = await nameField(page).inputValue();
    expect(original).not.toBe('');

    // The edit settles: the URL has it.
    await nameField(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type('-abc');
    await expect.poll(() => searchParam(page, 'name'), { timeout: 10_000 }).toBe(`${original}-abc`);

    // Back to what it was, and away: the URL must follow, not keep the edit, and the field must
    // not be re-seeded with it.
    await nameField(page).fill(original);
    await page.keyboard.press('Tab');
    await expect.poll(() => searchParam(page, 'name'), { timeout: 10_000 }).toBe(original);
    await expect(createButton(page)).toBeEnabled({ timeout: 30_000 });
    expect(searchParam(page, 'name')).toBe(original);
    await expect(nameField(page)).toHaveValue(original);
  });

  test('"New ChangeOrder" lists each Component once, at its base; search narrows it; Enter opens the draft', async ({ page }) => {
    // A variant with no release Target: not a base, though it has no Target.
    const extraSlug = `${fx.label}-qa`;
    const extra = await hubApi.post('/api/space', {
      data: {
        Slug: extraSlug,
        ComponentID: fx.componentId,
        Labels: { Owner: 'E2E', Variant: 'qa' },
        Annotations: { UpstreamSpaceID: fx.baseSpaceId },
      },
    });
    expect(extra.ok()).toBe(true);
    const extraId = ((await extra.json()) as { SpaceID: string }).SpaceID;
    // A second Component with a base, so the picker opens however many other bases the org has.
    const api = new ApiHelper(page);
    const otherLabel = `e2e-pick-${RandomSlugGenerator.randomSlugName()}`;
    const otherComponentId = (await api.createComponent(otherLabel)).ComponentID as string;
    const otherSpaceIds: string[] = [];
    try {
      const otherBaseId = spaceIdOf(
        await api.createSpace({ space: { Slug: `${otherLabel}-base`, ComponentID: otherComponentId, Labels: { Owner: 'E2E' } } as never }),
      );
      otherSpaceIds.push(otherBaseId);
      otherSpaceIds.push(
        spaceIdOf(
          await api.createSpace({
            space: {
              Slug: `${otherLabel}-dev`,
              ComponentID: otherComponentId,
              Labels: { Owner: 'E2E' },
              Annotations: { UpstreamSpaceID: otherBaseId },
            } as never,
          }),
        ),
      );

      await page.goto('/change-orders');
      const newButton = page.getByTestId('new-change-order');
      await expect(newButton).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
      await newButton.click();
      const picker = page.getByRole('dialog', { name: draftCopy.page.newChangeOrder });
      const search = picker.getByRole('searchbox', { name: draftCopy.page.picker.search });
      await expect(search).toBeFocused();

      await search.fill(fx.label);
      const rows = picker.getByRole('menuitem');
      await expect(rows).toHaveCount(1, { timeout: 30_000 });
      await expect(rows.first()).toHaveAttribute('data-base', fx.baseSlug);
      await expect(picker.locator(`[data-base="${extraSlug}"]`)).toHaveCount(0);
      for (const variant of Object.values(fx.variants)) await expect(picker.locator(`[data-base="${variant.slug}"]`)).toHaveCount(0);

      await search.fill(`${fx.label}-no-such`);
      await expect(picker.getByText(draftCopy.page.picker.noMatch)).toBeVisible();

      await search.fill(fx.baseSlug);
      await expect(rows).toHaveCount(1);
      await search.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/change-orders/new\\?space=${fx.baseSlug}$`));
      await draftDrawn(page);
    } finally {
      for (const spaceId of [extraId, ...otherSpaceIds.reverse()])
        await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true', detach: 'true' } }).catch(() => undefined);
      await hubApi.delete(`/api/component/${otherComponentId}`).catch(() => undefined);
    }
  });

  test('"New ChangeOrder" on a console filtered to one Component opens its draft directly', async ({ page }) => {
    await page.goto('/change-orders');
    const componentFilter = page.locator(`select:has(option[value="${fx.label}"])`);
    await expect(componentFilter).toBeVisible({ timeout: 30_000 });
    await componentFilter.selectOption(fx.label);

    const newButton = page.getByTestId('new-change-order');
    // No picker to choose in: it is a link to the draft itself.
    await expect(newButton).toHaveAttribute('href', new RegExp(`/change-orders/new\\?space=${fx.baseSlug}$`), { timeout: 30_000 });
    await newButton.click();
    await expect(page).toHaveURL(new RegExp(`/change-orders/new\\?space=${fx.baseSlug}$`));
    await draftDrawn(page);
  });
});
