// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ComponentType } from 'react';

import { ArgoCDApplicationView } from './ArgoCDViews';
import { CertificateView, IssuerView } from './CertManagerViews';
import {
  ConfigMapView,
  HorizontalPodAutoscalerView,
  NamespaceView,
  PersistentVolumeClaimView,
  SecretView,
  ServiceAccountView,
  ServiceView,
} from './CoreViews';
import { ExternalSecretView, SecretStoreView } from './ExternalSecretsViews';
import {
  FluxAlertView,
  FluxKustomizationView,
  FluxSourceView,
  HelmReleaseView,
} from './FluxViews';
import { IngressView, NetworkPolicyView } from './NetworkingViews';
import { RoleBindingView, RoleView } from './RbacViews';
import { FriendlyViewProps } from './helpers';
import {
  IngressRouteTCPView,
  IngressRouteView,
  MiddlewareView,
  TraefikServiceView,
} from './TraefikViews';
import {
  CronJobView,
  DaemonSetView,
  DeploymentView,
  JobView,
  StatefulSetView,
} from './WorkloadViews';

/**
 * Friendly views are registered by `group/Kind` — deliberately ignoring the
 * API version so that e.g. autoscaling/v1 and autoscaling/v2 HPAs, or
 * traefik.io/v1alpha1 documents, all resolve. The explorer's ResourceType
 * strings are `apiVersion/Kind` (e.g. "apps/v1/Deployment", "v1/Service").
 */
const REGISTRY: Record<string, ComponentType<FriendlyViewProps>> = {
  // Core (empty group).
  Namespace: NamespaceView,
  Service: ServiceView,
  ConfigMap: ConfigMapView,
  Secret: SecretView,
  ServiceAccount: ServiceAccountView,
  PersistentVolumeClaim: PersistentVolumeClaimView,

  // Workloads.
  'apps/Deployment': DeploymentView,
  'apps/StatefulSet': StatefulSetView,
  'apps/DaemonSet': DaemonSetView,
  'batch/Job': JobView,
  'batch/CronJob': CronJobView,

  // Autoscaling.
  'autoscaling/HorizontalPodAutoscaler': HorizontalPodAutoscalerView,

  // RBAC.
  'rbac.authorization.k8s.io/Role': RoleView,
  'rbac.authorization.k8s.io/ClusterRole': RoleView,
  'rbac.authorization.k8s.io/RoleBinding': RoleBindingView,
  'rbac.authorization.k8s.io/ClusterRoleBinding': RoleBindingView,

  // Networking.
  'networking.k8s.io/Ingress': IngressView,
  'networking.k8s.io/NetworkPolicy': NetworkPolicyView,

  // ArgoCD.
  'argoproj.io/Application': ArgoCDApplicationView,

  // Flux.
  'helm.toolkit.fluxcd.io/HelmRelease': HelmReleaseView,
  'kustomize.toolkit.fluxcd.io/Kustomization': FluxKustomizationView,
  'source.toolkit.fluxcd.io/GitRepository': FluxSourceView,
  'source.toolkit.fluxcd.io/HelmRepository': FluxSourceView,
  'source.toolkit.fluxcd.io/HelmChart': FluxSourceView,
  'source.toolkit.fluxcd.io/OCIRepository': FluxSourceView,
  'source.toolkit.fluxcd.io/Bucket': FluxSourceView,
  'notification.toolkit.fluxcd.io/Alert': FluxAlertView,

  // cert-manager.
  'cert-manager.io/Certificate': CertificateView,
  'cert-manager.io/Issuer': IssuerView,
  'cert-manager.io/ClusterIssuer': IssuerView,

  // External Secrets Operator.
  'external-secrets.io/ExternalSecret': ExternalSecretView,
  'external-secrets.io/ClusterExternalSecret': ExternalSecretView,
  'external-secrets.io/SecretStore': SecretStoreView,
  'external-secrets.io/ClusterSecretStore': SecretStoreView,

  // Traefik — current group and the legacy containo.us group.
  'traefik.io/IngressRoute': IngressRouteView,
  'traefik.io/IngressRouteTCP': IngressRouteTCPView,
  'traefik.io/IngressRouteUDP': IngressRouteTCPView,
  'traefik.io/Middleware': MiddlewareView,
  'traefik.io/MiddlewareTCP': MiddlewareView,
  'traefik.io/TraefikService': TraefikServiceView,
  'traefik.containo.us/IngressRoute': IngressRouteView,
  'traefik.containo.us/IngressRouteTCP': IngressRouteTCPView,
  'traefik.containo.us/IngressRouteUDP': IngressRouteTCPView,
  'traefik.containo.us/Middleware': MiddlewareView,
  'traefik.containo.us/MiddlewareTCP': MiddlewareView,
  'traefik.containo.us/TraefikService': TraefikServiceView,
};

/**
 * Reduce a ResourceType ("group/version/Kind" or "version/Kind" for the core
 * group) to the registry key "group/Kind" (bare "Kind" for core).
 */
function registryKey(resourceType: string): string {
  const parts = resourceType.split('/');
  if (parts.length < 2) return resourceType;
  const kind = parts[parts.length - 1];
  const group = parts.slice(0, -2).join('/');
  return group ? `${group}/${kind}` : kind;
}

/** Look up the kind-specific friendly view for a ResourceType, if any. */
export function lookupFriendlyView(
  resourceType: string,
): ComponentType<FriendlyViewProps> | undefined {
  return REGISTRY[registryKey(resourceType)];
}

/**
 * True when we have a dedicated (non-generic) view for the type. The drawer
 * uses this to pick the default tab: Overview for types we render well,
 * YAML for everything else.
 */
export function hasFriendlyView(resourceType: string): boolean {
  return lookupFriendlyView(resourceType) !== undefined;
}
