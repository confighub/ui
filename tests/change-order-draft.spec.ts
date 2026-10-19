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
`;

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
  variants: Record<VariantName, { slug: string; spaceId: string }>;
  /** Every Space seeded, in creation order; deleted in reverse. */
  spaceIds: string[];
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
    await patchOrThrow(`/api/component/${componentId}`, { AllowedChangeWorkflowIDs: [workflowId], ChangeWorkflowRequired: true });

    return { label, componentId, baseSlug, baseSpaceId, lastSlug, releaseSlug, workflowSlug, variants, spaceIds };
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

const ledgerRow = (page: Page, row: 'what' | 'how-much' | 'where' | 'path' | 'name' | 'same') => page.getByTestId(`draft-row-${row}`);
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
    await expect(page.getByTestId('draft-ledger')).toBeVisible({ timeout: 30_000 });
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
    // Path: the one workflow the policy allows, said to come from the policy.
    const path = ledgerRow(page, 'path');
    await expect(path.getByTestId('draft-workflow')).toContainText(fx.workflowSlug);
    await expect(path.locator('[data-provenance="policy"]')).toBeVisible();
    // Scope: as last time — three of the four variants, so not "all".
    await expect(page.getByTestId('draft-scope')).toHaveAccessibleName(`${draftCopy.page.scope.title}: ${draftCopy.page.ledger.variants(LAST_SCOPE.length)}`);
    // Last time's side of Where: how many variants it took ("3 variants", figure and word apart).
    await expect(ledgerRow(page, 'where').getByRole('cell').first()).toHaveText(new RegExp(`^${LAST_SCOPE.length}\\s*variants$`));
  }

  test('"New ChangeOrder" on the console opens the draft, re-aimed from the last ChangeOrder', async ({ page }) => {
    await page.goto('/change-orders');
    const newButton = page.getByTestId('new-change-order');
    await expect(newButton).toBeVisible({ timeout: 30_000 });
    // With several base Spaces it asks which; with one it is a link straight to the draft.
    await expect(newButton).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await newButton.click();
    const picker = page.getByRole('dialog', { name: draftCopy.page.newChangeOrder });
    await expect(picker.or(page.getByTestId('draft-ledger'))).toBeVisible();
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
    const where = ledgerRow(page, 'where');
    await expect(where.getByTestId('draft-same-figure')).toHaveText(`2${draftCopy.page.ledger.ofSame(3)}`, { timeout: 45_000 });
    const chip = where.locator('[data-outlier="prod-us"]');
    await expect(chip).toContainText('1Gi');

    await chip.click();
    await page.getByRole('button', { name: draftCopy.page.outlier.leaveOut, exact: true }).click();

    const toast = page.getByTestId('draft-toast');
    await expect(toast).toContainText(draftCopy.page.outlier.leftOut('prod-us'));
    const undo = toast.getByRole('button', { name: draftCopy.page.outlier.undo });
    await expect(undo).toBeFocused();
    await expect.poll(() => searchParam(page, 'out')?.split(',') ?? []).toContain(fx.variants['prod-us'].slug);
    await expect(page.getByTestId('draft-scope')).toHaveAccessibleName(`${draftCopy.page.scope.title}: ${draftCopy.page.ledger.variants(2)}`);

    await undo.click();
    await expect.poll(() => searchParam(page, 'out')).toBeNull();
    await expect(page.getByTestId('draft-scope')).toHaveAccessibleName(`${draftCopy.page.scope.title}: ${draftCopy.page.ledger.variants(3)}`);
    await expect(where.locator('[data-outlier="prod-us"]')).toBeVisible({ timeout: 45_000 });
  });

  test('an empty scope cannot be established, blocks Create, and asks the server nothing', async ({ page }) => {
    // Every create (and create dry run) the page sends, by the scope it asks about.
    const scopes: string[][] = [];
    page.on('request', (request) => {
      if (isChangeOrderCreate(request)) scopes.push(((request.postDataJSON() ?? {}) as { InScopeSpaceIDs?: string[] }).InScopeSpaceIDs ?? []);
    });
    await openDraft(page, { out: Object.values(fx.variants).map((variant) => variant.slug).join(',') });

    const where = ledgerRow(page, 'where');
    await expect(where.locator('[data-problem="scope-empty"]')).toHaveText(draftCopy.problems.scopeEmpty);
    await expect(where.getByText(draftCopy.couldNotEstablish, { exact: true })).toBeVisible();
    const blocker = sideColumn(page).getByTestId('draft-blocker');
    await expect(blocker).toHaveText(draftCopy.page.blockers.where);
    await expect(createButton(page)).toBeDisabled();

    // The blocker takes the keyboard to what fixes it.
    await blocker.click();
    const scopeControl = page.getByTestId('draft-scope');
    await expect(scopeControl).toBeFocused();

    // The way back out: putting dev in scope asks the server about dev. That request is the
    // control that the page is asking at all; the first request it sent must be that one, and
    // none may name an empty scope.
    await scopeControl.click();
    const dryRun = page.waitForRequest(isChangeOrderCreate, { timeout: 30_000 });
    await page
      .getByRole('menu', { name: draftCopy.page.scope.title })
      .getByRole('menuitemcheckbox', { name: /^dev\b/ })
      .first()
      .click();
    await dryRun;
    expect(scopes.length).toBeGreaterThan(0);
    expect(scopes.filter((scope) => scope.length === 0)).toEqual([]);
    expect(scopes[0]).toEqual([fx.variants.dev.spaceId]);
  });

  test('an end that names nothing says so, and "End at latest" fixes it', async ({ page }) => {
    await openDraft(page, { end: 'nope' });
    const problem = ledgerRow(page, 'how-much').locator('[data-problem="end-not-found"]');
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

    const where = ledgerRow(page, 'where');
    await expect(where.getByText(draftCopy.couldNotEstablish, { exact: true })).toBeVisible({ timeout: 45_000 });
    expect(failed).toBeGreaterThan(0);
    await expect(where.getByTestId('draft-same-figure')).toHaveCount(0);

    failing = false;
    await where.getByRole('button', { name: /^Retry/ }).click();
    await expect(where.getByTestId('draft-same-figure')).toHaveText(`2${draftCopy.page.ledger.ofSame(3)}`, { timeout: 45_000 });
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
    await expect(ledgerRow(page, 'where').getByTestId('draft-same-figure')).toBeVisible({ timeout: 45_000 });
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
    // No picker to choose in: the button opens the draft itself.
    await expect(newButton).not.toHaveAttribute('aria-haspopup', 'dialog', { timeout: 30_000 });
    await newButton.click();
    await expect(page).toHaveURL(new RegExp(`/change-orders/new\\?space=${fx.baseSlug}$`));
    await draftDrawn(page);
  });
});
