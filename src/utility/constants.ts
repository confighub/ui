// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const ACTION_STATUSES = {
  PENDING: 'Pending',
  PROGRESSING: 'Progressing',
  SUBMITTED: 'Submitted',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
} as const;

export const ANNOTATION_TYPES = [
  { key: 'Description', value: 'Your Description' },
  { key: 'Note', value: 'Your Note' },
  { key: 'Readme', value: 'URL to your documentation' },
  { key: 'YourInfoType', value: 'Your Information' },

  // {
  //   key: 'team',
  //   value: 'owner',
  // },
  // {
  //   key: 'team',
  //   value: 'email',
  // },
  // {
  //   key: 'team',
  //   value: 'team name',
  // },
  // {
  //   key: 'team',
  //   value: 'business unit',
  // },
  // {
  //   key: 'git',
  //   value: 'repository',
  // },
  // {
  //   key: 'git',
  //   value: 'branch',
  // },
  // {
  //   key: 'git',
  //   value: 'commit',
  // },
];

export const ENVIRONMENTS = [
  'Development',
  'Staging',
  'Production',
  'QA',
  'Sandbox',
  'Pre-Prod',
  'YourEnvironment',
];

export type EnvironmentType = (typeof ENVIRONMENTS)[number];

export const LAYERS = ['Application', 'Infrastructure', 'Data', 'YourLayer'];

export type LayerType = (typeof LAYERS)[number];

export const COMPONENT_DIMENSIONS = {
  INPUT_HEIGHT: '34px',
  AUTOCOMPLETE_MIN_WIDTH: 300,
  FILTER_WIDTH: '356px',
  INPUT_LINE_HEIGHT: '1.1',
  SEARCH_WIDTH: 500
} as const;

// Height (px) of the fixed top navigation AppBar rendered by Layout.tsx.
// Shared here (rather than in Layout.tsx) so ThemeProvider can offset overlays
// such as Drawers below the nav without importing the layout module.
export const TOP_NAV_HEIGHT = 48;

export const EMPTY_OUTPUT = 'W10=';
