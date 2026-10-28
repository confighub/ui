// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Action, selection and focus are the brand rust; blue is a status colour only
 * (`docs/dev/ui-design-system.md`). The feature token sets mirror the theme by
 * hand, so this pins them to it and measures the contrast the doc promises.
 */

import { expect, test } from '@playwright/test';

import { changeOrderAction, changeOrderSelectedRing, changeOrderStatus } from '../src/pages/change-orders/changeOrdersTokens';
import { consoleTokens } from '../src/pages/change-orders/consoleStyle';
import { componentTheme } from '../src/pages/x/apps/componentTheme';

const RUST = '#ba3d03';
const RUST_DARK = '#8c2c00';

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('every feature token set takes action, selection and focus from the rust', () => {
  expect(componentTheme.accent).toBe(RUST);
  expect(changeOrderAction.ink).toBe(RUST);
  expect(changeOrderAction.focus).toBe(RUST);
  expect(changeOrderAction.inkHover).toBe(RUST_DARK);
  expect(consoleTokens.action).toBe(RUST);
  expect(consoleTokens.focus).toBe(RUST);
  expect(consoleTokens.actionInk).toBe(RUST_DARK);
  expect(changeOrderSelectedRing).toBe(`inset 0 0 0 1.5px ${RUST}`);
});

test('no feature token set names a colour "accent" outside the component theme', () => {
  expect(Object.keys(changeOrderStatus).filter((key) => key.startsWith('accent'))).toEqual([]);
  expect(Object.keys(consoleTokens).filter((key) => key.startsWith('accent'))).toEqual([]);
});

test('the focus ring clears 3:1 on every ground it is drawn on', () => {
  for (const ground of ['#ffffff', '#f8f9fb', '#f4f5f7', '#f6f7f9']) {
    expect(contrast(changeOrderAction.focus, ground)).toBeGreaterThanOrEqual(3);
  }
});

test('action text and the filled buttons clear AA', () => {
  expect(contrast(changeOrderAction.ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(changeOrderAction.ink, changeOrderAction.soft)).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#ffffff', RUST)).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#ffffff', componentTheme.promote)).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#ffffff', componentTheme.promoteEmphasis)).toBeGreaterThanOrEqual(4.5);
});
