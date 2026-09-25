// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Token-level inline (substring) diff of two config VALUES.
 *
 * Lives beside `diffStyles` / `diffConstants` — the shared leaves of the
 * component-view diff renderers — so both the staged-preview pill
 * (`ComponentValuesSection`) and the 3-column side-by-side tree
 * (`TreeDiffSection`) can use it without either importing the other.
 */

export interface InlineDiffSegment {
  text: string;
  changed: boolean;
}

/** Both sides of one value change: which tokens left, and which arrived. */
export interface InlineDiffPair {
  /** Segments of the OLD value; `changed` marks tokens REMOVED by the change. */
  old: InlineDiffSegment[];
  /** Segments of the NEW value; `changed` marks tokens ADDED by the change. */
  new: InlineDiffSegment[];
  /**
   * True when the values were too long to align and each side was returned as one
   * whole-value `changed` segment (see {@link getInlineDiffPair}). The segments are
   * then a coarse "it all changed", not a token alignment, so a renderer that draws
   * a box per changed token should fall back to flat text instead.
   */
  truncated: boolean;
}

/**
 * Tokenise a value into maximal ALPHANUMERIC runs and maximal NON-ALPHANUMERIC
 * runs (separators/punctuation/whitespace). This is the granularity the inline
 * diff aligns on, so words and numbers diff as whole tokens and separators anchor
 * the alignment.
 */
const TOKEN_PATTERN = /[A-Za-z0-9]+|[^A-Za-z0-9]+/g;

export function tokenizeForDiff(value: string): string[] {
  // Safe to share one global RegExp: String.prototype.match resets lastIndex.
  return value.match(TOKEN_PATTERN) ?? [];
}

/**
 * Longest unchanged run, in characters, that may be absorbed into the highlight
 * when changed text sits on BOTH sides of it. A separator this short — the `.` of
 * `1.21.0`→`1.24.3`, the `:` of `host:8080`, a `/`, `-` or `=` — is punctuation
 * inside ONE edited value, not a piece of it that survived: leaving it dim splits
 * a single edit into two boxes and reads as two unrelated changes.
 */
const INLINE_DIFF_BRIDGE_MAX_CHARS = 2;

/**
 * Merge changed segments that are separated only by a very short INTERIOR
 * unchanged run, so a version bump or a port change renders as ONE box.
 *
 * An unchanged segment is absorbed only when it is at most
 * {@link INLINE_DIFF_BRIDGE_MAX_CHARS} characters AND has a changed segment on
 * each side. Leading and trailing unchanged runs therefore always stay dim — the
 * shared prefix/suffix that anchors the value must never be swallowed.
 */
function bridgeShortUnchangedRuns(segments: InlineDiffSegment[]): InlineDiffSegment[] {
  const bridged: InlineDiffSegment[] = [];
  for (let k = 0; k < segments.length; k++) {
    const segment = segments[k];
    const bridges =
      !segment.changed &&
      segment.text.length <= INLINE_DIFF_BRIDGE_MAX_CHARS &&
      k > 0 &&
      k < segments.length - 1 &&
      segments[k - 1].changed &&
      segments[k + 1].changed;
    const changed = segment.changed || bridges;
    const last = bridged[bridged.length - 1];
    if (last && last.changed === changed) last.text += segment.text;
    else bridged.push({ text: segment.text, changed });
  }
  return bridged;
}

/**
 * TOKEN-LEVEL LCS diff of `next` against `current`, emitting BOTH sides from a
 * single DP table. One pass is cheaper than diffing twice with the arguments
 * swapped, and — more importantly — both sides are read off the same alignment
 * walk, so the two columns always agree on which token corresponds to which. The
 * per-side bridging below can still label the sides differently: a short unchanged
 * run that is interior on one side may be leading or trailing on the other, where
 * nothing absorbs it. Render each side from its own segments; the flags are not
 * symmetric.
 *
 * Diffing at token (word/number/separator) granularity — not per character — means
 * a word that changes is highlighted WHOLE, instead of sharing stray characters with
 * the old value. e.g. `TRUE`→`FALSE` reads as one changed token, not `TRU`/`FALS`
 * leaving a misleading shared trailing `E`:
 *   `nginx:1.27`→`nginx:1.28` → new `nginx:1.` | `28`   (only the changed number token)
 *   `8080`→`8090`             → new `8090`              (the whole numeric token changes)
 *   `TRUE`→`FALSE`            → new `FALSE`             (whole token; no shared `E`)
 *   `info`→`info debug`       → new `info` | ` debug`   (appended tokens; old side unchanged)
 *   identical                 → a single unchanged segment on each side
 *
 * Short interior separators are then bridged (see {@link bridgeShortUnchangedRuns}),
 * so one edited value stays one highlight:
 *   `1.21.0`→`1.24.3`         → new `1.` | `24.3`      (not `24` | `.` | `3`)
 */
