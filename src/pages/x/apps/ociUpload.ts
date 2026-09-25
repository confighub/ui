// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Builds the /upload request that has the server pull a component's base from an
// OCI registry, and reads the result back. A browser cannot pull from a registry
// itself: registries send no CORS headers, so the server fetches the bundle.

import type { UploadRequest, UploadResult, UploadUnitResult } from '@confighub/rtk-query';

import { LABEL_VARIANT } from './componentData';

/** The Variant label value of the Space a component's base lives in. */
export const BASE_VARIANT = 'base';

/** What the user entered in the wizard's OCI reference form. */
export interface OciSourceForm {
  ref: string;
  /** The release namespace: where namespaced resources that name no namespace belong. */
  namespace: string;
  /**
   * Adds the release Namespace resource when the bundle has none. It needs a
   * namespace name, so it is read only together with `namespace`.
   */
  createNamespace: boolean;
  /**
   * The ownership name the upload writes on every Unit. The server uses the
   * component name when this is empty, so an empty value is not sent.
   */
  sourceName: string;
  /** An explicit Space slug. The `<component>-base` default applies when empty. */
  spaceSlugOverride: string;
  username: string;
  password: string;
}

export const EMPTY_OCI_SOURCE: OciSourceForm = {
  ref: '',
  namespace: '',
  createNamespace: false,
  sourceName: '',
  spaceSlugOverride: '',
  username: '',
  password: '',
};

export const OCI_SCHEME = 'oci://';

/** Mirrors the server's release-namespace check, so a bad value fails inline. */
const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Returns what is wrong with the form, or null when it can be sent. */
export function ociSourceProblem(form: OciSourceForm): string | null {
  const ref = form.ref.trim();
  if (!ref) return 'Enter an OCI reference';
  if (!ref.startsWith(OCI_SCHEME) || ref.length === OCI_SCHEME.length) {
    return `The reference must start with ${OCI_SCHEME}`;
  }
  const namespace = form.namespace.trim();
  if (namespace && !NAMESPACE_RE.test(namespace)) {
    return 'The namespace must be a valid Kubernetes namespace name';
  }
  if (form.createNamespace && !namespace) {
    return 'Give a namespace name to create the namespace';
  }
  if (!!form.username.trim() !== !!form.password) {
    return 'Registry credentials need both a username and a password or token';
  }
  return sourceNameProblem(form.sourceName);
}

/** The Space slug a create writes to: the user's override, or the default. */
export function resolveSpaceSlug(override: string | undefined, baseSlug: string): string {
  return override?.trim() || baseSlug;
}

/** The Space slug the upload writes to: the user's override, or the default. */
export function ociSpaceSlug(form: OciSourceForm, baseSlug: string): string {
  return resolveSpaceSlug(form.spaceSlugOverride, baseSlug);
}

/**
 * Mirrors the server's slug rule (models.ValidateSlug): first and last
 * character alphanumeric, and only letters, numbers, `.`, `-` and `_` between
 * them.
 */
const SLUG_RE = /^[A-Za-z0-9]([-_.A-Za-z0-9]*[A-Za-z0-9])?$/;

/**
 * The server rejects a slug that parses as a UUID, because a slug and an ID
 * are read from the same path segment. Go's parser also takes the urn and
 * brace forms, but their punctuation already fails SLUG_RE.
 */
const UUID_RE = /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$/;

const SLUG_MAX_LENGTH = 128;

/**
 * Returns what is wrong with an optional slug-shaped value, or null when it can
 * be sent. An empty value is never a problem: it means "use the default".
 *
 * `subject` names the field in each message, because the server holds more than
 * one upload field to this one rule and the user must know which field is
 * wrong.
 */
function optionalSlugProblem(value: string, subject: string): string | null {
  const slug = value.trim();
  if (!slug) return null;
  if (slug.length > SLUG_MAX_LENGTH) return `The ${subject} must be ${SLUG_MAX_LENGTH} characters or fewer`;
  if (!SLUG_RE.test(slug)) {
    return `The ${subject} must start and end with a letter or number, and hold only letters, numbers, dots, dashes and underscores`;
  }
  if (UUID_RE.test(slug)) return `The ${subject} must not be a UUID`;
  return null;
}

