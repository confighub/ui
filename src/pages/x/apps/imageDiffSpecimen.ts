// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A worked release comparison for the design-system specimen.
 *
 * The diffs below are what the server's diff returns, read with `include=Context`, for a
 * release that bumps a Deployment's images and edits an Ingress: the same shape the
 * Releases pane receives in production, so the specimen exercises the panel's own split
 * of a diff into image rows and tree rows rather than a list made up for the renderer.
 *
 * Every container below earns its place by being a different KIND of move. The one that
 * does not move is the important one: the server returns it only as context, one entry
 * holding the container's block, which is the case most likely to go unrendered.
 */

import type { PathChange, PathSegment, ResourceDiff } from '@confighub/rtk-query';

import { segmentLabel } from '@/components/config-diff/configDiffTree';

import type { ReleaseDiffUnitView } from './ReleaseDiffPanel';

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const container = (name: string, index: number): PathSegment => ({
  MergeKeys: [{ Key: 'name', Value: name }],
  FromIndex: index,
  ToIndex: index,
});
const podSpec = (list: 'containers' | 'initContainers', name: string, index: number): PathSegment[] =>
  [field('spec'), field('template'), field('spec'), field(list), container(name, index)];

function changeAt(segments: PathSegment[], change: Omit<PathChange, 'Segments' | 'DisplayPath'>): PathChange {
  const displayPath = segments.map(segmentLabel).join('.');
  return { Path: displayPath, DisplayPath: displayPath, Segments: segments, ...change };
}

const update = (segments: PathSegment[], from: string, to: string, dataType = 'string'): PathChange =>
  changeAt(segments, { ChangeType: 'Update', FromValue: from, ToValue: to, FromDataType: dataType, ToDataType: dataType });

const context = (segments: PathSegment[], value: string, dataType = 'string'): PathChange =>
  changeAt(segments, { ChangeType: 'None', ToValue: value, ToDataType: dataType });

/** A container that moved: its name as context, its image as the change. */
function movedImage(list: 'containers' | 'initContainers', name: string, index: number, from: string, to: string): PathChange[] {
  const element = podSpec(list, name, index);
  return [context([...element, field('name')], name), update([...element, field('image')], from, to)];
}

const checkout: ResourceDiff = {
  Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: '/checkout', ResourceNameWithoutScope: 'checkout' },
  ChangeType: 'Update',
  Changes: [
    context([field('apiVersion')], 'apps/v1'),
    context([field('kind')], 'Deployment'),
    context([field('metadata')], 'name: checkout', 'YAML'),
    update([field('spec'), field('replicas')], '3', '4', 'int'),
    ...movedImage('initContainers', 'db-migrate', 0, 'ghcr.io/confighubai/checkout:v1.4.2', 'ghcr.io/confighubai/checkout:v1.4.3'),
    ...movedImage('containers', 'api', 0, 'ghcr.io/confighubai/checkout:v1.4.2', 'ghcr.io/confighubai/checkout:v1.4.3'),
    update([...podSpec('containers', 'api', 0), field('resources'), field('limits'), field('memory')], '256Mi', '512Mi'),
    // Stays exactly where it was while every neighbour moves.
    context(podSpec('containers', 'log-shipper', 1), 'name: log-shipper\nimage: "ghcr.io/confighubai/log-shipper:v2.3.1"', 'YAML'),
    // No registry host at all — the repository is printed as-is.
    ...movedImage('containers', 'otel', 2, 'otel/opentelemetry-collector-contrib:0.104.0', 'otel/opentelemetry-collector-contrib:0.112.0'),
    ...movedImage('containers', 'gateway', 3, 'ghcr.io/confighubai/gateway:v1.9.2', 'ghcr.io/confighubai/gateway:v2.0.0'),
    // Same tag on both sides; only the digest moves.
    ...movedImage(
      'containers',
      'cache',
      4,
      'redis:7.4.1-alpine@sha256:4f2ad1c9e0b37a5c8d1e6f04b2c9a7e3',
      'redis:7.4.1-alpine@sha256:9c81b4ef2d60a7139f5c2b8ae04d16b7',
    ),
    // Identical tag, different registry — invisible unless the row says so.
    ...movedImage('containers', 'envoy', 5, 'ghcr.io/confighubai/envoy:v1.30.0', 'quay.io/confighubai/envoy:v1.30.0'),
    // A calendar tag: no magnitude to rank.
    ...movedImage('containers', 'docs', 6, 'ghcr.io/confighubai/docs:2026-09-13.1a4f', 'ghcr.io/confighubai/docs:2026-09-16.9c02'),
  ],
};

/** A workload with no containers at all, so the tree still has to earn its place. */
const edge: ResourceDiff = {
  Resource: { ResourceType: 'networking.k8s.io/v1/Ingress', ResourceName: '/edge', ResourceNameWithoutScope: 'edge' },
  ChangeType: 'Update',
  Changes: [
    context([field('apiVersion')], 'networking.k8s.io/v1'),
    context([field('kind')], 'Ingress'),
    context([field('metadata'), field('name')], 'edge'),
    update([field('metadata'), field('annotations'), field('nginx.ingress.kubernetes.io/proxy-body-size')], '8m', '32m'),
    context([field('spec'), field('rules'), { FromIndex: 0, ToIndex: 0 }, field('host')], 'checkout.example.com'),
    update(
      [field('spec'), field('rules'), { FromIndex: 0, ToIndex: 0 }, field('http'), field('paths'), { FromIndex: 0, ToIndex: 0 }, field('pathType')],
      'Exact',
      'Prefix',
    ),
  ],
};

function unitView(unitId: string, slug: string, resource: ResourceDiff): ReleaseDiffUnitView {
  const changes = (resource.Changes ?? []).filter((change) => change.ChangeType !== 'None').length;
  return { unitId, slug, result: { diff: { Resources: [resource] }, changes, added: false } };
}

/** The specimen's units, in display order. */
export const IMAGE_DIFF_SPECIMEN_UNITS: ReleaseDiffUnitView[] = [
  unitView('specimen-checkout', 'checkout', checkout),
  unitView('specimen-edge', 'edge', edge),
];
