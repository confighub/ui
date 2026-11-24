// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The delivery graph: which Space a GitOps controller's resource delivers, read
// from the resource's own configuration. Pure derivation, no page, no browser.

import { expect, test } from '@playwright/test';

import {
  buildDeliveryGraph,
  deliveriesOf,
  deliveryHref,
  descendantIds,
  groupByTarget,
  destinationLabel,
  missingNodeId,
  nodeIdOfSlug,
  parentIds,
  sourceUrls,
  spaceSlugFromSourceUrl,
  stackChildren,
  treeRows,
  withAncestors,
  type DeliveryResource,
  type DeliverySpace,
} from '../src/pages/delivery/deliveryGraph';

const ARGO = 'argoproj.io/v1alpha1/Application';
const REGISTRY = 'oci://oci.example.com:443';

function space(slug: string, released = true): DeliverySpace {
  return { spaceId: `id-${slug}`, slug, releaseTargetId: released ? 'target-1' : null };
}

/** An Argo CD Application named `name`, in a Unit of Space `inSlug`, pulling the Release of `ofSlug`. */
function app(inSlug: string, name: string, ofSlug: string, destination?: Record<string, string>): DeliveryResource {
  return {
    resourceId: `res-${inSlug}-${name}`,
    spaceId: `id-${inSlug}`,
    unitId: `unit-${inSlug}-${name}`,
    unitSlug: name,
    resourceType: ARGO,
    resourceName: `argocd/${name}`,
    data: { spec: { source: { repoURL: `${REGISTRY}/space/${ofSlug}`, targetRevision: 'latest' }, destination } },
  };
}

test.describe('spaceSlugFromSourceUrl', () => {
  test('reads the slug after /space/, without a tag or digest', () => {
    expect(spaceSlugFromSourceUrl(`${REGISTRY}/space/payments-prod`)).toBe('payments-prod');
    expect(spaceSlugFromSourceUrl('oci://localhost:9092/space/dev:latest')).toBe('dev');
    expect(spaceSlugFromSourceUrl(`${REGISTRY}/space/dev@sha256:abc`)).toBe('dev');
  });

  test('is null for anything that is not a Space Release address', () => {
    expect(spaceSlugFromSourceUrl('https://github.com/acme/space/repo')).toBeNull();
    expect(spaceSlugFromSourceUrl(`${REGISTRY}/target/prod/prod-oci`)).toBeNull();
    expect(spaceSlugFromSourceUrl(`${REGISTRY}/space/a/b`)).toBeNull();
    expect(spaceSlugFromSourceUrl(`${REGISTRY}/space/`)).toBeNull();
    expect(spaceSlugFromSourceUrl(undefined)).toBeNull();
  });
});

test.describe('sourceUrls', () => {
  test('reads every source of an Argo CD Application', () => {
    const data = { spec: { source: { repoURL: 'a' }, sources: [{ repoURL: 'b' }, { chart: 'x' }, { repoURL: 'c' }] } };
    expect(sourceUrls(ARGO, data)).toEqual(['a', 'b', 'c']);
  });

  test('reads a Flux OCIRepository and a Sveltos ClusterProfile', () => {
    expect(sourceUrls('source.toolkit.fluxcd.io/v1/OCIRepository', { spec: { url: 'u' } })).toEqual(['u']);
    expect(
      sourceUrls('config.projectsveltos.io/v1beta1/ClusterProfile', {
        spec: { policyRefs: [{ remoteURL: { url: 'p' } }, { kind: 'ConfigMap' }], kustomizationRefs: [{ remoteURL: { url: 'k' } }] },
      }),
    ).toEqual(['p', 'k']);
  });

  test('is empty for a resource with no spec', () => {
    expect(sourceUrls(ARGO, {})).toEqual([]);
    expect(sourceUrls(ARGO, null)).toEqual([]);
  });
});

test('destinationLabel leaves out the cluster Argo CD runs in', () => {
  const dest = (destination: Record<string, string>) => destinationLabel(ARGO, { spec: { destination } });
  expect(dest({ server: 'https://kubernetes.default.svc', namespace: 'payments' })).toBe('namespace payments');
  expect(dest({ name: 'spoke-eu', namespace: 'payments' })).toBe('cluster spoke-eu, namespace payments');
  expect(dest({ server: 'https://10.0.0.1' })).toBe('cluster https://10.0.0.1');
  expect(destinationLabel('source.toolkit.fluxcd.io/v1/OCIRepository', { spec: { destination: { name: 'x' } } })).toBeUndefined();
});

