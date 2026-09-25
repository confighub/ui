// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ExtendedUnitRead } from '@confighub/rtk-query';
import { formatAbsolute } from '@/utility/date-format';

import { LABEL_PREFIX, SPACE_LABEL_PREFIX } from './types';

// Pixel constants mirror the styled components in GroupNavPanel.tsx and the
// MUI x-tree-view layout. Keep in sync with GroupNavPanel.tsx if its styling
// changes — the measurement is what lets the pane auto-fit its content
// instead of using a fixed 200px default.
const PANEL_BODY_PADDING = 16; // PanelBody padding 8px each side
const TREE_ITEM_PADDING = 16; // TreeItem content padding 8px each side
const TREE_ITEM_INDENT = 29; // groupTransition marginLeft 16 + paddingLeft 12 + 1 border
const ICON_CONTAINER = 28; // MUI expand/collapse slot (20px) + 8px gap to label
const FOLDER_ICON = 20; // FolderOutlinedIcon (rendered ~20px wide in label)
const ICON_LABEL_GAP = 6; // ItemLabel gap between FolderIcon and label
const LABEL_PADDING_LEFT = 4; // treeItemClasses.label paddingLeft
const COUNT_LEFT_PADDING = 8; // CountBadge paddingLeft theme.spacing(1)
const HEADER_PADDING = 24; // PanelHeader padding 1.5/1.5 horizontal
const PANEL_BORDER = 1; // Panel right border
const SAFETY_MARGIN = 8; // small buffer for scrollbar / sub-pixel rounding

// Match MUI Typography variants. The `letterSpacing` values matter — the CSS
// `font` shorthand does not include them, so probe spans must set the
// properties individually.
const FONT_FAMILY = 'Roboto, Helvetica, Arial, sans-serif';
interface FontSpec {
  size: string;
  weight: string;
  letterSpacing: string;
}
const LABEL_FONT: FontSpec = { size: '14px', weight: '400', letterSpacing: '0.15px' }; // body2
const HEADER_FONT: FontSpec = { size: '14px', weight: '600', letterSpacing: '0.1px' }; // subtitle2
const COUNT_FONT: FontSpec = { size: '11.2px', weight: '400', letterSpacing: '0.15px' }; // body2 @ 0.7rem

interface GroupLabel {
  label: string;
  count: number;
  depth: number;
}

