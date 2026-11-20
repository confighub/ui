// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A view narrowed by label selector to what one resource selects, or to what selects it. The
 * server matches as Kubernetes does, in the resource's namespace on its cluster.
 */
export interface SelectorMatch {
  /**
   * selectedBy: the workloads whose pods the resource's selector selects. selecting: the
   * NetworkPolicies, PodDisruptionBudgets and Services whose selectors select the resource's pods.
   */
  direction: 'selectedBy' | 'selecting';
  resourceId: string;
  /** The resource's type and name, and its Unit as space/unit, to say what the view is narrowed to. */
  resourceType: string;
  resourceName: string;
  unit: string;
}

/** Whether a value read from a URL is a whole SelectorMatch, so a hand-edited one is not sent. */
export const isSelectorMatch = (value: unknown): value is SelectorMatch => {
  const match = value as Partial<SelectorMatch> | undefined;
  return (
    !!match &&
    (match.direction === 'selectedBy' || match.direction === 'selecting') &&
    typeof match.resourceId === 'string' &&
    !!match.resourceId &&
    typeof match.resourceType === 'string' &&
    typeof match.resourceName === 'string' &&
    typeof match.unit === 'string'
  );
};

/** The types whose selectors the server matches against pods. */
const SELECTOR_TYPES: ReadonlySet<string> = new Set([
  'networking.k8s.io/v1/NetworkPolicy',
  'policy/v1/PodDisruptionBudget',
  'v1/Service',
]);

/**
 * The types the server reads pods' labels from: the workloads with a pod template in the SDK's
 * Kubernetes resource-type specs (k8skit.PodLabelsResourceTypes), and a bare Pod. The server
 * refuses any other, with a message the page shows.
 */
const WORKLOAD_TYPES: ReadonlySet<string> = new Set([
  'apps/v1/Deployment',
  'apps/v1/StatefulSet',
  'apps/v1/DaemonSet',
  'apps/v1/ReplicaSet',
  'batch/v1/Job',
  'batch/v1/CronJob',
  'v1/ReplicationController',
  'argoproj.io/v1alpha1/Rollout',
  'serving.knative.dev/v1/Service',
  'actions.github.com/v1alpha1/AutoscalingRunnerSet',
  'actions.github.com/v1alpha1/AutoscalingListener',
  'v1/Pod',
]);

/** Which way a resource can narrow a view by selector: none for a kind with no selector or pods. */
export const selectorMatchDirection = (
  resourceType: string,
  toolchainType: string | undefined,
): SelectorMatch['direction'] | undefined => {
  // The toolchain comes from the Units, which may not have loaded; until then, trust the type.
  if (toolchainType !== undefined && toolchainType !== 'Kubernetes/YAML') return undefined;
  if (SELECTOR_TYPES.has(resourceType)) return 'selectedBy';
  if (WORKLOAD_TYPES.has(resourceType)) return 'selecting';
  return undefined;
};

/** The kind of a [group/]version/kind resource type. */
const kindOf = (resourceType: string) => resourceType.slice(resourceType.lastIndexOf('/') + 1);

/** What the view is narrowed to, as the chip above the table says it. */
export const selectorMatchLabel = (match: SelectorMatch): string => {
  const resource = `${kindOf(match.resourceType)} ${match.resourceName} in ${match.unit}`;
  return match.direction === 'selectedBy'
    ? `Workloads selected by ${resource}`
    : `What selects the pods of ${resource}`;
};

/** The action that narrows the view, as the resource's panel offers it. */
export const selectorMatchAction = (direction: SelectorMatch['direction']): string =>
  direction === 'selectedBy' ? 'Show the workloads it selects' : 'Show what selects its pods';

/** The list parameters that narrow the server's read to the match. */
export const selectorMatchParams = (
  match: SelectorMatch | undefined,
): { selectedBy?: string; selecting?: string } =>
  !match
    ? {}
    : match.direction === 'selectedBy'
      ? { selectedBy: match.resourceId }
      : { selecting: match.resourceId };