test.describe('buildDeliveryGraph', () => {
  const spaces = [space('hub-apps'), space('platform-apps'), space('cert-manager'), space('tenants'), space('team-a'), space('lonely'), space('base', false)];
  const resources = [
    app('hub-apps', 'root', 'hub-apps'),
    app('hub-apps', 'platform', 'platform-apps'),
    app('hub-apps', 'tenants', 'tenants'),
    app('platform-apps', 'cert-manager', 'cert-manager', { name: 'spoke-1', namespace: 'cert-manager' }),
    app('tenants', 'team-a', 'team-a'),
    app('tenants', 'gone', 'deleted-space'),
    app('base', 'template', 'confighubplaceholder'),
  ];
  const graph = buildDeliveryGraph(resources, spaces);

  test('nests each Space under the Space whose resource delivers it', () => {
    expect(graph.roots).toEqual(['id-hub-apps']);
    const hub = graph.nodes.get('id-hub-apps');
    expect(hub?.children).toEqual(['id-platform-apps', 'id-tenants']);
    expect(hub?.root?.name).toBe('root');
    expect(graph.nodes.get('id-platform-apps')?.children).toEqual(['id-cert-manager']);
    expect(graph.nodes.get('id-cert-manager')?.depth).toBe(2);
    expect(graph.nodes.get('id-cert-manager')?.deliveredBy[0].destination).toBe('cluster spoke-1, namespace cert-manager');
  });

  test('keeps a source that names no Space as a node of its own', () => {
    const missing = graph.nodes.get(missingNodeId('deleted-space'));
    expect(missing?.space).toBeUndefined();
    expect(graph.nodes.get('id-tenants')?.children).toEqual([missingNodeId('deleted-space'), 'id-team-a']);
  });

  test('ignores a placeholder source, and lists released Spaces nothing delivers', () => {
    expect(graph.nodes.has('id-base')).toBe(false);
    expect(graph.undelivered.map((s) => s.slug)).toEqual(['lonely']);
  });

  test('lays a Space two Spaces deliver under one parent and keeps both deliveries', () => {
    const twice = buildDeliveryGraph(
      [app('a', 'root', 'a'), app('a', 'b', 'b'), app('a', 'shared', 'shared'), app('b', 'shared-again', 'shared')],
      [space('a'), space('b'), space('shared')],
    );
    expect(twice.nodes.get('id-a')?.children).toEqual(['id-b', 'id-shared']);
    expect(twice.nodes.get('id-b')?.children).toEqual([]);
    expect(twice.nodes.get('id-shared')?.deliveredBy.map((d) => d.name)).toEqual(['shared', 'shared-again']);
    expect(twice.deliveries).toHaveLength(3);
  });

  test('terminates on a cycle and places every Space once', () => {
    const cycle = buildDeliveryGraph([app('a', 'b', 'b'), app('b', 'a', 'a')], [space('a'), space('b')]);
    expect(cycle.roots).toEqual(['id-a']);
    expect(cycle.nodes.get('id-a')?.children).toEqual(['id-b']);
    expect(cycle.nodes.get('id-b')?.children).toEqual([]);
  });

  test('the tree as rows: each Space, then what it delivers when it is open', () => {
    const open = treeRows(graph, () => true);
    expect(open.map((row) => `${row.depth}:${graph.nodes.get(row.id)?.slug}`)).toEqual([
      '0:hub-apps',
      '1:platform-apps',
      '2:cert-manager',
      '1:tenants',
      '2:deleted-space',
      '2:team-a',
    ]);
    const closed = treeRows(graph, (id) => id !== 'id-tenants');
    expect(closed.map((row) => row.id)).toEqual(['id-hub-apps', 'id-platform-apps', 'id-cert-manager', 'id-tenants']);
    expect(closed.find((row) => row.id === 'id-tenants')?.open).toBe(false);
    expect(treeRows(graph, () => false).map((row) => row.id)).toEqual(['id-hub-apps']);
  });

  test('a match is shown under the Spaces that deliver it, whatever is closed', () => {
    const shown = withAncestors(graph, ['id-team-a']);
    expect([...shown].sort()).toEqual(['id-hub-apps', 'id-team-a', 'id-tenants']);
    expect(treeRows(graph, () => false, shown).map((row) => row.id)).toEqual(['id-hub-apps', 'id-tenants', 'id-team-a']);
    expect(withAncestors(graph, ['id-lonely']).size).toBe(0);
  });

  test('descendants, parents, and the address of a Space on the page', () => {
    expect(descendantIds(graph, 'id-hub-apps')).toHaveLength(5);
    expect(descendantIds(graph, 'id-cert-manager')).toEqual([]);
    expect(parentIds(graph).get('id-team-a')).toBe('id-tenants');
    expect(nodeIdOfSlug(graph, 'tenants')).toBe('id-tenants');
    expect(nodeIdOfSlug(graph, 'lonely')).toBeUndefined();
    expect(deliveryHref('team a')).toBe('/gitops?space=team%20a');
  });
});

