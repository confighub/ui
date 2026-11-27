// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Marks the search matches in the sheet's text with the CSS Custom Highlight API: the browser
// draws them (an underline in the text colour, see sheetStyles) without a span per match, so a value's
// segments and wrap points stay as they are. A browser without the API shows no marks; the
// search still narrows the sheet.

import { useEffect } from 'react';

export const SEARCH_HIGHLIGHT = 'sheet-search';

// Each sheet on the page gives its ranges; the one highlight holds them all.
const rangesBySheet = new Map<object, Range[]>();

function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function publish() {
  const all = [...rangesBySheet.values()].flat();
  if (all.length === 0) CSS.highlights.delete(SEARCH_HIGHLIGHT);
  else CSS.highlights.set(SEARCH_HIGHLIGHT, new Highlight(...all));
}

// Text that is not content: the part bar (its chips repeat the headings) and the icons' labels.
const SKIP = '.partnav, .mk, [aria-hidden="true"]';

/**
 * The element whose text is read as one string, so a match can cross the segments of a value:
 * a key=value pair as a whole, else the value, key or heading the text is in.
 */
function groupOf(el: Element): Element {
  return el.closest('.pair') ?? el.closest('.v, .k, .blabel, .pname, .rhead, .phead') ?? el;
}

function findRanges(root: HTMLElement, needle: string): Range[] {
  const groups = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const parent = n.parentElement;
    if (!parent || !n.data || parent.closest(SKIP)) continue;
    const group = groupOf(parent);
    const nodes = groups.get(group);
    if (nodes) nodes.push(n);
    else groups.set(group, [n]);
  }
  const ranges: Range[] = [];
  for (const nodes of groups.values()) {
    const text = nodes.map((n) => n.data).join('').toLowerCase();
    // The start of each node in the group's text.
    const starts: number[] = [];
    let at = 0;
    for (const n of nodes) {
      starts.push(at);
      at += n.data.length;
    }
    const locate = (offset: number, end: boolean) => {
      let i = nodes.length - 1;
      // The end of a match belongs to the node it ends in, not the one after it.
      while (i > 0 && (end ? starts[i] >= offset : starts[i] > offset)) i--;
      return { node: nodes[i], offset: offset - starts[i] };
    };
    for (let from = text.indexOf(needle); from !== -1; from = text.indexOf(needle, from + needle.length)) {
      const start = locate(from, false);
      const end = locate(from + needle.length, true);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
  }
  return ranges;
}

/** Marks the matches of `text` in the sheet under `root`, and again when the sheet changes. */
export function useSearchHighlight(root: HTMLElement | null, text: string) {
  useEffect(() => {
    const needle = text.trim().toLowerCase();
    if (!root || !needle || !highlightsSupported()) return;
    const owner = {};
    let frame = 0;
    const update = () => {
      frame = 0;
      rangesBySheet.set(owner, findRanges(root, needle));
      publish();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // Parts mount as they come near the screen, and edits change the text.
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      rangesBySheet.delete(owner);
      publish();
    };
  }, [root, text]);
}
