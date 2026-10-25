// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Organization roles, weakest first. `none` leaves the account with only what is granted to it. */
export const ORG_ROLES = [
  { value: 'none', label: 'None', hint: 'Only what is granted to it' },
  { value: 'viewer', label: 'Viewer', hint: 'Read everything' },
  { value: 'creator', label: 'Creator', hint: 'Create entities, manage its own' },
  { value: 'user', label: 'User', hint: 'Use and run what it can see' },
  { value: 'editor', label: 'Editor', hint: 'Change everything' },
  { value: 'manager', label: 'Manager', hint: 'Change everything and its permissions' },
  { value: 'admin', label: 'Admin', hint: 'Everything, including the organization' },
] as const;

export const orgRoleLabel = (role: string | undefined) =>
  ORG_ROLES.find((entry) => entry.value === (role || 'none'))?.label ?? role ?? 'None';
