// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// How the Link drawer writes the Link fields it shows rather than edits.
import type { Binding, FunctionInvocation, ResourceInfo } from '@confighub/rtk-query';

/** `set-image-reference-by-uri(repository-uri=ghcr.io/x, image-reference=:{{.Params.tag}})` */
export function formatFunctionCall(invocation: FunctionInvocation | undefined): string {
  if (invocation === undefined) return '';
  const args = (invocation.Arguments ?? []).map((arg) => {
    const value = String(arg.Value ?? '');
    const evaluator = arg.Evaluator ? ` (${arg.Evaluator})` : '';
    return arg.ParameterName ? `${arg.ParameterName}=${value}${evaluator}` : `${value}${evaluator}`;
  });
  return `${invocation.FunctionName ?? ''}(${args.join(', ')})`;
}

export function formatResource(resource: ResourceInfo | undefined): string {
  if (resource === undefined) return '';
  return [resource.ResourceType, resource.ResourceName].filter((part) => part).join(' ');
}

export function bindingRows(bindings: Binding[]): string[][] {
  return bindings.map((binding) => [
    binding.AttributeName ?? '',
    [formatResource(binding.NeededResource), binding.NeededPath].filter((part) => part).join(' '),
    [formatResource(binding.ProvidedResource), binding.ProvidedPath].filter((part) => part).join(' '),
  ]);
}
