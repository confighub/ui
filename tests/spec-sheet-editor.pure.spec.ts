// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The editor of a spec sheet value: which editor a field gets, and the check of its value.

import { expect, test } from '@playwright/test';
import { editorKindOf, imagePrefixOf, validateValue } from '../src/pages/x/apps/spec-sheet/editors/validate';

test.describe('spec sheet editor', () => {
  test('a field gets the editor of its kind', () => {
    expect(editorKindOf('spec.template.spec.containers.0.image', 'ghcr.io/a/b:slim')).toBe('image');
    expect(editorKindOf('spec.template.spec.containers.0.resources.limits.memory', '4Gi')).toBe('quantity');
    expect(editorKindOf('spec.replicas', 2)).toBe('integer');
    expect(editorKindOf('spec.template.spec.automountServiceAccountToken', false)).toBe('boolean');
    expect(editorKindOf('spec.template.spec.containers.0.env.2.value', 'production')).toBe('line');
    expect(editorKindOf('data.note', 'a\nb')).toBe('multiline');
  });

  test('an invalid value has a short error', () => {
    expect(validateValue('quantity', '4 GB')).toBe('Not a quantity: try 4Gi');
    expect(validateValue('quantity', '6Gi')).toBeUndefined();
    expect(validateValue('quantity', '250m')).toBeUndefined();
    expect(validateValue('integer', '3')).toBeUndefined();
    expect(validateValue('integer', 'three')).toBe('Not a whole number');
    expect(validateValue('image', '2026.11.1-slim')).toBeUndefined();
    expect(validateValue('image', 'bad tag')).toBe('Not an image tag');
    expect(validateValue('line', 'anything at all')).toBeUndefined();
  });

  test('the image editor keeps the repository and edits the image tag only', () => {
    expect(imagePrefixOf('ghcr.io/openclaw/openclaw:slim')).toEqual({ prefix: 'ghcr.io/openclaw/openclaw:', tag: 'slim' });
    expect(imagePrefixOf('localhost:5000/app@sha256:abc')).toEqual({ prefix: 'localhost:5000/app@', tag: 'sha256:abc' });
    expect(imagePrefixOf('nginx')).toEqual({ prefix: 'nginx:', tag: '' });
  });

  test('the image editor takes only what fits the separator it keeps', () => {
    const digest = 'sha256:0123456789abcdef0123456789abcdef';
    // After `@` only a digest: an image tag would make `app@1.25.3`.
    expect(validateValue('image', '1.25.3', 'localhost:5000/app@')).toBe('Not a digest');
    expect(validateValue('image', digest, 'localhost:5000/app@')).toBeUndefined();
    // After `:` only an image tag: a digest would make `nginx:sha256:...`.
    expect(validateValue('image', digest, 'nginx:')).toBe('Not an image tag');
    expect(validateValue('image', '1.25.3', 'nginx:')).toBeUndefined();
  });
});