/** What is wrong with the Space slug override, or null when it can be sent. */
export function spaceSlugProblem(override: string): string | null {
  return optionalSlugProblem(override, 'slug');
}

/**
 * What is wrong with the source name, or null when it can be sent. The server
 * writes it as the ownership label on every Unit, so it holds it to the same
 * shape as a slug (models.UploadComponentRequest.validate).
 */
export function sourceNameProblem(name: string): string | null {
  return optionalSlugProblem(name, 'source name');
}

/** Whether a unit-metadata row becomes a label or an annotation. */
export type UnitMetaKind = 'label' | 'annotation';

/**
 * One row of unit metadata. Labels and annotations are entered in one list,
 * because they are the same pair of strings and differ only in what the server
 * does with them.
 */
export interface UnitMetaRow {
  kind: UnitMetaKind;
  key: string;
  value: string;
}

/**
 * Splits the one row list into the two maps the upload request carries. An
 * empty map is left out, so a list of blank rows sends nothing.
 */
export function splitUnitMeta(rows: UnitMetaRow[]): {
  unitLabels?: Record<string, string>;
  unitAnnotations?: Record<string, string>;
} {
  const unitLabels: Record<string, string> = {};
  const unitAnnotations: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    // A half-filled row is a row the user still types, not a blank label.
    if (!key || !value) continue;
    if (row.kind === 'annotation') unitAnnotations[key] = value;
    else unitLabels[key] = value;
  }
  return {
    unitLabels: Object.keys(unitLabels).length > 0 ? unitLabels : undefined,
    unitAnnotations: Object.keys(unitAnnotations).length > 0 ? unitAnnotations : undefined,
  };
}

export interface OciUploadParams {
  form: OciSourceForm;
  /** The Component label, which the server requires to be a slug. */
  componentSlug: string;
  /** The default Space slug, used unless the form overrides it. */
  baseSlug: string;
  owner: string;
  /** Space labels. The reserved `Variant` key is always set, and always wins. */
  labels?: Record<string, string>;
  /** Labels the server sets on every Unit the upload writes. */
  unitLabels?: Record<string, string>;
  /** Annotations the server sets on every Unit the upload writes. */
  unitAnnotations?: Record<string, string>;
  /** Recorded on each Unit write. */
  changeDescription?: string;
  /** The digest a dry run pulled; pins the upload to the bundle that was previewed. */
  digest?: string;
}

/** True when the map holds at least one key, so empty maps are not sent. */
function hasEntries(map: Record<string, string> | undefined): map is Record<string, string> {
  return !!map && Object.keys(map).length > 0;
}

export function buildOciUploadRequest({
  form,
  componentSlug,
  baseSlug,
  owner,
  labels,
  unitLabels,
  unitAnnotations,
  changeDescription,
  digest,
}: OciUploadParams): UploadRequest {
  const username = form.username.trim();
  const namespace = form.namespace.trim();
  const sourceName = form.sourceName.trim();
  return {
    Source: {
      Ref: form.ref.trim(),
      Pull: true,
      Client: 'ui',
      ...(digest ? { Digest: digest } : {}),
      ...(username && form.password ? { Credentials: { Username: username, Password: form.password } } : {}),
    },
    Components: [
      {
        Name: componentSlug,
        Space: ociSpaceSlug(form, baseSlug),
        ...(sourceName ? { SourceName: sourceName } : {}),
        ...(namespace ? { Namespace: namespace } : {}),
        // The server rejects CreateNamespace without a Namespace, so the flag is
        // sent only with the name it needs.
        ...(namespace && form.createNamespace ? { CreateNamespace: true } : {}),
        ...(hasEntries(unitLabels) ? { UnitLabels: unitLabels } : {}),
        ...(hasEntries(unitAnnotations) ? { UnitAnnotations: unitAnnotations } : {}),
      },
    ],
    SpaceLabels: {
      ...(labels ?? {}),
      ...(owner ? { Owner: owner } : {}),
      // Reserved, so it is set last and wins over a label of the same name. The
      // Component view reads it to name the card, and the server needs it to
      // match a dependency to the same variant of another component.
      [LABEL_VARIANT]: BASE_VARIANT,
    },
    ...(changeDescription ? { ChangeDescription: changeDescription } : {}),
  };
}

