// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { formatHeaderLabel } from '@/components/group-nav';

import { GroupNavRow, getCellValue } from './cell-value';

// Pixel constants mirror EntityGroupNavPanel's styled components + the MUI
// x-tree-view layout. Forked from group-nav/utils.ts so the View Explorer can
// measure Space/Resource rows without the shared component knowing about them.
const PANEL_BODY_PADDING = 16;
const TREE_ITEM_PADDING = 16;
const TREE_ITEM_INDENT = 29;
const ICON_CONTAINER = 28;
const FOLDER_ICON = 20;
const ICON_LABEL_GAP = 6;
const LABEL_PADDING_LEFT = 4;
const COUNT_LEFT_PADDING = 8;
const HEADER_PADDING = 24;
const PANEL_BORDER = 1;
const SAFETY_MARGIN = 8;

const FONT_FAMILY = 'Roboto, Helvetica, Arial, sans-serif';
interface FontSpec {
  size: string;
  weight: string;
  letterSpacing: string;
}
const LABEL_FONT: FontSpec = { size: '14px', weight: '400', letterSpacing: '0.15px' };
const HEADER_FONT: FontSpec = { size: '14px', weight: '600', letterSpacing: '0.1px' };
const COUNT_FONT: FontSpec = { size: '11.2px', weight: '400', letterSpacing: '0.15px' };

interface GroupLabel {
  label: string;
  count: number;
  depth: number;
}

function collectGroupLabels(
  rows: GroupNavRow[],
  columns: string[],
  depth: number,
  out: GroupLabel[],
): void {
  if (depth >= columns.length) return;
  const buckets = new Map<string, GroupNavRow[]>();
  for (const u of rows) {
    const v = getCellValue(u, columns[depth]) || '(empty)';
    let b = buckets.get(v);
    if (!b) {
      b = [];
      buckets.set(v, b);
    }
    b.push(u);
  }
  for (const [label, bucket] of buckets.entries()) {
    out.push({ label, count: bucket.length, depth });
    collectGroupLabels(bucket, columns, depth + 1, out);
  }
}

function measureTexts(texts: string[], font: FontSpec): number[] {
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'nowrap';
  probe.style.fontFamily = FONT_FAMILY;
  probe.style.fontSize = font.size;
  probe.style.fontWeight = font.weight;
  probe.style.letterSpacing = font.letterSpacing;
  document.body.appendChild(probe);
  const widths = texts.map((t) => {
    probe.textContent = t;
    return probe.getBoundingClientRect().width;
  });
  document.body.removeChild(probe);
  return widths;
}

/**
 * Natural width (px) needed to render the EntityGroupNavPanel tree without
 * truncating labels. Forked from group-nav/measureGroupNavWidth but uses the
 * View Explorer's entity-aware getCellValue. `hideCounts` excludes the count
 * badges from the measurement (Resource views hide them).
 */
export function measureGroupNavWidth(
  rows: GroupNavRow[],
  groupByColumns: string[],
  hideCounts = false,
): number {
  if (groupByColumns.length === 0 || rows.length === 0) return 0;

  const items: GroupLabel[] = [];
  collectGroupLabels(rows, groupByColumns, 0, items);

  const labelTexts = [...items.map((i) => i.label), 'All'];
  const countTexts = hideCounts
    ? []
    : [...items.map((i) => String(i.count)), String(rows.length)];
  const labelWidths = measureTexts(labelTexts, LABEL_FONT);
  const countWidths = hideCounts ? [] : measureTexts(countTexts, COUNT_FONT);

  const itemBaseWidth = (depth: number, labelW: number, countW: number) =>
    PANEL_BODY_PADDING +
    depth * TREE_ITEM_INDENT +
    TREE_ITEM_PADDING +
    ICON_CONTAINER +
    LABEL_PADDING_LEFT +
    FOLDER_ICON +
    ICON_LABEL_GAP +
    labelW +
    (hideCounts ? 0 : COUNT_LEFT_PADDING + countW) +
    PANEL_BORDER +
    SAFETY_MARGIN;

  let max = 0;
  for (let i = 0; i < items.length; i++) {
    const total = itemBaseWidth(items[i].depth, labelWidths[i], hideCounts ? 0 : countWidths[i]);
    if (total > max) max = total;
  }
  const allTotal = itemBaseWidth(
    0,
    labelWidths[items.length],
    hideCounts ? 0 : countWidths[items.length],
  );
  if (allTotal > max) max = allTotal;

  const headerLabel = formatHeaderLabel(groupByColumns);
  const headerWidth =
    measureTexts([headerLabel], HEADER_FONT)[0] + HEADER_PADDING + PANEL_BORDER + SAFETY_MARGIN;
  if (headerWidth > max) max = headerWidth;

  return Math.ceil(max);
}