export function computeInlineDiffPair(current: string, next: string): InlineDiffPair {
  const a = tokenizeForDiff(current);
  const b = tokenizeForDiff(next);
  const m = a.length;
  const n = b.length;
  // Longest-common-subsequence table over tokens (suffix DP).
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const oldSegments: InlineDiffSegment[] = [];
  const newSegments: InlineDiffSegment[] = [];
  // Coalesce runs of the same flag so adjacent tokens render as one span.
  const push = (into: InlineDiffSegment[], text: string, changed: boolean) => {
    const last = into[into.length - 1];
    if (last && last.changed === changed) last.text += text;
    else into.push({ text, changed });
  };
  // Walk the alignment: tokens on the LCS are unchanged on both sides, tokens
  // only in `current` are removals, tokens only in `next` are additions.
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      push(oldSegments, a[i], false);
      push(newSegments, b[j], false);
      i++;
      j++;
    } else if (i < m && (j === n || dp[i + 1][j] >= dp[i][j + 1])) {
      push(oldSegments, a[i], true);
      i++;
    } else {
      push(newSegments, b[j], true);
      j++;
    }
  }
  return {
    old: bridgeShortUnchangedRuns(oldSegments),
    new: bridgeShortUnchangedRuns(newSegments),
    truncated: false,
  };
}

/**
 * The `next` side only, for callers that superimpose the incoming value onto the
 * current one in a single pill and so have no column to colour the removals in.
 */
export function computeInlineDiff(current: string, next: string): InlineDiffSegment[] {
  return computeInlineDiffPair(current, next).new;
}

// Above this CHARACTER count on either side, fall back to a whole-value swap
// (everything "changed") rather than building the token LCS. Keeps huge CRD schema
// strings cheap. Sized so a typical config value (env vars, tags, ports, URLs)
// always gets the precise token diff while pathological multi-KB blobs short-circuit.
const INLINE_DIFF_CHAR_CAP = 2000;

// Memo cache for computeInlineDiffPair. The same (current,next) pair is recomputed
// on every row re-render (accept, flash, poll, resize) and the result is
// value-stable, so cache it keyed on the pair. Bounded to avoid unbounded growth
// on large units.
const INLINE_DIFF_CACHE_MAX = 2000;
const inlineDiffCache = new Map<string, InlineDiffPair>();

/**
 * Cached + length-capped wrapper around computeInlineDiffPair. Use this from the
 * render path instead of the compute functions directly: it memoizes results per
 * (current,next) pair across re-renders and short-circuits pathologically long
 * values to a whole-value swap so the full strings are never scanned for them.
 */
export function getInlineDiffPair(current: string, next: string): InlineDiffPair {
  const cacheKey = JSON.stringify([current, next]);
  const cached = inlineDiffCache.get(cacheKey);
  if (cached) return cached;

  let pair: InlineDiffPair;
  if (current.length > INLINE_DIFF_CHAR_CAP || next.length > INLINE_DIFF_CHAR_CAP) {
    // Whole-value swap fallback: treat each entire value as changed. Flagged
    // `truncated` so a caller can tell this coarse result from a genuine
    // every-token-changed alignment.
    pair = {
      old: current.length ? [{ text: current, changed: true }] : [],
      new: next.length ? [{ text: next, changed: true }] : [],
      truncated: true,
    };
  } else {
    pair = computeInlineDiffPair(current, next);
  }

  if (inlineDiffCache.size >= INLINE_DIFF_CACHE_MAX) {
    // Evict the oldest-inserted entry (FIFO — first key in insertion order)
    // rather than clearing the whole map — a full clear mid-render destroys the
    // cache on the large multi-CRD units this cache exists to speed up.
    const oldest = inlineDiffCache.keys().next().value;
    if (oldest !== undefined) inlineDiffCache.delete(oldest);
  }
  inlineDiffCache.set(cacheKey, pair);
  return pair;
}

/** {@link getInlineDiffPair}, narrowed to the `next` side. */
export function getInlineDiff(current: string, next: string): InlineDiffSegment[] {
  return getInlineDiffPair(current, next).new;
}
