// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field-diagnosis E2E seed: the fd-* states of the contract (section 5), on a Component of
// the spec's own, named `fdt-<random>`. base -> staging -> prod, Unit `web` in each:
//   - prod spec.replicas 5 under an Override guard; base's change to 7 is withheld (Apply test);
//   - prod spec.minReadySeconds 10 under an Override guard; base's change to 30 is withheld
//     (Dismiss test);
//   - prod runAsUser 0 under the requirement guard RunAsRoot=LegacyImage, and a validating
//     Trigger no-root-user that fails without naming a path (one "Unit gates" failing);
//   - base then moves replicas to 9, so staging has an incoming upgrade of spec.replicas;
//   - prod also holds a second Unit `api` (a ConfigMap), for the hand-opened card of the Back tests;
//   - and a NeedsProvides Link, as the fd seed's web-to-ns: Unit `app` (a Deployment whose
//     namespace is the placeholder) needs its namespace from Unit `ns` (a Namespace), so `app`'s
//     metadata.namespace is set by Link app-to-ns, a jump inside the prod Space.
import type { APIResponse } from '@playwright/test';

import { expect, hubApi } from '../test';

const deployment = ({ replicas, minReadySeconds }: { replicas: number; minReadySeconds: number }) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
  labels:
    app: web
spec:
  replicas: ${replicas}
  minReadySeconds: ${minReadySeconds}
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      securityContext:
        runAsUser: 0
      containers:
        - name: web
          image: registry.example.com/legacy/web:1.4.2
`;

const RESOURCE = { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/web' };

const body = async <T>(response: APIResponse, what: string): Promise<T> => {
  if (!response.ok()) throw new Error(`${what}: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
};

type UnitResponse = { Unit: { UnitID: string; ValidationErrors?: Record<string, boolean>; Conflicts?: { Reason?: string; Path?: string }[] } };

export interface FieldDiagnosisSeed {
  component: string;
  componentId: string;
  base: { spaceId: string; unitId: string };
  staging: { spaceId: string; unitId: string };
  prod: { spaceId: string; unitId: string };
  prodApi: { spaceId: string; unitId: string };
  prodApp: { spaceId: string; unitId: string };
  prodNs: { spaceId: string; unitId: string };
  triggerId: string;
  cleanup: () => Promise<void>;
}

