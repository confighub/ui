// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The token form of lenses: `key:value`, negation, prefix expansion of keys
 * and known values, bare words resolved against the value catalog, and the
 * way back from lenses to tokens.
 */
import { expect, test } from '@playwright/test';

import {
  type TokenContext,
  isTokenForm,
  lensToToken,
  lensesToTokens,
  parseToken,
  parseTokens,
} from '../src/pages/x/view-explorer/model/tokens';
import type { LensSpec } from '../src/pages/x/view-explorer/model/types';
import { lens } from './fixtures/view-explorer-model-views';

const CATALOG: Record<string, string[]> = {
  Space: ['payments-prod', 'payments-staging', 'checkout-dev', 'platform-infra'],
  Target: ['prod-us-east-1', 'prod-eu-west-1', 'dev-kind'],
  ToolchainType: ['Kubernetes/YAML', 'OpenTofu/HCL', 'AppConfig/Properties'],
  'Labels.app': ['checkout', 'cart', 'grafana'],
  'Labels.tier': ['api', 'web'],
  Slug: ['cart-service', 'checkout-web'],
};

const unitCtx: TokenContext = {
  entity: 'Unit',
  labelKeys: ['app', 'tier'],
  values: (id) => CATALOG[id] ?? [],
};

function spec(raw: string, ctx: TokenContext = unitCtx): LensSpec {
  const r = parseToken(raw, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
}

function failure(raw: string, ctx: TokenContext = unitCtx): string {
  const r = parseToken(raw, ctx);
  if (r.ok) throw new Error(`expected a failure for ${raw}`);
  return r.error;
}

test.describe('key:value tokens', () => {
  test('a field token, a pattern, a list and a negation', () => {
    expect(spec('space:payments-prod')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-prod'],
    });
    expect(spec('space:payments-*')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'matches',
      values: ['payments-*'],
    });
    expect(spec('target:prod-us-east-1,dev-kind')).toEqual({
      kind: 'field',
      field: 'Target',
      op: 'is',
      values: ['prod-us-east-1', 'dev-kind'],
    });
    expect(spec('-toolchain:OpenTofu/HCL')).toEqual({
      kind: 'field',
      field: 'ToolchainType',
      op: 'isNot',
      values: ['OpenTofu/HCL'],
    });
    expect(spec('-space:checkout-*')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'isNot',
      values: ['checkout-*'],
    });
  });

  test('status tokens and prefix expansion of values', () => {
    expect(spec('is:unreleased')).toEqual({ kind: 'status', status: 'unreleased' });
    expect(spec('is:unre')).toEqual({ kind: 'status', status: 'unreleased' });
    expect(spec('is:up')).toEqual({ kind: 'status', status: 'upgradable' });
    expect(failure('is:u')).toContain('is not a status');
    expect(failure('-is:unreleased')).toContain('cannot be negated');
    expect(failure('is:unreleased', { ...unitCtx, entity: 'Space' })).toContain('no statuses');
  });

  test('prefix expansion of keys and known values, ignoring case', () => {
    expect(spec('tool:kub')).toEqual({
      kind: 'field',
      field: 'ToolchainType',
      op: 'is',
      values: ['Kubernetes/YAML'],
    });
    expect(spec('SPACE:Payments-Prod')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-prod'],
    });
    // `payments-` is a prefix of two Spaces: kept as typed.
    expect(spec('space:payments-')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-'],
    });
    // `t` is a prefix of target, toolchain and tier.
    expect(failure('t:x')).toContain('is not a filter');
  });

  test('labels: bare key and label.<key>', () => {
    expect(spec('app:checkout')).toEqual({
      kind: 'field',
      field: 'Labels.app',
      op: 'is',
      values: ['checkout'],
    });
    expect(spec('label.tier:api')).toEqual({
      kind: 'field',
      field: 'Labels.tier',
      op: 'is',
      values: ['api'],
    });
    expect(spec('label.region:eu-west-1')).toEqual({
      kind: 'field',
      field: 'Labels.region',
      op: 'is',
      values: ['eu-west-1'],
    });
  });

  test('none is the empty value', () => {
    expect(spec('upstream:none')).toEqual({
      kind: 'field',
      field: 'UpstreamSpaceSlug',
      op: 'empty',
      values: [],
    });
    expect(spec('-target:none')).toEqual({
      kind: 'field',
      field: 'Target',
      op: 'notEmpty',
      values: [],
    });
    expect(failure('target:none')).toContain('cannot be empty');
    expect(failure('space:none,a')).toContain('none cannot be listed');
  });

  test('a pattern takes one value; unknown keys fail', () => {
    expect(failure('space:a*,b*')).toBe('A pattern with * takes one value.');
    expect(failure('colour:red')).toContain('is not a filter for Units');
    expect(failure('space:')).toContain('Give Space a value');
  });

  test('Resources and Spaces have their own keys', () => {
    const resCtx: TokenContext = { entity: 'Resource', labelKeys: ['app'], values: () => [] };
    expect(spec('kind:apps/v1/Deployment', resCtx)).toEqual({
      kind: 'field',
      field: 'ResourceType',
      op: 'is',
      values: ['apps/v1/Deployment'],
    });
    expect(spec('app:x', resCtx)).toEqual({
      kind: 'field',
      field: 'Unit.Labels.app',
      op: 'is',
      values: ['x'],
    });
    const spaceCtx: TokenContext = { entity: 'Space', labelKeys: [], values: () => [] };
    expect(spec('component:payments', spaceCtx)).toEqual({
      kind: 'field',
      field: 'Component',
      op: 'is',
      values: ['payments'],
    });
  });
});

