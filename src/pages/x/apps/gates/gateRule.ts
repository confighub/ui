// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { FunctionArgument } from '@confighub/rtk-query';

/** A part of a Rule line: plain text, or a value shown as code. */
export type RulePart = { text: string } | { code: string };

const MAX_EXPRESSION = 90;

/** The value of a Trigger argument, by its parameter name, or else by its position. */
export const argumentValue = (
  args: FunctionArgument[] | null | undefined,
  name: string,
  index: number,
): string | undefined => {
  const list = args ?? [];
  const named = list.find((arg) => arg.ParameterName === name);
  const value = named ? named.Value : list[index]?.Value;
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

interface ValueFilter {
  AllowRegexp?: string;
  AllowStrings?: Record<string, boolean>;
  DenyRegexp?: string;
  DenyStrings?: Record<string, boolean>;
  Min?: number;
  Max?: number;
}

const parseFilter = (raw: string | undefined): ValueFilter | undefined => {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ValueFilter) : undefined;
  } catch {
    return undefined;
  }
};

const codeList = (values: string[]): RulePart[] =>
  values.flatMap((value, i) =>
    i === 0 ? [{ code: value }] : [{ text: ', ' }, { code: value }],
  );

/**
 * What a Trigger expects, from its function and arguments: the Rule line of a gate. Empty when
 * the function has no argument that says it.
 */
export const ruleParts = (
  functionName: string | undefined,
  args: FunctionArgument[] | null | undefined,
  unitMessages: string[] = [],
): RulePart[] => {
  switch (functionName) {
    case 'vet-images':
    case 'vet-values': {
      const filter =
        parseFilter(
          functionName === 'vet-images'
            ? argumentValue(args, 'image-filter', 0)
            : argumentValue(args, 'value-filter', 1),
        ) ?? {};
      const sentences: RulePart[][] = [];
      if (filter.AllowRegexp)
        sentences.push([
          { text: 'Allowed: values that match ' },
          { code: filter.AllowRegexp },
        ]);
      if (filter.AllowStrings)
        sentences.push([{ text: 'Allowed: ' }, ...codeList(Object.keys(filter.AllowStrings))]);
      if (filter.DenyRegexp)
        sentences.push([
          { text: 'Not allowed: values that match ' },
          { code: filter.DenyRegexp },
        ]);
      if (filter.DenyStrings)
        sentences.push([
          { text: 'Not allowed: ' },
          ...codeList(Object.keys(filter.DenyStrings)),
        ]);
      if (filter.Min !== undefined || filter.Max !== undefined) {
        sentences.push([{ text: `Allowed: ${filter.Min ?? '…'} to ${filter.Max ?? '…'}` }]);
      }
      return sentences.flatMap((parts, i) => (i === 0 ? parts : [{ text: '. ' }, ...parts]));
    }
    case 'vet-celexpr':
    case 'vet-cel': {
      const expression = argumentValue(args, 'validation-expr', 0) ?? '';
      if (!expression) return [];
      const shown =
        expression.length > MAX_EXPRESSION
          ? `${expression.slice(0, MAX_EXPRESSION - 2)}…`
          : expression;
      return [{ text: 'Passes when ' }, { code: shown }];
    }
    case 'vet-pod-security-standard':
      return [
        { text: 'Pod Security Standard, level ' },
        { code: argumentValue(args, 'level', 0) ?? 'from the workload label' },
        { text: ', version ' },
        { code: argumentValue(args, 'version', 1) ?? 'latest' },
      ];
    case 'vet-placeholders':
      return [{ text: 'Not allowed: ' }, ...codeList(['confighubplaceholder', '999999999'])];
    case 'vet-jsonschema':
    case 'vet-schemas': {
      const required = unitMessages.map((m) => /(\S+) is required/.exec(m)?.[1]).find(Boolean);
      const head: RulePart[] =
        functionName === 'vet-jsonschema'
          ? [
              { text: 'Schema ' },
              { code: argumentValue(args, 'schema', 0) ?? 'from the Trigger' },
            ]
          : [{ text: 'The Kubernetes schema' }];
      return required ? [...head, { text: '. Required: ' }, { code: required }] : head;
    }
    case 'vet-immutable':
      return [{ text: 'A field marked immutable cannot change after it is released' }];
    case 'vet-disruption':
      return [
        { text: 'Fails at ' },
        { code: argumentValue(args, 'score-threshold', 0) ?? 'High' },
        { text: ' disruption or worse' },
      ];
    case 'vet-merge-keys':
      return [{ text: 'Each list entry needs its own merge key' }];
    case 'vet-format':
      return [{ text: 'Values must read the same in YAML 1.1 and 1.2' }];
    default:
      return [];
  }
};
