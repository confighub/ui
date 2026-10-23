// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The client's checks of the Filter's ResourceType and WhereData. The server
 * does not refuse a bad one in a one-row check, so these are all there is
 * before the view runs.
 */

// `*` alone is "any resource type", which the server accepts and earlier explorers saved; `*` may also stand in a part.
const RESOURCE_TYPE_RE = /^(?:\*|[A-Za-z0-9*][A-Za-z0-9.\-_/*]*)$/;

/** Why a ResourceType is not valid, or null. */
export function resourceTypeProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return RESOURCE_TYPE_RE.test(v)
    ? null
    : 'ResourceType is a type such as apps/v1/Deployment, or * for any: letters, digits, “.”, “-”, “_”, “/” and “*”.';
}

/** Why a WhereData is not valid, or null. Only the shape the client can see. */
export function whereDataProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // OR inside quoted text is a value, not the keyword.
  const unquoted = v.replace(/'[^']*'/g, "''");
  if (/\bOR\b/.test(unquoted)) return 'WhereData accepts only AND, like WHERE.';
  if ((v.match(/'/g)?.length ?? 0) % 2 === 1) return 'This text has no closing quote.';
  return null;
}
