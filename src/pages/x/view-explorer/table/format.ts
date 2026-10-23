// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { dayjs } from '@/utility/dayjs-setup';
import { isGoZeroTime } from '@/utility/datetime-utils';

import type { EntityKind } from '../model/types';

/**
 * Short forms for dense table cells. The full form goes in a tooltip.
 */

/** "now", "5m ago", "3h ago", "12d ago", "4mo ago", "2y ago"; '' for no time. */
export function shortRelative(value: string | null | undefined, now: number = Date.now()): string {
  if (!value || isGoZeroTime(value)) return '';
  const t = dayjs(value);
  if (!t.isValid()) return '';
  const seconds = Math.max(0, Math.round((now - t.valueOf()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** "Oct 21, 2026 at 3:04 PM"; '' for no time. */
export function absoluteTime(value: string | null | undefined): string {
  if (!value || isGoZeroTime(value)) return '';
  const t = dayjs(value);
  return t.isValid() ? t.format('MMM D, YYYY [at] h:mm A') : '';
}

/** The toolchain without its format: "Kubernetes/YAML" → "Kubernetes". */
export function shortToolchain(toolchain: string): string {
  const slash = toolchain.indexOf('/');
  return slash > 0 ? toolchain.slice(0, slash) : toolchain;
}

export type ToolchainColor = 'info' | 'secondary' | 'success' | 'warning';

/** One colour per toolchain family, so the mark reads at a glance. */
export function toolchainColor(toolchain: string): ToolchainColor {
  const family = shortToolchain(toolchain).toLowerCase();
  if (family === 'kubernetes') return 'info';
  if (family === 'opentofu') return 'secondary';
  if (family === 'appconfig') return 'success';
  return 'warning';
}

const PRIMARY_FIELD: Record<EntityKind, string> = { Unit: 'Slug', Space: 'Slug', Resource: 'ResourceName' };

/** The column that names the row; it is shown in bold. */
export function isPrimaryField(entity: EntityKind, name: string): boolean {
  return PRIMARY_FIELD[entity] === name;
}
