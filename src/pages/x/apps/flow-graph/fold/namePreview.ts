// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Between two names in a stack's preview line. */
export const NAMES_SEPARATOR = ', ';

/** The count that follows the shown names, with the space that sets it apart. */
export const moreLabel = (more: number): string => ` +${more}`;

export interface NamesPreview {
  shown: string[];
  /** Names left out; the line ends in "+N" when this is more than 0. */
  more: number;
}

/**
 * The names a stack card previews in one line. Whole names only, in order,
 * then "+N" for the rest: a name cut in the middle ("ap-northeast-ret…")
 * reads as a different Deployment, and in a fleet named by region and
 * department the end of a name is often the part that tells two apart.
 *
 * Room for "+N" is kept before a name is accepted, so the count always fits
 * after the last name shown. The first name is always shown, even when it is
 * wider than the line, because an empty preview says nothing.
 *
 * @param measure the rendered width of a text, in the same unit as `maxWidth`
 */
export function fitNamesPreview(
  names: readonly string[],
  maxWidth: number,
  measure: (text: string) => number,
): NamesPreview {
  const shown: string[] = [];
  const separatorWidth = measure(NAMES_SEPARATOR);
  let used = 0;
  for (let i = 0; i < names.length; i++) {
    const rest = names.length - i - 1;
    const add = (shown.length > 0 ? separatorWidth : 0) + measure(names[i]);
    const reserve = rest > 0 ? measure(moreLabel(rest)) : 0;
    if (shown.length > 0 && used + add + reserve > maxWidth) break;
    shown.push(names[i]);
    used += add;
  }
  return { shown, more: names.length - shown.length };
}

/**
 * Whether "+N" fits on the names line after the names shown. It does not when
 * the first name alone fills the line; the stack then says "+N more" on its
 * strip instead, so the count is never clipped.
 */
export function moreFitsOnLine(
  preview: NamesPreview,
  maxWidth: number,
  measure: (text: string) => number,
): boolean {
  if (preview.more === 0) return true;
  return (
    measure(preview.shown.join(NAMES_SEPARATOR)) + measure(moreLabel(preview.more)) <= maxWidth
  );
}
