// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// optionalOnLine: the `optional` of a Secret or ConfigMap key reference is in the reference's
// hover card, and on the line only when something happened to it.
import { expect, test } from '@playwright/test';

import { optionalOnLine } from '../src/pages/x/apps/spec-sheet/shapes/optionalMark';
import type { AtomOrigin } from '../src/pages/x/apps/spec-sheet/sheetOrigin';
import type { SheetEdit, SheetOverlay } from '../src/pages/x/apps/spec-sheet/sheetOverlay';

const ref = 'spec.template.spec.containers.0.env.3.valueFrom.secretKeyRef';
const name = { key: `${ref}.name`, path: `${ref}.name` };
const key = { key: `${ref}.key`, path: `${ref}.key` };
const opt = { key: `${ref}.optional`, path: `${ref}.optional` };
const reference = [name, key, opt];

function edit(over: Partial<SheetEdit> = {}): SheetEdit {
  const none = () => {};
  return {
    editingKey: null,
    open: none,
    close: none,
    stage: none,
    unstage: none,
    setKeep: none,
    addingBlockId: null,
    openAdd: none,
    edits: new Map(),
    adds: new Set(),
    protection: new Map(),
    isKept: () => false,
    ...over,
  };
}

function overlay(over: Partial<SheetOverlay> = {}): SheetOverlay {
  return { stale: new Set(), unreleased: new Set(), edit: edit(), ...over };
}

const origin = (kind: AtomOrigin['kind']): AtomOrigin => ({ kind, unreleased: false });
const origins = (byKey: Record<string, AtomOrigin['kind']>) =>
  new Map(Object.entries(byKey).map(([k, kind]) => [k, origin(kind)]));

test('a quiet optional is not on the line', () => {
  expect(optionalOnLine(overlay(), opt, reference)).toBe(false);
});

test('an optional set in this Unit with the rest of its reference is not on the line', () => {
  const all = origins({ [name.key]: 'here', [key.key]: 'here', [opt.key]: 'here' });
  expect(optionalOnLine(overlay({ origins: all }), opt, reference)).toBe(false);
});

test('an optional this Unit set over an inherited reference is on the line', () => {
  const variant = origins({
    [name.key]: 'inherited',
    [key.key]: 'inherited',
    [opt.key]: 'here',
  });
  expect(optionalOnLine(overlay({ origins: variant }), opt, reference)).toBe(true);
});

test('a Stale, Unreleased or incoming optional is on the line', () => {
  expect(optionalOnLine(overlay({ stale: new Set([opt.key]) }), opt, reference)).toBe(true);
  expect(optionalOnLine(overlay({ unreleased: new Set([opt.key]) }), opt, reference)).toBe(
    true,
  );
  const incoming = {
    keys: new Set([opt.key]),
    staged: new Set<string>(),
    blocked: new Set<string>(),
    guarded: new Set<string>(),
    whole: new Map<string, boolean>(),
    guardTitles: new Map<string, string>(),
    upstream: new Map<string, string>(),
    secondary: new Set<string>(),
    onToggle: () => {},
  };
  expect(optionalOnLine(overlay({ incoming }), opt, reference)).toBe(true);
});

test('a staged, kept or open optional is on the line', () => {
  expect(
    optionalOnLine(
      overlay({ edit: edit({ edits: new Map([[opt.key, 'false']]) }) }),
      opt,
      reference,
    ),
  ).toBe(true);
  expect(
    optionalOnLine(
      overlay({ edit: edit({ protection: new Map([[opt.key, true]]) }) }),
      opt,
      reference,
    ),
  ).toBe(true);
  expect(
    optionalOnLine(overlay({ edit: edit({ isKept: (p) => p === opt.path }) }), opt, reference),
  ).toBe(true);
  expect(
    optionalOnLine(overlay({ edit: edit({ editingKey: opt.key }) }), opt, reference),
  ).toBe(true);
});

test('a change to another field of the reference does not put optional on the line', () => {
  const o = overlay({
    unreleased: new Set([key.key]),
    edit: edit({ edits: new Map([[name.key, 'other']]) }),
  });
  expect(optionalOnLine(o, opt, reference)).toBe(false);
});