export async function seedFieldDiagnosis(): Promise<FieldDiagnosisSeed> {
  const component = `fdt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const componentId = (
    await body<{ ComponentID: string }>(
      await hubApi.post('/api/component', { params: { allow_exists: 'true' }, data: { Slug: component, DisplayName: component } }),
      'component',
    )
  ).ComponentID;

  const space = async (variant: string) =>
    (
      await body<{ SpaceID: string }>(
        await hubApi.post('/api/space', {
          data: { Slug: `${component}-${variant}`, ComponentID: componentId, Labels: { Owner: 'E2E', Variant: variant } },
        }),
        `space ${variant}`,
      )
    ).SpaceID;
  const baseSpace = await space('base');
  const stagingSpace = await space('staging');
  const prodSpace = await space('prod');

  // A write queues a trigger pass; the next write waits for it, or it is refused for a stale head.
  const settled = async (spaceId: string, unitId: string) =>
    expect
      .poll(
        async () =>
          Object.keys(
            (await body<UnitResponse>(await hubApi.get(`/api/space/${spaceId}/unit/${unitId}`), 'unit')).Unit.ValidationErrors ?? {},
          ).includes('awaiting/triggers'),
        { timeout: 30_000 },
      )
      .toBe(false);
  const setData = async (spaceId: string, unitId: string, values: { replicas: number; minReadySeconds: number }) => {
    await body(await hubApi.put(`/api/space/${spaceId}/unit/${unitId}/data`, { data: deployment(values) }), 'unit data');
    await settled(spaceId, unitId);
  };
  const unit = async (spaceId: string, upstream?: { spaceId: string; unitId: string }, slug = 'web') => {
    const id = (
      await body<UnitResponse>(
        await hubApi.post(`/api/space/${spaceId}/unit`, {
          params: upstream ? { upstream_space_id: upstream.spaceId, upstream_unit_id: upstream.unitId } : {},
          data: { Slug: slug, ToolchainType: 'Kubernetes/YAML' },
        }),
        'unit',
      )
    ).Unit.UnitID;
    await settled(spaceId, id);
    return id;
  };
  const upgrade = async (spaceId: string, unitId: string) => {
    await body(
      await hubApi.patch(`/api/space/${spaceId}/unit/${unitId}`, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
        params: { upgrade: 'true' },
        data: {},
      }),
      'upgrade',
    );
    await settled(spaceId, unitId);
  };

  const baseUnit = await unit(baseSpace);
  await setData(baseSpace, baseUnit, { replicas: 3, minReadySeconds: 10 });
  const stagingUnit = await unit(stagingSpace, { spaceId: baseSpace, unitId: baseUnit });
  const prodUnit = await unit(prodSpace, { spaceId: stagingSpace, unitId: stagingUnit });

  await setData(prodSpace, prodUnit, { replicas: 5, minReadySeconds: 10 });
  await body(
    await hubApi.post(`/api/space/${prodSpace}/unit/${prodUnit}/guard`, {
      data: {
        ResourceGuards: [
          {
            Resource: RESOURCE,
            Set: {
              'spec.replicas': { Override: 'Upstream' },
              'spec.minReadySeconds': { Override: 'Upstream' },
              'spec.template.spec.securityContext': { RunAsRoot: 'LegacyImage' },
            },
          },
        ],
      },
    }),
    'guards',
  );
  await settled(prodSpace, prodUnit);

  const triggerId = (
    await body<{ TriggerID: string }>(
      await hubApi.post(`/api/space/${prodSpace}/trigger`, {
        data: {
          Slug: 'no-root-user',
          Event: 'Mutation',
          ToolchainType: 'Kubernetes/YAML',
          FunctionName: 'vet-celexpr',
          Arguments: [
            {
              ParameterName: 'validation-expr',
              Value:
                "r.kind != 'Deployment' || !has(r.spec.template.spec.securityContext) || r.spec.template.spec.securityContext.runAsUser != 0",
            },
          ],
        },
      }),
      'trigger',
    )
  ).TriggerID;
  await body(
    await hubApi.post('/api/function/invoke', {
      params: { executor_space: prodSpace, where: `UnitID = '${prodUnit}'` },
      data: { ToolchainType: 'Kubernetes/YAML', Triggers: [triggerId], UpdateValidationResults: true, FunctionInvocations: null },
    }),
    'trigger run',
  );

  // Base moves both guarded fields; the merge into prod withholds both.
  await setData(baseSpace, baseUnit, { replicas: 7, minReadySeconds: 30 });
  await upgrade(stagingSpace, stagingUnit);
  await upgrade(prodSpace, prodUnit);
  const conflicts = (await body<UnitResponse>(await hubApi.get(`/api/space/${prodSpace}/unit/${prodUnit}`), 'unit')).Unit.Conflicts ?? [];
  expect(conflicts.map((c) => c.Path).sort()).toEqual(['spec.minReadySeconds', 'spec.replicas']);

  const apiUnit = await unit(prodSpace, undefined, 'api');
  await body(
    await hubApi.put(`/api/space/${prodSpace}/unit/${apiUnit}/data`, {
      data: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: api\n  namespace: default\ndata:\n  LOG_LEVEL: info\n',
    }),
    'api data',
  );
  await settled(prodSpace, apiUnit);

  const nsUnit = await unit(prodSpace, undefined, 'ns');
  await body(
    await hubApi.put(`/api/space/${prodSpace}/unit/${nsUnit}/data`, {
      data: 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: test-ns\n',
    }),
    'ns data',
  );
  await settled(prodSpace, nsUnit);
  const appUnit = await unit(prodSpace, undefined, 'app');
  await body(
    await hubApi.put(`/api/space/${prodSpace}/unit/${appUnit}/data`, {
      data: [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: app',
        '  namespace: confighubplaceholder',
        'spec:',
        '  replicas: 1',
        '  selector:',
        '    matchLabels:',
        '      app: app',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: app',
        '    spec:',
        '      containers:',
        '        - name: app',
        '          image: nginx:1.27',
        '',
      ].join('\n'),
    }),
    'app data',
  );
  await settled(prodSpace, appUnit);
  await body(
    await hubApi.post(`/api/space/${prodSpace}/link`, {
      data: { Slug: 'app-to-ns', FromUnitID: appUnit, ToUnitID: nsUnit, ToSpaceID: prodSpace, UpdateType: 'NeedsProvides', AutoUpdate: true },
    }),
    'link',
  );
  // The Link resolves on its own (auto-update): app's namespace becomes test-ns.
  await expect
    .poll(
      async () => {
        const res = await hubApi.get(`/api/space/${prodSpace}/unit/${appUnit}/data`);
        return res.ok() ? (await res.text()).includes('namespace: test-ns') : false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // An incoming upgrade waits in staging.
  await setData(baseSpace, baseUnit, { replicas: 9, minReadySeconds: 30 });

  return {
    component,
    componentId,
    base: { spaceId: baseSpace, unitId: baseUnit },
    staging: { spaceId: stagingSpace, unitId: stagingUnit },
    prod: { spaceId: prodSpace, unitId: prodUnit },
    prodApi: { spaceId: prodSpace, unitId: apiUnit },
    prodApp: { spaceId: prodSpace, unitId: appUnit },
    prodNs: { spaceId: prodSpace, unitId: nsUnit },
    triggerId,
    cleanup: async () => {
      for (const spaceId of [prodSpace, stagingSpace, baseSpace]) {
        await hubApi.delete(`/api/space/${spaceId}`, { params: { recursive: 'true' } }).catch(() => undefined);
      }
      await hubApi.delete(`/api/component/${componentId}`).catch(() => undefined);
    },
  };
}