function collectGroupLabels(
  units: ExtendedUnitRead[],
  columns: string[],
  depth: number,
  out: GroupLabel[],
): void {
  if (depth >= columns.length) return;
  const buckets = new Map<string, ExtendedUnitRead[]>();
  for (const u of units) {
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

/**
 * Measure rendered widths for a list of strings under a given font using a
 * detached DOM span. More accurate than canvas `measureText`, which under-
 * counts when webfonts (e.g. Roboto) aren't yet in the canvas font cache.
 */
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
 * Builds the UPPERCASE header label shown in the GroupNavPanel static header
 * and used by the width-measurement probe. Strips the `Labels.` /
 * `Space.Labels.` prefix for dynamic label fields; other fields use their raw
 * column name.
 */
export function formatHeaderLabel(groupByColumns: string[]): string {
  return groupByColumns
    .map((c) => {
      if (c.startsWith(SPACE_LABEL_PREFIX)) return c.slice(SPACE_LABEL_PREFIX.length);
      if (c.startsWith(LABEL_PREFIX)) return c.slice(LABEL_PREFIX.length);
      return c;
    })
    .join(' / ')
    .toUpperCase();
}

/**
 * Compute the natural width (in pixels) needed to render the GroupNavPanel
 * tree without truncating any visible label. Returns 0 when there is nothing
 * to measure (no grouping or no units). Caller is responsible for clamping
 * to a sensible MIN/MAX range.
 */
export function measureGroupNavWidth(
  units: ExtendedUnitRead[],
  groupByColumns: string[],
): number {
  if (groupByColumns.length === 0 || units.length === 0) return 0;

  const items: GroupLabel[] = [];
  collectGroupLabels(units, groupByColumns, 0, items);

  // Build batched text inputs so we only attach/measure the probe span twice.
  const labelTexts = [...items.map((i) => i.label), 'All'];
  const countTexts = [...items.map((i) => String(i.count)), String(units.length)];
  const labelWidths = measureTexts(labelTexts, LABEL_FONT);
  const countWidths = measureTexts(countTexts, COUNT_FONT);

  const itemBaseWidth = (depth: number, labelW: number, countW: number) =>
    PANEL_BODY_PADDING +
    depth * TREE_ITEM_INDENT +
    TREE_ITEM_PADDING +
    ICON_CONTAINER +
    LABEL_PADDING_LEFT +
    FOLDER_ICON +
    ICON_LABEL_GAP +
    labelW +
    COUNT_LEFT_PADDING +
    countW +
    PANEL_BORDER +
    SAFETY_MARGIN;

  let max = 0;

  // Tree nodes
  for (let i = 0; i < items.length; i++) {
    const total = itemBaseWidth(items[i].depth, labelWidths[i], countWidths[i]);
    if (total > max) max = total;
  }

  // 'All' item at depth 0 (last entry in the batched arrays)
  const allTotal = itemBaseWidth(0, labelWidths[items.length], countWidths[items.length]);
  if (allTotal > max) max = allTotal;

  // Header — must mirror the prefix-stripping in GroupNavPanel.tsx so we don't
  // measure 'SPACE.LABELS.X' when only 'X' is actually rendered.
  const headerLabel = formatHeaderLabel(groupByColumns);
  const headerWidth =
    measureTexts([headerLabel], HEADER_FONT)[0] +
    HEADER_PADDING +
    PANEL_BORDER +
    SAFETY_MARGIN;
  if (headerWidth > max) max = headerWidth;

  return Math.ceil(max);
}

/** Extract a display value for a column from an ExtendedUnitRead */
export function getCellValue(eu: ExtendedUnitRead, column: string): string {
  const unit = eu.Unit;
  if (!unit) return '';
  switch (column) {
    case 'Slug':
      return unit.Slug ?? '';
    case 'Space':
      return eu.Space?.Slug ?? unit.SpaceID ?? '';
    case 'Target':
      return eu.Target?.Slug ?? unit.TargetID ?? '';
    case 'ToolchainType':
      return unit.ToolchainType ?? '';
    case 'HeadRevisionNum':
      return unit.HeadRevisionNum != null ? String(unit.HeadRevisionNum) : '';
    case 'LastReleasedRevisionNum':
      return unit.LastReleasedRevisionNum != null ? String(unit.LastReleasedRevisionNum) : '';
    case 'CreatedAt':
      return formatAbsolute(unit.CreatedAt);
    case 'UpdatedAt':
      return formatAbsolute(unit.UpdatedAt);
    case 'LastChangeDescription':
      return unit.LastChangeDescription ?? '';
    case 'ChangeSetSlug':
      return eu.ChangeSet?.Slug ?? unit.ChangeSetID ?? '';
    case 'UpstreamUnitSlug':
      return eu.UpstreamUnit?.Slug ?? unit.UpstreamUnitID ?? '';
    case 'UpstreamSpaceSlug':
      return eu.UpstreamSpace?.Slug ?? unit.UpstreamSpaceID ?? '';
    case 'BridgeWorkerID':
      return unit.BridgeWorkerID ?? '';
    case 'ProviderType':
      return unit.ProviderType ?? '';
    case 'DisplayName':
      return unit.DisplayName ?? '';
    case 'HeadRevisionCreatedAt':
      return formatAbsolute(eu.HeadRevision?.CreatedAt);
    // UnappliedChanges is the pre-Release name, still present in saved Views.
    case 'UnappliedChanges':
    case 'UnreleasedChanges': {
      const head = unit.HeadRevisionNum ?? 0;
      const lastReleased = unit.LastReleasedRevisionNum ?? 0;
      return head > lastReleased && unit.TargetID ? 'Yes' : 'No';
    }
    case 'UpgradeNeeded': {
      const upstream = unit.UpstreamRevisionNum ?? 0;
      const upstreamHead = eu.UpstreamUnit?.HeadRevisionNum ?? 0;
      return upstream > 0 && upstream < upstreamHead ? 'Yes' : 'No';
    }
    default:
      if (column.startsWith('Space.Labels.')) {
        const key = column.slice('Space.Labels.'.length);
        return eu.Space?.Labels?.[key] ?? '';
      }
      if (column.startsWith('Labels.')) {
        const key = column.slice(7);
        return unit.Labels?.[key] ?? '';
      }
      return '';
  }
}
