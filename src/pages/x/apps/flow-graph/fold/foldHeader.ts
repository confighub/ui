// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { WaveCondition } from './deploymentCondition';
import {
  FOLD_HEAD_CHAR_W,
  FOLD_HEAD_CHIP_H,
  FOLD_HEAD_LINES,
  FOLD_HEAD_LINE_H,
  FOLD_HEAD_PAD_BOTTOM,
  FOLD_HEAD_PAD_TOP,
  FOLD_HEAD_ROW_GAP,
  FOLD_HEAD_VALUES_MIN_W,
  FOLD_HEAD_X,
} from './foldConstants';
import type { BaseFold } from './foldModel';
import { type QuietGroup, groupKeyLabel, groupKeyNoun, groupKeyPlural } from './groupBy';

/** Between two values in the fold header. */
export const HEADER_SEPARATOR = ' · ';
/** At the end of a line that the list continues on the next line. */
export const LINE_END = ' ·';
/** Between two chips, and between the values and the chips. */
const CHIP_GAP = 10;

/**
 * Upper estimates of a wave pill's width (chip and bulk action) with a
 * three-digit count, so a count that changes on a poll never changes the
 * header's height.
 */
const WAVE_PILL_W: Record<WaveCondition, number> = {
  stale: 220,
  unreleased: 300,
  gated: 210,
};
/** Upper estimate of "N over the card cap, marked in stacks". */
const OVER_CAP_W = 280;

/**
 * The values a fold holds, in the order of its cells: each stack's or loose
 * card's label, and for a merged stack the labels of the groups of 1 in it.
 * Each value once. Empty when no key splits the members, as there is then no value to name.
 */
export function foldHeaderValues(
  cells: readonly (QuietGroup | null)[],
  groupKey: string | null,
): string[] {
  if (groupKey === null) return [];
  // A value is named once, however many cells hold it.
  const values = cells.flatMap((g) => {
    if (!g) return [];
    return g.kind === 'other' ? (g.mergedLabels ?? []) : [g.label];
  });
  return [...new Set(values)];
}

/** The full list, for the tooltip and for assistive technology: "Department: a, b". */
export function foldHeaderTitle(groupKey: string | null, values: readonly string[]): string {
  if (groupKey === null || values.length === 0) return '';
  return `${groupKeyLabel(groupKey)}: ${values.join(', ')}`;
}

/**
 * What the header shows when not even one value fits beside "+N more": the
 * count of values ("53 departments"), which says more than "+53 more" alone.
 */
export function foldHeaderCountText(groupKey: string | null, count: number): string {
  if (groupKey === null) return '';
  const noun = count === 1 ? groupKeyNoun(groupKey) : groupKeyPlural(groupKey);
  return `${count} ${noun}`;
}

/** One line of the header. */
export interface HeaderLine {
  items: string[];
  /** The list goes on on the next line, so this line ends with a separator. */
  continues: boolean;
}

export interface HeaderFit {
  lines: HeaderLine[];
  /**
   * Values left out. The last item of the last line is then "+N more", or
   * the count text when no value fits.
   */
  hidden: number;
}

export const moreText = (hidden: number): string => `+${hidden} more`;

/** Break items into lines of whole items, or null when they need more lines. */
function breakLines(
  items: readonly string[],
  width: number,
  maxLines: number,
  measure: (text: string) => number,
): HeaderLine[] | null {
  const lineWidth = (line: readonly string[], continues: boolean) =>
    measure(line.join(HEADER_SEPARATOR) + (continues ? LINE_END : ''));
  const lines: HeaderLine[] = [];
  let current: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const continues = i < items.length - 1;
    const trial = [...current, items[i]];
    if (lineWidth(trial, continues) <= width) {
      current = trial;
      continue;
    }
    // One item wider than a whole line cannot show without a cut.
    if (current.length === 0) return null;
    lines.push({ items: current, continues: true });
    current = [items[i]];
    if (lines.length >= maxLines || lineWidth(current, continues) > width) return null;
  }
  if (current.length > 0) lines.push({ items: current, continues: false });
  return lines;
}