/**
 * Request fields the server records word for word. They change nothing the
 * server pulls or plans, so an edit to one of them keeps a preview usable.
 *
 * SpaceLabels is one of them only because the request always names its Space.
 * The server's default slug pattern reads the Component and Variant labels, so
 * a request that stops setting Space must stop calling SpaceLabels metadata.
 */
const METADATA_FIELDS = new Set([
  'SpaceLabels',
  'SpaceAnnotations',
  'UnitLabels',
  'UnitAnnotations',
  'ChangeDescription',
  'ChangeSetDescription',
]);

/**
 * Identifies the inputs a preview was made from, so a stale preview is never
 * applied.
 *
 * The key is the upload request itself with the metadata fields above removed,
 * and not a second list of the fields that matter: a list like that could fall
 * behind the request, and a preview that looks fresh would then create
 * something the user never saw. A field added to the request is part of the key
 * until it is named as metadata, which throws a preview away too often but
 * never keeps a wrong one.
 *
 * The registry password is never in the key. The key is held in component state,
 * where React DevTools and anything that writes that state out can read it.
 */
export function ociPreviewKey(params: OciUploadParams): string {
  return JSON.stringify(buildOciUploadRequest(params), (key, value) => {
    if (METADATA_FIELDS.has(key)) return undefined;
    // The pull reads the same bundle for one password as for another, so only
    // the fact that there is one belongs in the key.
    if (key === 'Credentials' && value && typeof value === 'object') {
      const credentials = value as { Username?: string; Password?: string };
      return { Username: credentials.Username, hasPassword: !!credentials.Password };
    }
    if (key === 'Password') return undefined;
    return value;
  });
}

/** The one component's one Space in an upload result. */
export function uploadSpace(result: UploadResult | undefined) {
  return result?.Components?.[0]?.Spaces?.[0];
}

/** Every Unit the upload wrote or would write. */
export function uploadUnits(result: UploadResult | undefined): UploadUnitResult[] {
  return uploadSpace(result)?.Units ?? [];
}

export function uploadSkippedSecrets(result: UploadResult | undefined): string[] {
  return result?.Components?.[0]?.SkippedSecrets ?? [];
}

/** Unit and Link writes that failed, as slug + message. */
export function uploadItemErrors(result: UploadResult | undefined): Array<{ slug: string; message: string }> {
  const space = uploadSpace(result);
  const errors: Array<{ slug: string; message: string }> = [];
  for (const u of space?.Units ?? []) {
    if (u.Error) errors.push({ slug: u.Slug ?? u.Resource ?? '', message: u.Error.Message ?? 'failed' });
  }
  for (const l of space?.Links ?? []) {
    if (l.Error) {
      errors.push({ slug: `${l.FromUnit ?? ''} → ${l.ToUnit ?? ''}`, message: l.Error.Message ?? 'failed' });
    }
  }
  return errors;
}

/**
 * Reads an upload resource key as kind and name: `apps/Deployment/shop/web` is
 * `Deployment shop/web`, and an AppConfig key such as `AppConfig/YAML/installer`
 * is `AppConfig/YAML installer`.
 */
export function describeUploadResource(key: string | undefined): string {
  if (!key) return '';
  const parts = key.split('/');
  if (parts.length === 4) {
    const [, kind, namespace, name] = parts;
    return namespace ? `${kind} ${namespace}/${name}` : `${kind} ${name}`;
  }
  if (parts.length === 3) {
    return `${parts[0]}/${parts[1]} ${parts[2]}`;
  }
  return key;
}

/** Why a preview can't be created from, or null. */
export function ociPreviewBlocker(result: UploadResult | null, baseSlug: string): string | null {
  if (!result) return null;
  const space = uploadSpace(result);
  if (space && space.Action !== 'Create') {
    return `A space named "${space.SpaceSlug ?? baseSlug}" already exists. Choose another component name.`;
  }
  if (uploadUnits(result).length === 0) {
    return 'The bundle holds no resources to create units from.';
  }
  return null;
}