test('stackChildren stacks the stackable children once there are enough of them', () => {
  const healthy = new Set(['a', 'b', 'c', 'd', 'e']);
  const children = ['a', 'b', 'x', 'c', 'd', 'e', 'y'];
  expect(stackChildren(children, (id) => healthy.has(id))).toEqual({ cards: ['x', 'y'], stacked: ['a', 'b', 'c', 'd', 'e'] });
  expect(stackChildren(children, (id) => healthy.has(id) && id !== 'e')).toEqual({ cards: children, stacked: [] });
  expect(stackChildren(['a', 'b', 'x'], (id) => healthy.has(id), 2)).toEqual({ cards: ['x'], stacked: ['a', 'b'] });
  expect(stackChildren([], () => true)).toEqual({ cards: [], stacked: [] });
});

test('groupByTarget puts each tree under the Target its root releases to', () => {
  const on = (slug: string, target: string | null): DeliverySpace => ({ spaceId: `id-${slug}`, slug, releaseTargetId: target });
  const graph = buildDeliveryGraph(
    [app('prod-apps', 'root', 'prod-apps'), app('prod-apps', 'web', 'web'), app('dev-apps', 'api', 'api'), app('loose', 'job', 'job')],
    [on('prod-apps', 't-prod'), on('web', 't-prod'), on('dev-apps', null), on('api', 't-dev'), on('loose', null), on('job', null), on('forgotten', 't-prod'), on('elsewhere', 't-none')],
  );
  const groups = groupByTarget(graph);
  expect(groups.map((g) => [g.targetId, g.roots, g.undelivered.map((s) => s.slug)])).toEqual([
    // A root with no release Target goes by the first Space below it that has one.
    ['t-dev', ['id-dev-apps'], []],
    [undefined, ['id-loose'], []],
    // A Space released to a Target with no tree, `elsewhere`, is in no group.
    ['t-prod', ['id-prod-apps'], ['forgotten']],
  ]);
});

test.describe('Flux', () => {
  const spaces: DeliverySpace[] = [
    { spaceId: 'apps', slug: 'edge-apps' },
    { spaceId: 'shop', slug: 'shop' },
  ];
  const repository = (name: string, slug: string, spaceId = 'apps'): DeliveryResource => ({
    resourceId: `repo-${name}`,
    spaceId,
    unitId: `unit-${name}`,
    unitSlug: name,
    resourceType: 'source.toolkit.fluxcd.io/v1/OCIRepository',
    resourceName: `flux-system/${name}`,
    data: { kind: 'OCIRepository', spec: { url: `oci://hub.example.com/space/${slug}` } },
  });
  const kustomization = (name: string, sourceRef: Record<string, string>, spaceId = 'apps'): DeliveryResource => ({
    resourceId: `ks-${name}`,
    spaceId,
    unitId: `unit-${name}`,
    unitSlug: name,
    resourceType: 'kustomize.toolkit.fluxcd.io/v1/Kustomization',
    resourceName: `flux-system/${name}`,
    data: { kind: 'Kustomization', spec: { sourceRef, targetNamespace: 'shop' } },
  });

  test('a Kustomization deploys the Space its OCIRepository pulls', () => {
    const resources = [repository('shop', 'shop'), kustomization('shop', { kind: 'OCIRepository', name: 'shop' })];
    const deliveries = deliveriesOf(resources, spaces);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      resourceId: 'ks-shop',
      kind: 'Flux Kustomization',
      name: 'shop',
      toSlug: 'shop',
      toSpaceId: 'shop',
      sourceUrl: 'oci://hub.example.com/space/shop',
      destination: 'namespace shop',
    });
    expect(deliveries[0].documentIds).toEqual(['repo-shop', 'ks-shop']);
  });

  test('an OCIRepository no Kustomization applies is a delivery of its own', () => {
    const deliveries = deliveriesOf([repository('shop', 'shop')], spaces);
    expect(deliveries.map((d) => [d.kind, d.toSlug])).toEqual([['Flux OCIRepository', 'shop']]);
  });

  test('a Kustomization is joined only to an OCIRepository of its own Space and the namespace it names', () => {
    const elsewhere = [repository('shop', 'shop', 'shop'), kustomization('shop', { kind: 'OCIRepository', name: 'shop' })];
    expect(deliveriesOf(elsewhere, spaces).map((d) => d.kind)).toEqual(['Flux OCIRepository']);
    const otherNamespace = [repository('shop', 'shop'), kustomization('shop', { kind: 'OCIRepository', name: 'shop', namespace: 'other' })];
    expect(deliveriesOf(otherNamespace, spaces).map((d) => d.kind)).toEqual(['Flux OCIRepository']);
    const gitSource = [repository('shop', 'shop'), kustomization('shop', { kind: 'GitRepository', name: 'shop' })];
    expect(deliveriesOf(gitSource, spaces).map((d) => d.kind)).toEqual(['Flux OCIRepository']);
  });
});
