// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedMutationRead, ResourceMutation } from '@confighub/rtk-query';

/** One change a mutation left in a revision: a path it set, or a whole resource. */
export interface MutationChange {
  key: string;
  resource: string;
  /** Empty for a change to the resource as a whole. */
  path: string;
  type: string;
  /** The value set; absent for a deletion, whose recorded value is what it removed. */
  value?: string;
}

const isChange = (type?: string): type is string => !!type && type !== 'None';

/**
 * The changes `mutationNum` left in a revision, from the revision's mutation sources, which
 * record for each path the mutation that last set it. A resource the mutation added, replaced
 * or deleted is one change, not one per path.
 */
export function mutationChanges(
  sources: readonly ResourceMutation[],
  mutationNum: number,
): MutationChange[] {
  const changes: MutationChange[] = [];
  for (const source of sources) {
    const resource = [source.Resource?.ResourceType, source.Resource?.ResourceName]
      .filter(Boolean)
      .join(' ');
    const whole = source.ResourceMutationInfo;
    if (whole?.Index === mutationNum && isChange(whole.MutationType)) {
      changes.push({ key: `${resource}\u0000`, resource, path: '', type: whole.MutationType });
      continue;
    }
    const paths = Object.entries(source.PathMutationMap ?? {})
      .filter(([, info]) => info.Index === mutationNum && isChange(info.MutationType))
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [path, info] of paths) {
      changes.push({
        key: `${resource}\u0000${path}`,
        resource,
        path,
        type: info.MutationType as string,
        value: info.MutationType === 'Delete' ? undefined : info.Value?.trim() || undefined,
      });
    }
  }
  return changes;
}

/**
 * The arguments the mutation's function ran with, as `name=value`: its positional
 * arguments, else its named ones. A Trigger's mutation records the arguments it ran with, so
 * the Trigger's own, which may have changed since, are not read.
 */
export function mutationArguments(row: ExtendedMutationRead): string[] {
  const invocation = row.Mutation?.FunctionInvocation;
  const positional = invocation?.Arguments ?? [];
  if (positional.length > 0) {
    return positional.map((arg) => `${arg.ParameterName || 'arg'}=${String(arg.Value ?? '')}`);
  }
  return Object.entries(invocation?.Params ?? {}).map(
    ([name, value]) => `${name}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
}

/**
 * The upstream revisions a merge or a Link's resolve took: "N" when it took one,
 * "M to N" when it took those after M up to N.
 */
export function upstreamRevisions(row: ExtendedMutationRead): string | undefined {
  const end = row.Mutation?.MergeEndRevisionNum ?? 0;
  if (end === 0) return undefined;
  const base = row.Mutation?.MergeBaseRevisionNum ?? 0;
  return base > 0 && base + 1 < end ? `${base + 1} to ${end}` : String(end);
}
