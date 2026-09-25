// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Languages we accept on the CodeEditor `language` prop. These map to Monaco
// language IDs (lowercased internally) but a few historical values are kept for
// callers that already hand-pass them.
export type Language = 'JSON' | 'yaml' | 'Javascript' | 'Typescript';

// Resolved Monaco language IDs. Monaco IDs are lowercase.
export type MonacoLanguageId =
  | 'yaml'
  | 'json'
  | 'ini'
  | 'shell'
  | 'plaintext'
  | 'javascript'
  | 'typescript';

const TOOLCHAIN_TO_LANGUAGE: Record<string, MonacoLanguageId> = {
  'Kubernetes/YAML': 'yaml',
  'ConfigHub/YAML': 'yaml',
  'AppConfig/YAML': 'yaml',
  'AppConfig/JSON': 'json',
  'AppConfig/INI': 'ini',
  // Properties files share key=value + ;/# comment shape with INI; close enough
  // for highlighting until/unless we ship a dedicated grammar.
  'AppConfig/Properties': 'ini',
  // Monaco has no dotenv mode; shell highlights KEY=value reasonably well.
  'AppConfig/Env': 'shell',
  // No built-in TOML language ships with Monaco. Fall back to ini for now.
  'AppConfig/TOML': 'ini',
  'AppConfig/Text': 'plaintext',
};

const LANGUAGE_PROP_TO_MONACO: Record<Language, MonacoLanguageId> = {
  JSON: 'json',
  yaml: 'yaml',
  Javascript: 'javascript',
  Typescript: 'typescript',
};

/**
 * Resolve the Monaco language ID for a CodeEditor invocation. `toolchainType`
 * (a Unit's ToolchainType, e.g. "Kubernetes/YAML") takes precedence; the
 * `language` prop is the fallback for callers that pre-date toolchain plumbing.
 */
export const resolveMonacoLanguage = (
  toolchainType: string | undefined,
  language: Language,
): MonacoLanguageId => {
  if (toolchainType && TOOLCHAIN_TO_LANGUAGE[toolchainType]) {
    return TOOLCHAIN_TO_LANGUAGE[toolchainType];
  }
  return LANGUAGE_PROP_TO_MONACO[language];
};

export const isKubernetesToolchain = (toolchainType: string | undefined): boolean =>
  toolchainType === 'Kubernetes/YAML';

// API groups covered by the standard yannh/kubernetes-json-schema bundle. If
// a Unit references none of these (e.g. CRDs only), attaching the schema is
// counter-productive — every field gets flagged as unknown.
const WELL_KNOWN_K8S_GROUPS = new Set<string>([
  '', // core/v1
  'apps',
  'batch',
  'autoscaling',
  'policy',
  'extensions',
  'admissionregistration.k8s.io',
  'apiextensions.k8s.io',
  'apiregistration.k8s.io',
  'authentication.k8s.io',
  'authorization.k8s.io',
  'certificates.k8s.io',
  'coordination.k8s.io',
  'discovery.k8s.io',
  'events.k8s.io',
  'flowcontrol.apiserver.k8s.io',
  'networking.k8s.io',
  'node.k8s.io',
  'rbac.authorization.k8s.io',
  'scheduling.k8s.io',
  'storage.k8s.io',
]);

// Top-level `apiVersion: <value>` lines (multi-doc YAML can have many).
const API_VERSION_RE = /^apiVersion:\s*(\S+)/gm;

/**
 * Returns true if any YAML doc in `content` declares a top-level apiVersion
 * whose group is part of the standard Kubernetes API set. Used to gate schema
 * attachment so Units containing only CRDs don't get every field flagged.
 */
export const hasWellKnownKubernetesApiVersion = (content: string): boolean => {
  for (const match of content.matchAll(API_VERSION_RE)) {
    const apiVersion = match[1];
    const slash = apiVersion.indexOf('/');
    const group = slash === -1 ? '' : apiVersion.slice(0, slash);
    if (WELL_KNOWN_K8S_GROUPS.has(group)) return true;
  }
  return false;
};
