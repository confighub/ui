// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Views and rows for the View Explorer's pure specs: thirteen views that
 * cover every entity, layout and lens kind (hidden and Custom WHERE lenses
 * too), and a deterministic set of fake rows. No server is involved.
 */
import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { defaultViewDef } from '../../src/pages/x/view-explorer/model/fields';
import type {
  EntityKind,
  Lens,
  LensSpec,
  ViewDef,
} from '../../src/pages/x/view-explorer/model/types';

let nextId = 0;

/** A lens with a fresh id, typed as the kind of lens the spec is. */
export function lens<S extends LensSpec>(
  spec: S,
  enabled = true,
): S & Pick<Lens, 'id' | 'enabled'> {
  nextId++;
  return { ...spec, id: `l${nextId}`, enabled };
}

/** An id generator for code under test, counting from 1 with a prefix. */
export function idGen(prefix = 'g'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function view(entity: EntityKind, patch: Partial<ViewDef>): ViewDef {
  return { ...defaultViewDef(entity), ...patch };
}

export interface SeedView {
  name: string;
  def: ViewDef;
}

/** Views with every entity, layout, lens kind, multi-level grouping and hidden lenses. */
export function seedViews(): SeedView[] {
  return [
    { name: 'All units', def: view('Unit', {}) },
    {
      name: 'Unreleased changes',
      def: view('Unit', {
        lenses: [lens({ kind: 'status', status: 'unreleased' })],
        groupBy: ['Space'],
      }),
    },
    {
      name: 'Upgrades waiting',
      def: view('Unit', {
        lenses: [lens({ kind: 'status', status: 'upgradable' })],
        groupBy: ['UpstreamSpaceSlug'],
        sort: { column: 'Slug', dir: 'ASC' },
        layout: 'table',
        columns: [
          'Slug',
          'Space',
          'UpstreamUnitSlug',
          'HeadRevisionNum',
          'Status',
          'UpdatedAt',
        ].map((name) => ({ name })),
      }),
    },
    {
      name: 'Payments prod',
      def: view('Unit', {
        lenses: [
          lens({ kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] }),
          lens(
            { kind: 'field', field: 'ToolchainType', op: 'is', values: ['Kubernetes/YAML'] },
            false,
          ),
        ],
        groupBy: ['Status'],
        sort: { column: 'Slug', dir: 'ASC' },
        layout: 'board',
      }),
    },
    {
      name: 'Fleet matrix',
      def: view('Unit', {
        lenses: [lens({ kind: 'field', field: 'Labels.env', op: 'isNot', values: ['dev'] })],
        sort: null,
        layout: 'matrix',
        matrix: { rows: 'Space', cols: 'Target' },
      }),
    },
    {
      name: 'Not targeted',
      def: view('Unit', {
        lenses: [lens({ kind: 'status', status: 'untargeted' })],
        sort: { column: 'Space', dir: 'ASC' },
      }),
    },
    {
      name: 'Space health',
      def: view('Space', { sort: { column: 'UnreleasedUnitCount', dir: 'DESC' } }),
    },
    {
      name: 'Deployments',
      def: view('Resource', {
        lenses: [
          lens({
            kind: 'field',
            field: 'ResourceType',
            op: 'is',
            values: ['apps/v1/Deployment'],
          }),
        ],
        groupBy: ['Space.Slug'],
        sort: null,
      }),
    },
    {
      name: 'Stale in prod',
      def: view('Unit', {
        lenses: [
          lens({ kind: 'field', field: 'Labels.env', op: 'is', values: ['prod'] }),
          lens({
            kind: 'field',
            field: 'UpdatedAt',
            op: 'lt',
            values: ['2026-09-21T00:00:00Z'],
          }),
          lens({ kind: 'status', status: 'released' }, false),
        ],
        groupBy: ['Space'],
        sort: { column: 'UpdatedAt', dir: 'ASC' },
      }),
    },
    {
      name: 'OpenTofu infra',
      def: view('Unit', {
        lenses: [
          lens({ kind: 'field', field: 'ToolchainType', op: 'is', values: ['OpenTofu/HCL'] }),
        ],
        groupBy: ['Target'],
        sort: null,
        layout: 'table',
      }),
    },
    {
      name: 'Checkout fleet',
      def: view('Unit', {
        lenses: [
          lens({ kind: 'field', field: 'Space', op: 'matches', values: ['checkout-*'] }),
          lens({ kind: 'custom', where: "Slug ~ '^cart'" }),
          lens({ kind: 'field', field: 'Target', op: 'notEmpty', values: [] }),
        ],
        groupBy: ['Space', 'Target'],
        sort: null,
      }),
    },
    {
      name: 'AppConfig files',
      def: view('Unit', {
        lenses: [
          lens({
            kind: 'field',
            field: 'ToolchainType',
            op: 'is',
            values: ['AppConfig/Properties'],
          }),
        ],
        groupBy: ['Space'],
        sort: null,
      }),
    },
    {
      name: 'EU workloads',
      def: view('Unit', {
        lenses: [
          lens({
            kind: 'field',
            field: 'Labels.region',
            op: 'is',
            values: ['eu-west-1', 'eu-central-1'],
          }),
          lens({ kind: 'field', field: 'Labels.tier', op: 'isNot', values: ['config'] }),
          lens({ kind: 'field', field: 'HeadRevisionNum', op: 'gte', values: ['3'] }),
        ],
        groupBy: ['Space'],
        sort: null,
      }),
    },
  ];
}

