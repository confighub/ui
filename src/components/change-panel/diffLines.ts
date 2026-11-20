// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A Unit's change as the panel reads it (D5): one line per changed field, named in plain
 * words: the field ("image", "replicas", "LOG_LEVEL"), where it is ("container checkout-api",
 * "env of container checkout-api", "labels"), and the value before and after. Pure.
 */
import type { ConfigDiff } from '@confighub/rtk-query';
import { serverPathContainer, serverPathField, serverPathLabels } from '@/components/config-diff/configDiffTree';

export interface DiffLine {
  key: string;
  field: string;
  location: string;
  from: string;
  to: string;
}

export interface DiffResource {
  /** "apps/v1/Deployment checkout-api". */
  label: string;
  /** "Deployment". */
  kind: string;
  lines: DiffLine[];
}

const unescape = (label: string) => label.replace(/~1/g, '.').replace(/~0/g, '~');

/** The field and where it is, in plain words, of a server path. */
export function plainField(path: string): { field: string; location: string } {
  const labels = serverPathLabels(path);
  const container = serverPathContainer(path);
  const env = labels.findIndex((label, i) => label === 'env' && labels[i + 1]?.startsWith('?name='));
  if (env >= 0) {
    return { field: unescape(labels[env + 1]!.slice('?name='.length)), location: container ? `env of container ${container}` : 'env' };
  }
  const meta = labels.findIndex((label) => label === 'labels' || label === 'annotations');
  if (meta >= 0 && meta < labels.length - 1) {
    return { field: labels.slice(meta + 1).map(unescape).join('.'), location: labels[meta]! };
  }
  return { field: unescape(serverPathField(path)), location: container ? `container ${container}` : '' };
}

const VALUE_ABSENT = '—';

/** The changed resources of a Unit's diff, each with its field lines. */
export function diffResources(diff: ConfigDiff): DiffResource[] {
  return (diff.Resources ?? [])
    .filter((resource) => resource.ChangeType !== 'None')
    .map((resource, ri) => {
      const type = resource.Resource?.ResourceType ?? '';
      const name = resource.Resource?.ResourceNameWithoutScope || resource.Resource?.ResourceName || '';
      const kind = type.split('/').pop() ?? type;
      const changes = (resource.Changes ?? []).filter((c) => c.ChangeType !== 'None');
      const lines: DiffLine[] =
        resource.ChangeType === 'Add' || resource.ChangeType === 'Delete'
          ? [
              {
                key: `${ri}`,
                field: resource.ChangeType === 'Add' ? 'added' : 'deleted',
                location: '',
                from: resource.ChangeType === 'Add' ? VALUE_ABSENT : name,
                to: resource.ChangeType === 'Add' ? name : VALUE_ABSENT,
              },
            ]
          : changes.map((c, ci) => {
              const { field, location } = plainField(c.Path || c.DisplayPath || '');
              return {
                key: `${ri}.${ci}`,
                field,
                location,
                from: c.ChangeType === 'Add' ? VALUE_ABSENT : (c.FromValue ?? ''),
                to: c.ChangeType === 'Delete' ? VALUE_ABSENT : (c.ToValue ?? ''),
              };
            });
      return { label: [type, name].filter(Boolean).join(' '), kind, lines };
    });
}

/** Old and new together past this many characters take two full-width blocks (D5). */
export const LONG_VALUES = 40;

/**
 * The part both values share, and the part each changes, broken at a separator so that
 * ":2.14.0" and "@sha256:…" read as whole parts.
 */
export function splitChange(from: string, to: string): { same: string; oldPart: string; newPart: string } {
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i += 1;
  while (i > 0 && !/[/:@]/.test(from[i] ?? '')) i -= 1;
  return { same: from.slice(0, i), oldPart: from.slice(i), newPart: to.slice(i) };
}
