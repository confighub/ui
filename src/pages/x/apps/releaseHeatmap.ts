// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentRead, ExtendedReleaseRead, ExtendedSpaceRead } from '@confighub/rtk-query';
import dayjs from 'dayjs';

import { componentOwner } from './componentOwner';
import { type LiveStatus, releaseTone, type VitalTone, worseTone } from './liveStatus';

/**
 * The pure part of the Components Overview's Release heatmap: one row per
 * Component, one column per day, and in each cell the Releases the Component's
 * Spaces published that day.
 *
 * A cell's tone is the worst of its Releases' tones (`releaseTone`), so one
 * failing Release is never averaged away by healthy ones on the same day. A
 * Release's `LiveStatus` is what its deploying tool last reported about it,
 * which for a Release since replaced is how it was doing when it stopped being
 * the one running.
 */

export interface HeatmapRelease {
  releaseId: string;
  releaseNum: number;
  spaceId: string;
  spaceSlug: string;
  createdAt: string;
  /** `false` once the Release has been withdrawn. */
  published: boolean;
  liveStatus: LiveStatus | null;
  tone: VitalTone;
}

export interface HeatmapCell {
  /** Newest first. */
  releases: HeatmapRelease[];
  tone: VitalTone;
}

export interface HeatmapRow {
  componentId: string;
  componentName: string;
  owner: string;
  /** Keyed by day (`dayKey`); a day with no Releases has no entry. */
  cells: Map<string, HeatmapCell>;
}

export interface ReleaseHeatmap {
  rows: HeatmapRow[];
  /** The most Releases in any one cell, which a cell's count is shaded against. */
  maxCount: number;
  releaseCount: number;
}

/** A local calendar day, `YYYY-MM-DD`. */
export const dayKey = (time: string | Date): string => dayjs(time).format('YYYY-MM-DD');

/** The `days` local days ending with the one `now` falls in, oldest first. */
export function heatmapDays(days: number, now: Date): string[] {
  const today = dayjs(now).startOf('day');
  return Array.from({ length: days }, (_, i) => today.subtract(days - 1 - i, 'day').format('YYYY-MM-DD'));
}

/**
 * The start of the first of `heatmapDays(days, now)`, as the RFC 3339 time a
 * `where` term compares `CreatedAt` with. It is the same all day, so a query
 * keyed on it is not re-read on every render.
 */
export function heatmapSince(days: number, now: Date): string {
  const start = dayjs(now).startOf('day').subtract(days - 1, 'day').toDate();
  return start.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build the heatmap: a row for every Component of `spaces`, sorted by name,
 * with that Component's Releases among `releases` placed on the days in
 * `days`. A Release on another day, or of a Space not in `spaces`, is left out.
 */
export function buildReleaseHeatmap(
  releases: readonly ExtendedReleaseRead[],
  spaces: readonly ExtendedSpaceRead[],
  componentById: ReadonlyMap<string, ComponentRead>,
  days: readonly string[],
): ReleaseHeatmap {
  const spacesByComponentId = new Map<string, ExtendedSpaceRead[]>();
  const spaceById = new Map<string, { slug: string; componentId: string }>();
  for (const space of spaces) {
    const spaceId = space.Space?.SpaceID;
    const componentId = space.Space?.ComponentID;
    if (!spaceId || !componentId || !componentById.has(componentId)) continue;
    spaceById.set(spaceId, { slug: space.Space?.Slug ?? spaceId, componentId });
    const group = spacesByComponentId.get(componentId);
    if (group) group.push(space);
    else spacesByComponentId.set(componentId, [space]);
  }

  const rowByComponentId = new Map<string, HeatmapRow>();
  for (const [componentId, componentSpaces] of spacesByComponentId) {
    const component = componentById.get(componentId)!;
    rowByComponentId.set(componentId, {
      componentId,
      componentName: component.Slug,
      owner: componentOwner(component, componentSpaces.map((s) => s.Space)),
      cells: new Map(),
    });
  }

  const daySet = new Set(days);
  let releaseCount = 0;
  for (const entry of releases) {
    const release = entry.Release;
    const spaceId = release?.SpaceID;
    const space = spaceId ? spaceById.get(spaceId) : undefined;
    if (!release?.ReleaseID || !release.CreatedAt || release.ReleaseNum === undefined || !spaceId || !space) continue;
    const day = dayKey(release.CreatedAt);
    if (!daySet.has(day)) continue;
    const row = rowByComponentId.get(space.componentId)!;
    const liveStatus = release.LiveStatus ?? null;
    const heatmapRelease: HeatmapRelease = {
      releaseId: release.ReleaseID,
      releaseNum: release.ReleaseNum,
      spaceId,
      spaceSlug: space.slug,
      createdAt: release.CreatedAt,
      published: release.Published !== false,
      liveStatus,
      tone: releaseTone(liveStatus),
    };
    const cell = row.cells.get(day);
    if (cell) {
      cell.releases.push(heatmapRelease);
      cell.tone = worseTone(cell.tone, heatmapRelease.tone);
    } else {
      row.cells.set(day, { releases: [heatmapRelease], tone: heatmapRelease.tone });
    }
    releaseCount++;
  }

  let maxCount = 0;
  for (const row of rowByComponentId.values()) {
    for (const cell of row.cells.values()) {
      cell.releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      maxCount = Math.max(maxCount, cell.releases.length);
    }
  }

  const rows = [...rowByComponentId.values()].sort((a, b) => a.componentName.localeCompare(b.componentName));
  return { rows, maxCount, releaseCount };
}