/** A small deterministic random source, so failures reproduce. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SPACES = [
  'payments-prod',
  'payments-staging',
  'checkout-dev',
  'checkout-prod',
  'platform-infra',
];
const TARGETS = ['prod-us-east-1', 'prod-eu-west-1', 'staging-us-east-1', 'dev-kind'];
const TOOLCHAINS = ['Kubernetes/YAML', 'OpenTofu/HCL', 'AppConfig/Properties'];
const ENVS = ['prod', 'staging', 'dev'];
const REGIONS = ['us-east-1', 'eu-west-1', 'eu-central-1'];
const TIERS = ['api', 'web', 'worker', 'config'];
const APPS = ['cart', 'pricing', 'ledger', 'fraud', 'grafana', 'vpc'];

/** Fake Units with Space, Target, labels, revisions and upstreams; some values missing. */
export function fakeUnits(count: number, seed = 7): ExtendedUnitRead[] {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const rows: ExtendedUnitRead[] = [];
  for (let i = 0; i < count; i++) {
    const space = pick(SPACES);
    const hasTarget = r() > 0.2;
    const target = hasTarget ? pick(TARGETS) : undefined;
    const head = 1 + Math.floor(r() * 30);
    const released = r() < 0.4 ? Math.max(0, head - 1 - Math.floor(r() * 3)) : head;
    const hasUpstream = r() < 0.4;
    const upstreamRev = hasUpstream ? 1 + Math.floor(r() * 10) : 0;
    const upstreamHead = hasUpstream
      ? upstreamRev + (r() < 0.5 ? Math.floor(r() * 3) : 0)
      : undefined;
    const labels: Record<string, string> = { app: pick(APPS) };
    if (r() > 0.15) labels.env = pick(ENVS);
    if (r() > 0.3) labels.region = pick(REGIONS);
    if (r() > 0.25) labels.tier = pick(TIERS);
    const day = 1 + Math.floor(r() * 28);
    rows.push({
      Unit: {
        UnitID: `u${i}`,
        Slug: `${labels.app}-${i}`,
        SpaceID: `s-${space}`,
        TargetID: target ? `t-${target}` : undefined,
        ToolchainType: pick(TOOLCHAINS),
        HeadRevisionNum: head,
        LastReleasedRevisionNum: hasTarget ? released : 0,
        UpstreamRevisionNum: upstreamRev,
        UpstreamUnitID: hasUpstream ? `up${i}` : undefined,
        UpstreamSpaceID: hasUpstream ? `s-${pick(SPACES)}` : undefined,
        Labels: labels,
        UpdatedAt: `2026-${r() < 0.5 ? '09' : '10'}-${String(day).padStart(2, '0')}T12:00:00Z`,
      },
      Space: { Slug: space, SpaceID: `s-${space}` },
      Target: target ? { Slug: target, TargetID: `t-${target}` } : undefined,
      UpstreamUnit: hasUpstream
        ? { Slug: `up-${i}`, ToolchainType: 'Kubernetes/YAML', HeadRevisionNum: upstreamHead }
        : undefined,
      UpstreamSpace: hasUpstream ? { Slug: pick(SPACES) } : undefined,
    });
  }
  return rows;
}

export const unitId = (row: ExtendedUnitRead): string => row.Unit?.UnitID ?? '';
