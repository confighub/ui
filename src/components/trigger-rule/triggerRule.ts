// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type {
  FunctionArgument,
  FunctionInvocation,
  FunctionParameter,
  FunctionSignature,
  InvocationRead,
  Trigger,
} from '@confighub/rtk-query';

/**
 * What a Trigger runs, as its details show it: each function, with the arguments the Trigger
 * gives it and the defaults of those it omits, and the other Units it reads. Everything is read
 * from the Trigger and its functions' signatures, so a function needs nothing of its own here.
 */
export interface TriggerRule {
  functions: RuleFunction[];
  /** The Units the Trigger passes its functions as OtherData, by the key they read them under. */
  reads: { key: string; unitId: string }[];
}

export interface RuleFunction {
  functionName: string;
  /** Its 1-based position among several, as its gate names it; none for a lone function. */
  position?: number;
  /** The first sentence of the function's description: what it fails, for a validating one. */
  summary?: string;
  /** The description's "Fix: ..." sentence, when it has one. */
  fix?: string;
  arguments: RuleArgument[];
}

/** How an argument's value is shown, by its parameter's data type. */
export type RuleValue =
  | { kind: 'list'; items: string[] }
  | { kind: 'expression'; language: string; text: string }
  | { kind: 'fields'; fields: { name: string; value: string }[] }
  | { kind: 'text'; text: string };

export interface RuleArgument {
  name: string;
  value: RuleValue;
  /** The parameter's DefaultValue, shown for an argument the Trigger omits. */
  isDefault: boolean;
  description?: string;
}

const EXPRESSION_TYPES = new Set(['CEL', 'YQ', 'Starlark']);

const argumentText = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** An argument's value as its parameter's data type says to show it. */
export const ruleValue = (
  parameter: FunctionParameter | undefined,
  raw: unknown,
): RuleValue => {
  const text = argumentText(raw);
  const dataType = parameter?.DataType ?? '';
  if (dataType === 'CSV')
    return {
      kind: 'list',
      items: text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
  if (EXPRESSION_TYPES.has(dataType)) return { kind: 'expression', language: dataType, text };
  // A JSON object whose parameter declares its schema, such as a ValueFilter: its fields.
  if (parameter?.Schema || dataType === 'JSON' || dataType === 'ValueFilter') {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          kind: 'fields',
          fields: Object.entries(parsed as Record<string, unknown>).map(([name, value]) => ({
            name,
            value:
              value && typeof value === 'object' && !Array.isArray(value)
                ? Object.keys(value).join(', ')
                : Array.isArray(value)
                  ? value.map(argumentText).join(', ')
                  : argumentText(value),
          })),
        };
      }
    } catch {
      // Not JSON after all: shown as written.
    }
  }
  return { kind: 'text', text };
};

/** The first sentence of a description, and its "Fix: ..." sentence. */
export const describeFunction = (
  description: string | undefined,
): { summary?: string; fix?: string } => {
  const text = (description ?? '').trim();
  if (!text) return {};
  const fixAt = text.search(/(^|\s)Fix: /);
  const body = fixAt >= 0 ? text.slice(0, fixAt).trim() : text;
  const summary = /^.*?[.!?](?=\s|$)/.exec(body)?.[0] ?? body;
  return { summary, fix: fixAt >= 0 ? text.slice(fixAt).trim() : undefined };
};

const ruleArguments = (
  args: FunctionArgument[] | null | undefined,
  signature: FunctionSignature | undefined,
): RuleArgument[] => {
  const parameters = signature?.Parameters ?? [];
  const given = new Set<string>();
  const out: RuleArgument[] = (args ?? []).map((arg, index) => {
    // An argument without a name is the parameter at its position.
    const parameter = arg.ParameterName
      ? parameters.find((p) => p.ParameterName === arg.ParameterName)
      : parameters[index];
    const name = arg.ParameterName || parameter?.ParameterName || String(index);
    given.add(name);
    return {
      name,
      value: ruleValue(parameter, arg.Value),
      isDefault: false,
      description: parameter?.Description,
    };
  });
  for (const parameter of parameters) {
    const name = parameter.ParameterName ?? '';
    if (!name || !parameter.DefaultValue || given.has(name)) continue;
    out.push({
      name,
      value: ruleValue(parameter, parameter.DefaultValue),
      isDefault: true,
      description: parameter.Description,
    });
  }
  return out;
};

/**
 * The rule a Trigger runs. A Trigger running an Invocation runs its functions, in order, with the
 * Invocation's OtherData; one naming its own function runs that one.
 */
export const triggerRule = (
  trigger: Trigger | undefined,
  invocation: InvocationRead | undefined,
  signatureOf: (functionName: string) => FunctionSignature | undefined,
): TriggerRule => {
  if (!trigger) return { functions: [], reads: [] };
  const invocations: FunctionInvocation[] = invocation
    ? (invocation.FunctionInvocations ?? [])
    : trigger.FunctionName
      ? [{ FunctionName: trigger.FunctionName, Arguments: trigger.Arguments ?? [] }]
      : [];
  const functions = invocations.map((fi, index): RuleFunction => {
    const functionName = fi.FunctionName ?? '';
    const signature = signatureOf(functionName);
    return {
      functionName,
      position: invocations.length > 1 ? index + 1 : undefined,
      ...describeFunction(signature?.Description),
      arguments: ruleArguments(fi.Arguments, signature),
    };
  });
  const otherUnitIds = (invocation ? invocation.OtherUnitIDs : trigger.OtherUnitIDs) ?? {};
  const reads = Object.entries(otherUnitIds)
    .filter(([, unitId]) => !!unitId)
    .map(([key, unitId]) => ({ key, unitId }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { functions, reads };
};