test.describe('bare words', () => {
  test('a known value resolves to its field', () => {
    expect(spec('payments-prod')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'is',
      values: ['payments-prod'],
    });
    expect(spec('dev-kind')).toEqual({
      kind: 'field',
      field: 'Target',
      op: 'is',
      values: ['dev-kind'],
    });
    expect(spec('grafana')).toEqual({
      kind: 'field',
      field: 'Labels.app',
      op: 'is',
      values: ['grafana'],
    });
    expect(spec('-grafana')).toEqual({
      kind: 'field',
      field: 'Labels.app',
      op: 'isNot',
      values: ['grafana'],
    });
    expect(spec('unreleased')).toEqual({ kind: 'status', status: 'unreleased' });
  });

  test('a pattern matching Spaces is a Space pattern; anything else searches names', () => {
    expect(spec('payments-*')).toEqual({
      kind: 'field',
      field: 'Space',
      op: 'matches',
      values: ['payments-*'],
    });
    expect(spec('cart*')).toEqual({
      kind: 'field',
      field: 'Slug',
      op: 'matches',
      values: ['cart*'],
    });
    expect(spec('service')).toEqual({
      kind: 'field',
      field: 'Slug',
      op: 'matches',
      values: ['*service*'],
    });
  });
});

test.describe('several tokens', () => {
  test('parseTokens reads each word and reports the failing one with its span', () => {
    const ok = parseTokens('space:payments-* is:unre  app:cart', unitCtx);
    expect(ok.ok && ok.specs.length).toBe(3);
    const text = 'space:payments-* colour:red is:unreleased';
    const bad = parseTokens(text, unitCtx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(text.slice(bad.error.start, bad.error.end)).toBe('colour:red');
  });

  test('isTokenForm tells tokens from WHERE', () => {
    expect(isTokenForm('space:payments-* is:unreleased -app:cart')).toBe(true);
    expect(isTokenForm("Space.Slug = 'a'")).toBe(false);
    expect(isTokenForm('')).toBe(false);
    expect(isTokenForm('space:a OR')).toBe(false);
  });
});

test.describe('lenses -> tokens', () => {
  test('round trip: tokens -> lenses -> tokens', () => {
    const text =
      'space:payments-* is:unreleased -toolchain:OpenTofu/HCL app:cart,checkout label.region:eu-west-1 -target:none';
    const parsed = parseTokens(text, unitCtx);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const lenses = parsed.specs.map((s) => lens(s));
    expect(lensesToTokens(lenses, unitCtx)).toBe(text);
  });

  test('null when a lens has no token form', () => {
    expect(lensToToken(lens({ kind: 'custom', where: "Slug ~ 'a'" }), unitCtx)).toBeNull();
    expect(
      lensToToken(
        lens({ kind: 'field', field: 'HeadRevisionNum', op: 'gt', values: ['3'] }),
        unitCtx,
      ),
    ).toBeNull();
    expect(
      lensToToken(
        lens({ kind: 'field', field: 'Space', op: 'matches', values: ['exact'] }),
        unitCtx,
      ),
    ).toBeNull();
    expect(
      lensToToken(
        lens({ kind: 'field', field: 'Labels.app', op: 'is', values: ['a b'] }),
        unitCtx,
      ),
    ).toBeNull();
    expect(
      lensesToTokens([lens({ kind: 'status', status: 'released' }, false)], unitCtx),
    ).toBeNull();
    expect(
      lensesToTokens([lens({ kind: 'custom', where: "Slug ~ 'a'" })], unitCtx),
    ).toBeNull();
  });

  test('a label key that clashes with a field token keeps the label. prefix', () => {
    const ctx: TokenContext = { ...unitCtx, labelKeys: ['space'] };
    expect(
      lensToToken(
        lens({ kind: 'field', field: 'Labels.space', op: 'is', values: ['x'] }),
        ctx,
      ),
    ).toBe('label.space:x');
  });
});

test.describe('label keys and patterns in tokens', () => {
  test('a label key with / and dots round-trips as a token', () => {
    const ctx: TokenContext = { ...unitCtx, labelKeys: ['app.kubernetes.io/name'] };
    const t = lensToToken(
      lens({
        kind: 'field',
        field: 'Labels.app.kubernetes.io/name',
        op: 'is',
        values: ['web'],
      }),
      ctx,
    );
    expect(t).toBe('app.kubernetes.io/name:web');
    expect(isTokenForm(t ?? '')).toBe(true);
    expect(spec(t ?? '', ctx)).toEqual({
      kind: 'field',
      field: 'Labels.app.kubernetes.io/name',
      op: 'is',
      values: ['web'],
    });
    expect(isTokenForm('label.app.kubernetes.io/name:web')).toBe(true);
  });

  test('a pattern with _ or % is refused; a bare word with _ is an exact name', () => {
    expect(failure('name:pay_*')).toContain('cannot hold _ or %');
    expect(spec('my_app')).toEqual({
      kind: 'field',
      field: 'Slug',
      op: 'is',
      values: ['my_app'],
    });
  });
});