/**
 * As many whole values as fit in `maxLines` lines of `width` px, in order,
 * then "+N more" for the rest. A value is never cut: one that does not fit
 * goes to the next line, or into the "+N more" count. When not even the
 * first value fits, the header shows `countText` alone.
 *
 * @param measure the width in px of a text in the header font
 */
export function fitHeaderValues(
  values: readonly string[],
  width: number,
  measure: (text: string) => number,
  countText: string,
  maxLines: number = FOLD_HEAD_LINES,
): HeaderFit {
  if (values.length === 0) return { lines: [], hidden: 0 };
  const all = breakLines(values, width, maxLines, measure);
  if (all) return { lines: all, hidden: 0 };
  for (let shown = values.length - 1; shown >= 1; shown--) {
    const hidden = values.length - shown;
    const lines = breakLines(
      [...values.slice(0, shown), moreText(hidden)],
      width,
      maxLines,
      measure,
    );
    if (lines) return { lines, hidden };
  }
  const count = countText ? breakLines([countText], width, maxLines, measure) : null;
  return { lines: count ?? [], hidden: values.length };
}

/** The header's shape at a fold width. */
export interface FoldHeaderGeometry {
  height: number;
  /** The chips sit to the right of the values; else on rows below them. */
  chipsBeside: boolean;
  /** An estimate of the width the values get, used until the real width is measured. */
  valuesWidth: number;
}

/** Rows the chips wrap to at this width. */
function chipRows(widths: readonly number[], rowWidth: number): number {
  let rows = 1;
  let used = 0;
  for (const w of widths) {
    if (used > 0 && used + CHIP_GAP + w > rowWidth) {
      rows++;
      used = w;
    } else {
      used += (used > 0 ? CHIP_GAP : 0) + w;
    }
  }
  return rows;
}

/**
 * The chips (the waves and the over-cap note) sit beside the values when
 * that leaves the values FOLD_HEAD_VALUES_MIN_W; else they take rows of their
 * own below them. It reads only which waves there are, never their counts,
 * so a count that changes on a poll does not move the stacks.
 *
 * @param lines the lines of values the header keeps room for
 */
export function foldHeaderGeometry(
  base: BaseFold,
  foldWidth: number,
  lines: number,
): FoldHeaderGeometry {
  const inner = foldWidth - FOLD_HEAD_X;
  const valuesHeight = lines * FOLD_HEAD_LINE_H;
  const chips = base.waves.map((w) => WAVE_PILL_W[w.condition]);
  if (base.overCapIds.length > 0) chips.push(OVER_CAP_W);
  const chipsWidth = chips.reduce((sum, w) => sum + w, 0) + CHIP_GAP * (chips.length - 1);
  const besideWidth = chips.length === 0 ? inner : inner - chipsWidth - CHIP_GAP;
  if (besideWidth >= FOLD_HEAD_VALUES_MIN_W) {
    return {
      height: FOLD_HEAD_PAD_TOP + Math.max(valuesHeight, FOLD_HEAD_CHIP_H),
      chipsBeside: true,
      valuesWidth: besideWidth,
    };
  }
  const rows = chipRows(chips, inner);
  return {
    height:
      FOLD_HEAD_PAD_TOP +
      valuesHeight +
      rows * (FOLD_HEAD_ROW_GAP + FOLD_HEAD_CHIP_H) +
      FOLD_HEAD_PAD_BOTTOM,
    chipsBeside: false,
    valuesWidth: inner,
  };
}

const estimateWidth = (text: string): number => text.length * FOLD_HEAD_CHAR_W;

/**
 * The lines of values a header keeps room for: one when the values fit on
 * one line by a width estimate, else FOLD_HEAD_LINES. Fit freezes it, so a
 * value a poll adds or removes does not move the stacks below.
 */
export function foldHeaderLines(
  base: BaseFold,
  foldWidth: number,
  values: readonly string[],
): number {
  const { valuesWidth } = foldHeaderGeometry(base, foldWidth, 1);
  return fitHeaderValues(values, valuesWidth, estimateWidth, '', 1).hidden === 0
    ? 1
    : FOLD_HEAD_LINES;
}
