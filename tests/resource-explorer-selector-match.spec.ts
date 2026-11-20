// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import lzString from 'lz-string';

import { ApiHelper } from './fixtures/api-helper';
import { expect, hubApi, test } from './fixtures/test';
import { RandomSlugGenerator } from './fixtures/utils/random-slug-generator';

// The Resource explorer narrowed by label selector: from a NetworkPolicy to the workloads it
// selects, and from a workload to what selects its pods.

const workloads = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  selector: {matchLabels: {app: web}}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers: [{name: web, image: nginx}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: shop
spec:
  selector: {matchLabels: {app: api}}
  template:
    metadata:
      labels: {app: api}
    spec:
      containers: [{name: api, image: nginx}]
`;

const netpols = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-ingress
  namespace: shop
spec:
  podSelector:
    matchLabels: {app: web}
  policyTypes: [Ingress]
`;

test('narrows the explorer to what a NetworkPolicy selects, and to what selects a workload', async ({ page }) => {
  const api = new ApiHelper(page);
  const base = `rxsel-${RandomSlugGenerator.randomSlugName()}`;
  const spaceId = (await api.createSpace({ space: { Slug: base } })).SpaceID!;
  try {
    for (const [slug, body] of [
      ['workloads', workloads],
      ['netpols', netpols],
    ]) {
      const unit = (await api.createUnit({ spaceId, unit: { Slug: slug, ToolchainType: 'Kubernetes/YAML' } as never })) as {
        UnitID: string;
      };
      await api.uploadUnitData({ spaceId, unitId: unit.UnitID, body });
    }

    // The resources of this Space only, as a shared link names them.
    const view = {
      where: `Space.Slug = '${base}'`,
      columns: [
        { name: 'ResourceType', source: 'resource-info', key: 'ResourceType' },
        { name: 'ResourceName', source: 'resource-info', key: 'ResourceName' },
        { name: 'UnitSlug', source: 'unit-field', key: 'UnitSlug' },
      ],
    };
    await page.goto(`/x/resource-explorer?v=${lzString.compressToEncodedURIComponent(JSON.stringify(view))}`);
    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows).toHaveCount(3, { timeout: 15000 });

    // From the NetworkPolicy: only the Deployment whose pods it selects.
    await rows.filter({ hasText: 'web-ingress' }).click();
    await page.getByTestId('resource-drawer-selector-match').click();
    const chip = page.getByTestId('resource-explorer-selector-match');
    await expect(chip).toContainText(`Workloads selected by NetworkPolicy`);
    await expect(chip).toContainText(`web-ingress in ${base}/netpols`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('apps/v1/Deployment');
    await expect(rows.first()).toContainText('shop/web');

    // From that Deployment: the NetworkPolicy that selects its pods.
    await rows.first().click();
    await expect(page.getByTestId('resource-drawer-selector-match')).toHaveText('Show what selects its pods');
    await page.getByTestId('resource-drawer-selector-match').click();
    await expect(chip).toContainText(`What selects the pods of Deployment`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('web-ingress');

    // Removing the chip lists them all again.
    await chip.locator('.MuiChip-deleteIcon').click();
    await expect(chip).toHaveCount(0);
    await expect(rows).toHaveCount(3);
  } finally {
    const response = await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } });
    if (!response.ok()) console.warn(`Space ${spaceId} was not removed: ${response.status()} ${await response.text()}`);
  }
});
