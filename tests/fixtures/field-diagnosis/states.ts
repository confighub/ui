// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field-diagnosis test states (PLAN.md "the 6 states" plus the edge states), as the server
// returns them. The reports are real `cub unit path ... -o json` answers from the fd-* seed
// (2026-11-19, docs/design/field-diagnosis/contract/fixtures). The few derived states say what
// was changed and why.
import type { BlameField, UnitPathReport } from '@confighub/rtk-query';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'reports');

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T;
}

/** The ids of the fd-* seed on the owner's server (section 5 of the contract). */
export const SEED = {
  baseSpaceId: '352eba82-28cf-4632-bda9-3c327bb2f0a2',
  stagingSpaceId: 'd5298d52-1cf6-4eca-8a62-67df2ae7be90',
  prodSpaceId: '8bd0ae8d-bf49-4919-9e50-4ac0e0f48797',
  baseWebId: '45d003a7-bd17-42aa-9b12-fcebd2274e6a',
  stagingWebId: '53c8abe4-d2dc-4f60-b2a6-3d835d9588c4',
  prodWebId: 'ef5f242e-4632-4d52-80e6-86e892afbb06',
  prodNsId: '8822a6b3-71af-4390-8662-ea007104d550',
  noRootUserTriggerId: '48d50b37-6303-4b38-8dfb-5911b0dcb1df',
  /** fd-prod/web's UpstreamRevisionNum (`cub unit get --space fd-prod web`). */
  prodUpstreamRevisionNum: 3,
} as const;

/** s1-plain: fd-base/web spec.replicas 7, set in this Unit, nothing waits. */
export const plain = (): UnitPathReport => load('plain.json');

/** s2-inherited: fd-prod/web metadata.labels.app, cloned through fd-staging from fd-base. */
export const inherited = (): UnitPathReport => load('inherited.json');

/** s5-override: fd-prod/web spec.replicas 5, Override guard, upstream change 7 withheld. */
export const override = (): UnitPathReport => load('override.json');

/** s6-requirement: fd-prod/web runAsUser 0 with the RunAsRoot requirement guard. */
export const requirement = (): UnitPathReport => load('requirement.json');

/**
 * s6 with a per-path gate. Derived: vet-celexpr reports no path, so the server never builds this
 * entry for the seed; the Validation entry is given the real no-root-user Trigger's id and the
 * field's path, as a function that returns FailedAttributes would make it.
 */
export function gatePath(): UnitPathReport {
  const report = load<UnitPathReport>('gate-path.json');
  const field = report.Field as BlameField;
  field.Validation = [
    {
      Gate: 'fd-prod/no-root-user/vet-celexpr',
      TriggerID: SEED.noRootUserTriggerId,
      Function: 'vet-celexpr',
      Path: field.Path,
      Issues: [{ Message: 'runAsUser must not be 0' }],
    },
  ];
  return report;
}

/** link-set: fd-prod/web metadata.namespace, set by the NeedsProvides Link web-to-ns from fd-prod/ns. */
export const linkSet = (): UnitPathReport => load('link-set.json');

/** overflow: the image, the longest leaf of the Component (38 characters). */
export const longest = (): UnitPathReport => load('longest.json');

/** s8-pending: fd-staging/web spec.replicas 7, upgraded from fd-base; the pane holds an edit 9. */
export const pending = (): UnitPathReport => load('pending.json');
export const PENDING_VALUE = '9';

/** s12-many: four needs at once (derived from the spike's s12 state over a real report). */
export const many = (): UnitPathReport => load('many.json');

/** The whole-unit blame of fd-prod/web (`cub unit blame --space fd-prod web -o json`). */
export const prodWebBlame = (): BlameField[] => load('blame-prod-web.json');

/** fd-prod/web's configuration (`cub unit data --space fd-prod web`). */
export const prodWebYaml = (): string => readFileSync(join(DIR, 'prod-web.yaml'), 'utf8');

/** The blame field of fd-prod/web at `path`. */
export function prodWebField(path: string): BlameField {
  const field = prodWebBlame().find((f) => f.Path === path);
  if (!field) throw new Error(`no blame field ${path} in fd-prod/web`);
  return field;
}
