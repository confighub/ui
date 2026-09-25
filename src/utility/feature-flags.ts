// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
declare global {
  interface Window {
    __featureFlags?: Record<string, FlagValue>;
  }
}

export type FlagValue = boolean | string | number | null | undefined;

export enum FeatureFlags {
  ENABLE_POLLING = 'ENABLE_POLLING',
  ENABLE_LIST_DRAWERS = 'ENABLE_LIST_DRAWERS',
}

const defaultFlags: Record<string, FlagValue> = {
  [FeatureFlags.ENABLE_POLLING]: true,
  [FeatureFlags.ENABLE_LIST_DRAWERS]: false,
};

const listeners: ((flag: FeatureFlags, newValue: FlagValue, oldValue: FlagValue) => void)[] =
  [];

export function notifyListeners(flag: FeatureFlags, newValue: FlagValue, oldValue: FlagValue) {
  for (const listener of listeners) {
    listener(flag, newValue, oldValue);
  }
}

export function onFeatureFlagChange(
  callback: (flag: FeatureFlags, newValue: FlagValue, oldValue: FlagValue) => void,
) {
  listeners.push(callback);
}

export function createFeatureFlagsProxy(flags: Record<string, FlagValue>) {
  return new Proxy(flags, {
    set(target, prop: string, value) {
      const oldValue = target[prop];
      target[prop] = value;
      notifyListeners(prop as FeatureFlags, value, oldValue);
      return true;
    },
  });
}

export function setFeatureFlag(flag: FeatureFlags, value: FlagValue) {
  if (!window.__featureFlags) return;
  window.__featureFlags[flag] = value;
}

// Init proxy once
if (!window.__featureFlags) {
  window.__featureFlags = createFeatureFlagsProxy(defaultFlags);
} else {
  window.__featureFlags = createFeatureFlagsProxy(window.__featureFlags);
}

export function getFeatureFlag<T = FlagValue>(flag: FeatureFlags): T | undefined {
  return ((window.__featureFlags && window.__featureFlags[flag]) ?? defaultFlags[flag]) as
    | T
    | undefined;
}

export function isFeatureEnabled(flag: FeatureFlags): boolean {
  const value = getFeatureFlag(flag);
  return value !== false && value !== undefined;
}
