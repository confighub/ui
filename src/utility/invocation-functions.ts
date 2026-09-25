// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  FunctionInvocation,
  Invocation,
  InvocationRead,
} from '@confighub/rtk-query';

/**
 * An Invocation calls a list of functions, executed in the order it stores them. These helpers
 * are for the screens that show or edit one function: they read the list without every call site
 * having to spell out the null handling.
 */
type AnyInvocation = Pick<Invocation | InvocationRead, never> & {
  FunctionInvocations?: FunctionInvocation[] | null;
};

/** The functions an Invocation calls, in execution order. */
export const invocationFunctions = (invocation?: AnyInvocation | null): FunctionInvocation[] =>
  invocation?.FunctionInvocations ?? [];

/**
 * The first function an Invocation calls, which is the whole of a single-function Invocation and
 * the one the single-function forms edit.
 */
export const firstInvocationFunction = (
  invocation?: AnyInvocation | null,
): FunctionInvocation | undefined => invocationFunctions(invocation)[0];

/** The name of the first function, for the screens that label an Invocation by its function. */
export const invocationFunctionName = (invocation?: AnyInvocation | null): string =>
  firstInvocationFunction(invocation)?.FunctionName ?? '';

/** Every function name an Invocation calls, joined for display in one cell or chip. */
export const invocationFunctionNames = (invocation?: AnyInvocation | null): string =>
  invocationFunctions(invocation)
    .map((f) => f.FunctionName ?? '')
    .filter(Boolean)
    .join(', ');
