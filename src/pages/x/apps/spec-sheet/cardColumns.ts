// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The wide tier's layout: each section of a resource is a card, and the cards flow into two
// columns. Env and Security leave a section that holds more, as cards of their own, because
// they are the tall blocks that would make one column much longer than the other. Each card
// goes, in document order, to the shorter column, so the columns stay level and the order reads
// left, right, then down.
//
// Heights are estimated from the model, not measured: a part mounts its blocks only when it
// comes near the scroll area, and a measured layout would move cards between columns (and
// mount them again) while the reader scrolls.
import type { SheetBlock, SheetPart, SheetResource } from './specSheetModel';

/** The blocks that leave their section in two columns. */
const SPLIT_KEYS = new Set(['env', 'security']);

export interface SheetCard {
  /** Unique inside the sheet. */
  id: string;
  part: SheetPart;
  /** The block that is a card of its own (Env, Security); absent for the section's own card. */
  split?: SheetBlock;
  /** For the section's own card: the ids of its blocks that are cards of their own. */
  omit?: ReadonlySet<string>;
}

/** The cards of a resource, in document order: each section, then its split blocks. */
export function resourceCards(resource: SheetResource): SheetCard[] {
  const cards: SheetCard[] = [];
  for (const part of resource.parts) {
    // An init container folds to one line when it is quiet: its blocks stay with it, so the
    // fold holds all of them.
    const split =
      part.kind === 'init' || part.blocks.length < 2 ? [] : part.blocks.filter((b) => SPLIT_KEYS.has(b.key));
    cards.push({ id: part.id, part, omit: split.length ? new Set(split.map((b) => b.id)) : undefined });
    for (const block of split) cards.push({ id: block.id, part, split: block });
  }
  return cards;
}

/** Line height of a value row, and the fixed parts of a card and a block (sheetStyles.ts). */
const LINE_PX = 22;
const CARD_HEAD_PX = 50;
const BLOCK_PAD_PX = 15;
const HEADING_PX = 26;
/** A folded init container's one line. */
const FOLD_PX = 40;
/** The width of a 12px monospace character, and what a block takes from the card's width. */
const CHAR_PX = 7.3;
const BLOCK_INSET_PX = 30;
const LABEL_COLUMN_PX = 96;
const HEADING_KEYS = new Set(['image', 'command', 'ports', 'env', 'resources', 'probes', 'mounts', 'security', 'volumes']);
const TOKEN_KEYS = new Set(['labels', 'annotations', 'selector', 'matchLabels', 'nodeSelector']);

const textOf = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '');

/** About how many lines a block draws in a card this wide: one per row of its shape. */
function blockLines(block: SheetBlock, width: number): number {
  const n = block.atoms.length;
  if (block.key === 'resources') return 3;
  if (block.key === 'probes') return 1 + new Set(block.atoms.map((a) => a.segments.find((s) => /Probe$/.test(String(s))))).size;
  if (block.key === 'security') {
    const flags = block.atoms.filter((a) => typeof a.value === 'boolean').length;
    return Math.ceil(flags / 3) + Math.ceil((n - flags) / 3);
  }
  if (TOKEN_KEYS.has(block.key)) {
    // Tokens wrap: their text, key and value, over the value column.
    const chars = block.atoms.reduce((sum, a) => sum + a.path.split('.').pop()!.length + textOf(a.value).length + 4, 0);
    return Math.max(1, Math.ceil((chars * CHAR_PX) / (width - BLOCK_INSET_PX - LABEL_COLUMN_PX)));
  }
  // A row per list item (an env var, a port, a mount), and one per list of plain values.
  const rows = new Map<string, number>();
  for (const a of block.atoms) {
    let row = a.path;
    if (a.list) row = a.list.path;
    else {
      // The item is the last list index: the first is the container's own, in the part's path.
      let at = a.segments.length - 1;
      while (at >= 0 && typeof a.segments[at] !== 'number') at--;
      if (at >= 0) row = a.segments.slice(0, at + 1).join('.');
    }
    rows.set(row, (rows.get(row) ?? 0) + textOf(a.value).length + 2);
  }
  // An env var with a key reference takes a second line where name and reference do not fit.
  let lines = 0;
  for (const chars of rows.values()) lines += block.key === 'env' && chars * CHAR_PX > width - BLOCK_INSET_PX ? 2 : 1;
  return Math.max(1, lines);
}

function blockPx(block: SheetBlock, width: number, lone: boolean): number {
  const heading = HEADING_KEYS.has(block.key) && !lone ? HEADING_PX : 0;
  return BLOCK_PAD_PX + heading + blockLines(block, width) * LINE_PX;
}

/** About how tall a card draws at this width; blocks a search hides take no room. */
export function cardPx(
  card: SheetCard,
  width: number,
  isHidden: (block: SheetBlock) => boolean,
  folded: (part: SheetPart) => boolean,
): number {
  if (!card.split && folded(card.part)) return CARD_HEAD_PX + FOLD_PX;
  const blocks = card.split ? [card.split] : card.part.blocks.filter((b) => !card.omit?.has(b.id));
  return CARD_HEAD_PX + blocks.filter((b) => !isHidden(b)).reduce((sum, b) => sum + blockPx(b, width, !!card.split), 0);
}

/** Two columns of cards: each card, in document order, to the shorter one (the first on a tie). */
export function intoColumns<C>(cards: readonly C[], heightOf: (card: C) => number): [C[], C[]] {
  const columns: [C[], C[]] = [[], []];
  const heights = [0, 0];
  for (const card of cards) {
    const h = heightOf(card);
    const i = heights[1] < heights[0] ? 1 : 0;
    columns[i].push(card);
    // A card no one sees (a search hides it) takes no room.
    if (h > 0) heights[i] += h + 16;
  }
  return columns;
}
