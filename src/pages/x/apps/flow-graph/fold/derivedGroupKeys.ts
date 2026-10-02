// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentDeployment, ReleaseAge } from '../../componentTypes';
import {
  K8S_GROUP_KEY,
  PROVIDER_GROUP_KEY,
  RELEASED_GROUP_KEY,
  REVISION_GROUP_KEY,
} from './foldConstants';

/**
 * What puts a member in a stack under one Group by key.
 * - `value`: what members of one stack share; it is also part of the stack id.
 * - `label`: the name the stack shows.
 * - `rank`: the place of the stack in its fold, low first. Cells with the
 *   same rank sort A-Z by label.
 */
export interface GroupCell {
  value: string;
  label: string;
  rank: number;
}

/**
 * A Group by key that the graph derives from each Deployment, not a Space
 * label. Its key starts with `@`, so it cannot be the same as a label key. It
 * is offered by the same rule as a label key, but it is never the default:
 * the default is the label a team named its Deployments by.
 */
export interface DerivedGroupKey {
  key: string;
  /** The menu, the Group by button and the fold header tooltip show this. */
  label: string;
  /**
   * Lower case, except a proper name: "1 upstream revision", "1 Kubernetes
   * version", in the fold header count.
   */
  noun: string;
  /** As `noun`: "Other upstream revisions", "4 Kubernetes versions, 1 each". */
  plural: string;
  /** The name of the stack of members with no value; it is always last. */
  noValueLabel: string;
  /** The member's cell, or null for no value. */
  cell: (m: ComponentDeployment) => GroupCell | null;
}

/**
 * How far a Deployment is behind its upstream Base, in revisions: the most
 * that any of its Units is behind (upstream head minus the revision it
 * merged), the number the Stale chip shows. Up to date first, then the gap
 * from small to large, so the stacks read as a queue for Upgrade. A
 * Deployment with no upstream has nothing to be behind and goes last.
 */
export function revisionCell(m: ComponentDeployment): GroupCell | null {
  if (m.parentDeploymentId === null) return null;
  const behind = m.staleRevisionsBehind ?? 0;
  if (behind <= 0) return { value: '0', label: 'Up to date', rank: 0 };
  return {
    value: String(behind),
    label: behind === 1 ? '1 revision behind' : `${behind} revisions behind`,
    rank: behind,
  };
}

export const REVISION_GROUP: DerivedGroupKey = {
  key: REVISION_GROUP_KEY,
  label: 'Upstream revision',
  noun: 'upstream revision',
  plural: 'upstream revisions',
  noValueLabel: 'No upstream',
  cell: revisionCell,
};

/**
 * The value of a Target fact: `knownKey` exactly, else the first fact (A-Z by
 * key) whose key ends in `suffix` and has a value, so a custom fact with
 * another prefix (a Space's own naming, not `Cluster.` or `Cloud.`) still
 * counts. Empty is no value. Shared by every derived key that reads a Target
 * fact, so each one only names its own fact and its own fallback suffix.
 */
export function targetFactValue(
  facts: Readonly<Record<string, string>> | undefined,
  knownKey: string,
  suffix: string,
): string | null {
  if (!facts) return null;
  const known = facts[knownKey]?.trim();
  if (known) return known;
  const key = Object.keys(facts)
    .filter((k) => k.endsWith(suffix) && facts[k]?.trim())
    .sort()[0];
  return key === undefined ? null : facts[key].trim();
}

/** The Target fact that fact collection writes the cluster's version to. */
export const K8S_VERSION_FACT = 'Cluster.KubernetesVersion';

/**
 * The Kubernetes version in a Target's Facts: `Cluster.KubernetesVersion`,
 * else the first fact (A-Z by key) whose key ends in `KubernetesVersion`, so
 * a custom fact with another prefix still counts. Empty is no version.
 */
export function kubernetesVersionFact(
  facts: Readonly<Record<string, string>> | undefined,
): string | null {
  return targetFactValue(facts, K8S_VERSION_FACT, 'KubernetesVersion');
}

/** The rank of a value that is not a version: after every version. */
const K8S_UNPARSED_RANK = Number.MAX_SAFE_INTEGER;

/**
 * The Kubernetes version of a Deployment's Target, to the minor version
 * ("v1.31.2" and "1.31.4" both are "1.31"): a stack is the clusters that
 * serve the same Kubernetes API, and patch levels would split them into
 * stacks of one. Stacks sort as versions, oldest first. A value that is not a
 * version keeps its text and goes after the versions. A Deployment whose
 * Target has no version fact goes last.
 */
export function kubernetesVersionCell(m: ComponentDeployment): GroupCell | null {
  const raw = kubernetesVersionFact(m.targetFacts);
  if (raw === null) return null;
  const match = /^v?(\d+)\.(\d+)/i.exec(raw);
  if (!match) return { value: raw, label: raw, rank: K8S_UNPARSED_RANK };
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const value = `${major}.${minor}`;
  // 1.9 before 1.10, which an A-Z sort gets wrong. A minor is below 1000, so
  // major * 1000 + minor keeps the order of both.
  return { value, label: value, rank: major * 1000 + minor };
}

