// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Which shape draws a block: an ordered list, first match wins, the generic key and value
// shape last. Every Kubernetes shape is gated on the resource kind AND the part kind, so a
// custom resource with `image`, `resources` or `env` keys falls to the generic shape.
// No React here, so the order and the matches are checked by a pure spec; `registry.ts`
// puts a renderer on each entry.
import type { PartKind } from '../specSheetModel';

export type ShapeId =
  | 'image'
  | 'command'
  | 'ports'
  | 'env'
  | 'resources'
  | 'probes'
  | 'mounts'
  | 'security'
  | 'volumes'
  | 'tokens'
  | 'pairs'
  | 'key-value';

export interface ShapeContext {
  resourceKind?: string;
  partKind: PartKind;
  blockKey: string;
}

export interface ShapeMatcher {
  id: ShapeId;
  match: (ctx: ShapeContext) => boolean;
}

/** The kinds whose Pod template (or Pod spec) the model splits into Pod, containers and volumes. */
export const WORKLOAD_KINDS: ReadonlySet<string> = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
  'Job',
  'Pod',
]);

const isWorkload = (ctx: ShapeContext) =>
  ctx.resourceKind !== undefined && WORKLOAD_KINDS.has(ctx.resourceKind);
const inContainer = (ctx: ShapeContext) =>
  isWorkload(ctx) && (ctx.partKind === 'container' || ctx.partKind === 'init');
const containerBlock = (key: string) => (ctx: ShapeContext) =>
  inContainer(ctx) && ctx.blockKey === key;

/** Maps of a workload's spec drawn as inline pairs. */
const SPEC_PAIRS = new Set([
  'strategy',
  'updateStrategy',
  'persistentVolumeClaimRetentionPolicy',
]);

export const SHAPE_MATCHERS: readonly ShapeMatcher[] = [
  { id: 'image', match: containerBlock('image') },
  { id: 'command', match: containerBlock('command') },
  {
    id: 'ports',
    // A container's ports, and a Service's.
    match: (ctx) => containerBlock('ports')(ctx) || (ctx.resourceKind === 'Service' && ctx.partKind === 'spec' && ctx.blockKey === 'ports'),
  },
  { id: 'env', match: containerBlock('env') },
  { id: 'resources', match: containerBlock('resources') },
  { id: 'probes', match: containerBlock('probes') },
  { id: 'mounts', match: containerBlock('mounts') },
  {
    id: 'security',
    match: (ctx) =>
      ctx.blockKey === 'security' &&
      (inContainer(ctx) || (isWorkload(ctx) && ctx.partKind === 'pod')),
  },
  {
    id: 'volumes',
    match: (ctx) =>
      isWorkload(ctx) && ctx.partKind === 'volumes' && ctx.blockKey === 'volumes',
  },
  {
    id: 'tokens',
    match: (ctx) =>
      // Labels and annotations of any resource's metadata.
      (ctx.partKind === 'metadata' &&
        (ctx.blockKey === 'labels' || ctx.blockKey === 'annotations')) ||
      (isWorkload(ctx) &&
        ((ctx.partKind === 'pod' &&
          ['labels', 'annotations', 'scheduling', 'nodeSelector'].includes(ctx.blockKey)) ||
          (ctx.partKind === 'spec' && ctx.blockKey === 'selector'))) ||
      (ctx.resourceKind === 'Service' && ctx.partKind === 'spec' && ctx.blockKey === 'selector') ||
      // A PodDisruptionBudget selects Pods as a workload does: app=openclaw.
      (ctx.resourceKind === 'PodDisruptionBudget' && ctx.partKind === 'spec' && ctx.blockKey === 'selector'),
  },
  {
    id: 'pairs',
    match: (ctx) => isWorkload(ctx) && ctx.partKind === 'spec' && SPEC_PAIRS.has(ctx.blockKey),
  },
  { id: 'key-value', match: () => true },
];

/** The id of the shape that draws a block: the first that matches. */
export function shapeIdFor(ctx: ShapeContext): ShapeId {
  return (
    SHAPE_MATCHERS.find((s) => s.match(ctx)) ?? SHAPE_MATCHERS[SHAPE_MATCHERS.length - 1]
  ).id;
}
