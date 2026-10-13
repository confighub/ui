// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `ociPreviewKey` decides whether the New component wizard's OCI preview is
// still the thing Create would write. Wrong in one direction, the wizard throws
// a good preview away on every keystroke; wrong in the other, it creates
// something the user never previewed. Both directions are asserted.

import { expect, test } from '@playwright/test';

import { EMPTY_OCI_SOURCE, ociPreviewKey, type OciUploadParams } from '../src/pages/x/apps/ociUpload';

const BASE: OciUploadParams = {
  form: { ...EMPTY_OCI_SOURCE, ref: 'oci://registry.example.com/demo:v1', namespace: 'cubbychat' },
  componentSlug: 'checkout',
  baseSlug: 'checkout-base',
};

const key = (change: Partial<OciUploadParams> = {}, form: Partial<OciUploadParams['form']> = {}) =>
  ociPreviewKey({ ...BASE, ...change, form: { ...BASE.form, ...form } });

test('metadata the server records word for word keeps the preview', () => {
  expect(key({ unitLabels: { team: 'checkout' } })).toBe(key());
  expect(key({ unitAnnotations: { note: 'imported by hand' } })).toBe(key());
  expect(key({ labels: { tier: 'backend' } })).toBe(key());
  expect(key({ changeDescription: 'a description' })).toBe(key());
});

test('an input the server pulls or plans from discards the preview', () => {
  expect(key({}, { sourceName: 'checkout-src' })).not.toBe(key());
  expect(key({}, { createNamespace: true })).not.toBe(key());
  expect(key({}, { ref: 'oci://registry.example.com/demo:v2' })).not.toBe(key());
  expect(key({}, { spaceSlugOverride: 'checkout-other' })).not.toBe(key());
});

test('the registry password is never in the key, only that there is one', () => {
  const withPassword = key({}, { username: 'robot', password: 'hunter2' });
  expect(withPassword).not.toContain('hunter2');
  expect(withPassword).toBe(key({}, { username: 'robot', password: 'different' }));
  expect(withPassword).not.toBe(key({}, { username: 'robot' }));
});