export const K8S_GROUP: DerivedGroupKey = {
  key: K8S_GROUP_KEY,
  label: 'Kubernetes version',
  noun: 'Kubernetes version',
  plural: 'Kubernetes versions',
  noValueLabel: 'No version',
  cell: kubernetesVersionCell,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long before `now` a Release made at `createdAt` was: "today" from local
 * midnight (a Release a little in the future, from clock skew, is today too),
 * else "week" within 7 days, "month" within 30 days, else "older". Undefined
 * for no time, or a time that does not parse.
 */
export function releaseAge(
  createdAt: string | undefined,
  now: number,
): ReleaseAge | undefined {
  if (!createdAt) return undefined;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return undefined;
  if (at >= new Date(now).setHours(0, 0, 0, 0)) return 'today';
  const age = now - at;
  if (age < 7 * DAY_MS) return 'week';
  if (age < 30 * DAY_MS) return 'month';
  return 'older';
}

/**
 * The Deployments with the `releaseAge` of their latest published Release,
 * all read against one `now`. A Deployment with no Release keeps its object,
 * and with no Releases at all the same array comes back, so a graph with no
 * Releases does not build its fold again when the clock moves.
 */
export function withReleaseAges(
  deployments: readonly ComponentDeployment[],
  latestReleaseBySpaceId: ReadonlyMap<string, { createdAt?: string }> | undefined,
  now: number,
): readonly ComponentDeployment[] {
  if (!latestReleaseBySpaceId || latestReleaseBySpaceId.size === 0) return deployments;
  return deployments.map((d) => {
    const age = releaseAge(latestReleaseBySpaceId.get(d.deploymentId)?.createdAt, now);
    return age === undefined ? d : { ...d, releaseAge: age };
  });
}

const RELEASE_AGE_CELLS: Readonly<Record<ReleaseAge, GroupCell>> = {
  today: { value: 'today', label: 'Today', rank: 0 },
  week: { value: 'week', label: 'This week', rank: 1 },
  month: { value: 'month', label: 'This month', rank: 2 },
  older: { value: 'older', label: 'Older', rank: 3 },
};

/**
 * The bucket of a Deployment's latest Release, newest first, so the first
 * stacks are what changed last. A Deployment never released goes last.
 */
export function releasedCell(m: ComponentDeployment): GroupCell | null {
  return m.releaseAge ? { ...RELEASE_AGE_CELLS[m.releaseAge] } : null;
}

export const RELEASED_GROUP: DerivedGroupKey = {
  key: RELEASED_GROUP_KEY,
  label: 'Last released',
  noun: 'release time',
  plural: 'release times',
  noValueLabel: 'Never released',
  cell: releasedCell,
};

/** The Target fact that fact collection writes the cloud provider to. */
export const PROVIDER_FACT = 'Cloud.Provider';

/**
 * The product name for a known cloud provider value, matched without regard
 * to case; a value ConfigHub does not know by name keeps its own text, so a
 * provider outside this list still groups, under whatever the fact says.
 */
const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  aws: 'AWS',
  gcp: 'Google Cloud',
  azure: 'Azure',
};

/**
 * The cloud provider in a Target's Facts: `Cloud.Provider`, else the first
 * fact (A-Z by key) whose key ends in `Provider`, so a custom fact with
 * another prefix still counts. Empty is no value.
 */
export function cloudProviderFact(
  facts: Readonly<Record<string, string>> | undefined,
): string | null {
  return targetFactValue(facts, PROVIDER_FACT, 'Provider');
}

/**
 * The cloud provider of a Deployment's Target: its product name for "aws",
 * "gcp" and "azure" (any case), else the fact's own text. Stacks sort A-Z by
 * that name (AWS, Azure, Google Cloud), which is already the meaningful
 * order; a Deployment whose Target has no provider fact goes last. The value
 * is the fact lower-cased, so "aws" and "AWS" share one stack.
 */
export function cloudProviderCell(m: ComponentDeployment): GroupCell | null {
  const raw = cloudProviderFact(m.targetFacts);
  if (raw === null) return null;
  const value = raw.toLowerCase();
  return { value, label: PROVIDER_DISPLAY_NAMES[value] ?? raw, rank: 0 };
}

export const PROVIDER_GROUP: DerivedGroupKey = {
  key: PROVIDER_GROUP_KEY,
  label: 'Cloud provider',
  noun: 'cloud provider',
  plural: 'cloud providers',
  noValueLabel: 'No provider',
  cell: cloudProviderCell,
};

/** The derived Group by keys, in the order the menu lists them after the labels. */
export const DERIVED_GROUP_KEYS: readonly DerivedGroupKey[] = [
  REVISION_GROUP,
  K8S_GROUP,
  RELEASED_GROUP,
  PROVIDER_GROUP,
];

/** The derived key for a Group by key, or undefined for a Space label key. */
export function derivedGroupKey(key: string): DerivedGroupKey | undefined {
  return DERIVED_GROUP_KEYS.find((d) => d.key === key);
}
