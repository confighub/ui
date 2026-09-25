// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Size guard for oversized unit payloads — "show fast, load full on demand".
 *
 * Opening a component builds its field tree synchronously: YAML document parse →
 * flatten → diff → tree. On a multi-megabyte unit that is most of a second of
 * blocked main thread, and the whole page is frozen for it. The guard's job is to
 * answer "is this one of those?" WITHOUT doing any of that work — so every
 * function here is O(1) on the configuration string and never parses it, never
 * allocates a copy of it.
 *
 * That constraint is the whole point. A guard that parsed first to measure
 * accurately would pay a large slice of the cost it exists to avoid.
 *
 * ── Terminology ────────────────────────────────────────────────────────────
 * Deliberately distinct from the treeview's existing "Large unit (N fields) —
 * folders collapsed by default" banner (`MASSIVE_UNIT_THRESHOLD`, diffTree.ts),
 * which is about PATH COUNT and measured AFTER parsing. This guard is about
 * BYTES and is measured BEFORE parsing. Two thresholds, two different things:
 *   • "Large unit"  → the existing field-count banner (folders start collapsed)
 *   • "not loaded"  → this byte-size gate (nothing was parsed at all)
 * Keep the vocabularies separate; calling both "large" makes bug reports
 * unreadable.
 */

/**
 * The per-unit main-thread budget a cold component build is allowed to spend
 * before we stop doing it automatically.
 *
 * ~300ms is the "sluggish but not broken" band: noticeably slower than instant,
 * still short enough that the pane feels like it is responding rather than
 * hanging. Below it we render; above it we ask.
 */
export const HEAVY_UNIT_BUILD_BUDGET_MS = 300;

/**
 * Payload size (bytes) at or above which a unit's field tree is NOT built
 * automatically.
 *
 * ── How this number was derived (measured 2026-07-29) ──────────────────────
 * `componentTreePipeline.bench.test.ts` → `fullBuildEndToEnd.cold` on the real
 * 5.3MB kyverno fixture (test-data/kyverno-no-replicas.yaml):
 *
 *     5,373,106 bytes  →  901.72 ms   =  176.0 ms per MB
 *
 * That is the cost of ONE cold build exactly as ComponentValuesSection performs
 * it (computeFieldDiffs + buildPaths + buildFieldPathMeta + buildPathTree +
 * injectKeyContext). A second, independent sweep over document subsets of the
 * same fixture agreed closely and, importantly, showed the rate is FLAT with
 * size — 186.8 ms/MB at 3.04MB and 186.9 ms/MB at 5.12MB — so cost is linear in
 * bytes and one byte threshold prices every unit. Taking ~180 ms/MB:
 *
 *     300 ms budget ÷ 180 ms/MB  ≈  1.67 MB
 *
 * Rounded DOWN to 1.5 MiB (1,572,864 bytes); rounding up to 1.75 MB would put a
 * threshold-sized unit near 350ms, the top of the acceptable band.
 *
 * Measured DIRECTLY at that size rather than trusting the extrapolation —
 * `unitSizeGuardThreshold.bench.test.ts` builds a 1.575MB payload and reports
 * 327ms (207.8 ms/MB), i.e. ~311ms at exactly 1.5 MiB. Small payloads carry
 * proportionally more fixed overhead than the 5MB fixture, which is why the
 * measured rate here is ~15% above the large-payload rate. 311ms is 4% over the
 * 300ms design target and comfortably inside the 250–350ms band the budget was
 * chosen from, so the threshold stands. That test re-measures on every run and
 * fails if this stops holding.
 *
 * NOTE: the threshold is deliberately NOT tree-shape-aware. An earlier plan
 * paired it with an `arrayFolders x leafPaths` gate, because a 213KB wide
 * document once cost 2.4 SECONDS of tree building. The de-quadratic fix in
 * 8837e8c51 brought that same document to ~5ms (see
 * `diffTreeScaling.bench.test.ts`), so tree shape no longer predicts cost —
 * bytes do. Do not reintroduce a shape gate without a measurement showing
 * shape has become predictive again.
 */
export const HEAVY_UNIT_BYTES = 1_572_864; // 1.5 MiB

/**
 * Payload size at or above which a unit's field tree is rendered in a
 * DEFERRED low-priority pass (skeleton first, tree a beat later) instead of
 * synchronously blocking the paint.
 *
 * 256 KB costs roughly 47ms at the measured rate — about three dropped frames,
 * the point at which a synchronous mount starts to read as a stutter rather than
 * as instant. It is a floor, not a gate: everything above it still renders
 * automatically and in full. Its only job is to stop small units from flashing a
 * skeleton they never needed.
 */
export const DEFERRED_PAINT_BYTES = 262_144; // 256 KB

/**
 * Payload size at or above which a unit's header row carries a size
 * chip. Below this, size is not the interesting thing about a unit and the chip
 * is noise.
 */
export const UNIT_SIZE_CHIP_BYTES = 524_288; // 512 KB

/**
 * Byte size of a configuration payload, from its LENGTH alone.
 *
 * The data endpoints serve the configuration as text, so its length IS its size —
 * in UTF-16 code units, which equals bytes for the ASCII that YAML, JSON, TOML,
 * INI, properties and .env configuration is almost entirely made of, and
 * under-counts only for the occasional multibyte character in a comment or value.
 * That residual is far below the resolution these thresholds are set at, and the
 * parse cost they price is proportional to length rather than to bytes anyway.
 *
 * O(1) — it reads the string's length. It never parses.
 */
export function payloadBytes(data: string | undefined): number {
  return data ? data.length : 0;
}

/**
 * Whether this unit's field tree should be held back until the user asks for it.
 *
 * Takes the configuration as the data endpoint served it. Returns false for absent
 * data — a unit with nothing to render is not heavy, it is empty.
 */
export function isHeavyUnitData(data: string | undefined): boolean {
  return payloadBytes(data) >= HEAVY_UNIT_BYTES;
}

/**
 * Whether this unit is big enough that mounting its tree should be deferred a
 * beat so the surrounding pane paints first. Only meaningful for units BELOW
 * `HEAVY_UNIT_BYTES` — heavier ones don't render at all until asked.
 */
export function shouldDeferUnitPaint(data: string | undefined): boolean {
  return payloadBytes(data) >= DEFERRED_PAINT_BYTES;
}

/** Whether a unit is big enough to be worth labelling with a size chip. */
export function shouldShowUnitSizeChip(data: string | undefined): boolean {
  return payloadBytes(data) >= UNIT_SIZE_CHIP_BYTES;
}

/**
 * Human-readable payload size for display, e.g. `"4.9 MB"`, `"820 KB"`.
 *
 * One decimal place at MB scale (the size is a supporting fact in a sentence,
 * not a measurement to act on), whole numbers below that. Uses 1024-based units
 * matching how the rest of the product reports file sizes.
 */
export function formatUnitSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Size label for a unit straight from its configuration, e.g. `"4.9 MB"`.
 * Convenience wrapper — still O(1) and still parse-free.
 */
export function formatUnitDataSize(data: string | undefined): string {
  return formatUnitSize(payloadBytes(data));
}
