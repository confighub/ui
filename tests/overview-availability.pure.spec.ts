// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Which resources and Units have an Overview. The Component pane decides for a whole Unit from
// its configuration before reading its resources, so the installer record's configHub block has
// to be recognized however it is written.
import { expect, test } from '@playwright/test';

import {
  offersOverview,
  unitOffersOverview,
} from '../src/components/resource-overview/overviewAvailability';

test('every Kubernetes resource has an Overview, other configuration only with a view', () => {
  expect(offersOverview('Kubernetes/YAML', 'apps/v1/Deployment')).toBe(true);
  expect(offersOverview('Kubernetes/YAML', 'example.com/v1/Widget')).toBe(true);
  expect(offersOverview('AppConfig/YAML', 'InstallerRecord')).toBe(true);
  expect(offersOverview('AppConfig/YAML', 'AppSettings')).toBe(false);
  expect(offersOverview('AppConfig/YAML', undefined)).toBe(false);
});

test('an installer record has an Overview only as YAML', () => {
  // Every AppConfig format takes its ResourceType from configHub.configSchema.
  expect(offersOverview('AppConfig/Properties', 'InstallerRecord')).toBe(false);
  expect(offersOverview(undefined, 'InstallerRecord')).toBe(false);
  expect(
    unitOffersOverview('AppConfig/Properties', 'configHub.configSchema=InstallerRecord\n'),
  ).toBe(false);
});

const records: Array<[string, string]> = [
  [
    'two-space indent',
    'configHub:\n  configSchema: InstallerRecord\n  configName: installer\n',
  ],
  [
    'four-space indent',
    'configHub:\n    configName: installer\n    configSchema: InstallerRecord\n',
  ],
  ['single-quoted', "configHub:\n  configSchema: 'InstallerRecord'\n"],
  ['double-quoted', 'configHub:\n  configSchema: "InstallerRecord"\n'],
  ['with a comment', 'configHub:\n  configSchema: InstallerRecord # the record\n'],
  ['after other keys', 'package:\n  name: web\nconfigHub:\n  configSchema: InstallerRecord\n'],
  ['with CRLF line ends', 'configHub:\r\n  configSchema: InstallerRecord\r\n'],
];

for (const [form, data] of records) {
  test(`a Unit holding an installer record has an Overview: ${form}`, () => {
    expect(unitOffersOverview('AppConfig/YAML', data)).toBe(true);
  });
}

test('a Unit of other AppConfig has none', () => {
  expect(
    unitOffersOverview('AppConfig/YAML', 'configHub:\n  configSchema: AppSettings\n'),
  ).toBe(false);
  expect(unitOffersOverview('AppConfig/YAML', 'greeting: hello\n')).toBe(false);
  // A configSchema that is not configHub's.
  expect(
    unitOffersOverview('AppConfig/YAML', 'settings:\n  configSchema: InstallerRecord\n'),
  ).toBe(false);
  expect(unitOffersOverview('AppConfig/YAML', undefined)).toBe(false);
});

test('a Kubernetes Unit has an Overview whatever it holds', () => {
  expect(unitOffersOverview('Kubernetes/YAML', 'kind: ConfigMap\n')).toBe(true);
  expect(unitOffersOverview('Kubernetes/YAML', undefined)).toBe(true);
});
