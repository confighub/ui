// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { STAGE_GAP } from '../flowLayout';

/**
 * The numbers behind folding a large Component's flow graph. They come from the
 * chosen design, tried on the Meridian demo (cert-manager: 99 Deployments under
 * one Base), so the model, the layout and the specs all read them from here.
 */

/**
 * With no Group by choice in the URL, a Component folds when it has at least
 * this many Deployments. Below it, today's layout already fits, and folding
 * would hide cards for no gain. The user can still turn the fold on or off
 * at any size from the Group by menu.
 */
export const FOLD_THRESHOLD = 10;

/**
 * The `?graphGroup=` value that turns the fold off, in any letter case. A Group
 * by key the menu offers turns it on with that key; no value, or a value that
 * is not on offer, leaves the choice to FOLD_THRESHOLD.
 */
export const GROUP_OFF = 'off';

/**
 * The most full cards one Base shows. Past this, a column of cards is again
 * too tall to scan; the rest stay coloured marks in their stacks.
 */
export const CARD_CAP = 12;

/**
 * A config condition becomes a wave (one chip and one bulk action on the
 * Base's fold) when at least this share of the Base's members has it...
 */
export const WAVE_MIN_SHARE = 0.5;

/** ...and at least this many members, so three of five is not a wave. */
export const WAVE_MIN_COUNT = 5;

/**
 * A group of 1 is never a stack. Up to 3 of them show as plain quiet cards;
 * from this many on, they merge into one stack so they do not fill the fold.
 */
export const SINGLES_MERGE_MIN = 4;

/**
 * How long a card that recovered stays a card (with a "Recovered" mark)
 * before it folds back, so a status poll does not make it vanish under the
 * user's pointer.
 */
export const RECOVERED_HOLD_MS = 60_000;

/** The most results canvas search lists. */
export const SEARCH_MAX_RESULTS = 8;

/** How long a card found by search pulses. */
export const SEARCH_PULSE_MS = 2_700;

/**
 * The Space label key `Stage`. It is not the DAG depth that `Stage` and
 * `stage` mean elsewhere in this graph's code. In Meridian it repeats the
 * Base split, so it gives about one stack per Base: it is always offered when
 * the Spaces have it, but it is never the default.
 */
export const STAGE_LABEL_KEY = 'Stage';

/**
 * The Group by key for how far a Deployment is behind its upstream Base, in
 * the model and in `?graphGroup=`. A Space label key must start with a letter or
 * digit, so a key that starts with `@` can never be the same as a label key.
 */
export const REVISION_GROUP_KEY = '@revision';

/**
 * The Group by key for the Kubernetes version of a Deployment's Target (the
 * Target fact `Cluster.KubernetesVersion`), in the model and in `?graphGroup=`.
 */
export const K8S_GROUP_KEY = '@k8s';

/**
 * The Group by key for how long ago a Deployment's latest Release was made,
 * in the model and in `?graphGroup=`.
 */
export const RELEASED_GROUP_KEY = '@released';

/**
 * The Group by key for the cloud provider of a Deployment's Target (the
 * Target fact `Cloud.Provider`), in the model and in `?graphGroup=`.
 */
export const PROVIDER_GROUP_KEY = '@provider';

/**
 * The "Last released" buckets read a clock that moves once a minute, so a
 * status poll (every 2 s) never moves a Deployment between stacks.
 */
export const RELEASE_CLOCK_MS = 60_000;

/** The default Group by keys, in order of preference. */
export const DEFAULT_GROUP_KEYS: readonly string[] = ['Department', 'Region'];

// ── Geometry of a folded graph (model px) ──────────────────────────────────
//
// A folded graph uses compact nodes. The unfolded layout's 260 px slots would
// start a Base's block at x = 720 and leave one or two stack columns, so
// cert-manager could not fit at the readable floor. The gaps between columns
// are not compacted: they are the unfolded layout's STAGE_GAP, where the
// promotion edges, their elbows and their buttons sit. The unfolded layout
// (flowLayout.ts) keeps its own numbers.

/** A tree node (a Base, or any node that is not a fold member). */
export const TREE_NODE_W = 132;
export const TREE_NODE_H = 56;
/**
 * Between tree columns: the x of depth d is d * (TREE_NODE_W + TREE_GAP).
 * The same gap the unfolded graph leaves between stages, so a promotion
 * edge, its elbow and its button have room.
 */
export const TREE_GAP = STAGE_GAP;
/** From a Base's right edge to its block of cards and fold; as roomy as TREE_GAP. */
export const BLOCK_GAP = STAGE_GAP;

/** An attention card beside a Base. */
export const CARD_W = 240;
/**
 * Every card in a Base's block is compact: a name row and a status row, with
 * no floating type or target labels, which would hit the row above.
 */
export const COMPACT_CARD_H = 84;
export const CARD_GAP = 10;
/** More card columns than this push the fold too far right to fit. */
export const MAX_CARD_COLUMNS = 3;

/** From the last card column to the fold frame. */
export const FOLD_GAP = 26;
/** The fold frame's inner padding. */
export const FOLD_PAD = 8;
/**
 * The fold header lists the values the fold holds on at most this many
 * lines, then "+N more".
 */
export const FOLD_HEAD_LINES = 2;
/** One line of values: 13 px text. */
export const FOLD_HEAD_LINE_H = 18;
export const FOLD_HEAD_PAD_TOP = 6;
/** A wave chip (22 px) in its pill. */
export const FOLD_HEAD_CHIP_H = 28;
/** The header with one line of values, and the wave chips (if any) beside it. */
export const FOLD_HEAD = FOLD_HEAD_PAD_TOP + FOLD_HEAD_CHIP_H;
/** Above each row of chips that goes below the values... */
export const FOLD_HEAD_ROW_GAP = 6;
/** ...and below the last of them. */
export const FOLD_HEAD_PAD_BOTTOM = 4;
/** The frame's border and the header's left and right padding. */
export const FOLD_HEAD_X = 24;
/** The chips go below the values when beside them the values would get less than this. */
export const FOLD_HEAD_VALUES_MIN_W = 180;
/**
 * An estimate of a 13 px Manrope character, a little wider than the mean
 * of a lowercase slug, to choose one or two header lines without a browser.
 */
export const FOLD_HEAD_CHAR_W = 7.2;

/** A stack cell. Loose quiet cards and expanded members use the same width. */
export const STACK_W = 226;
export const STACK_H = 84;
/** The sheets drawn under a stack, so it reads as a pile. */
export const STACK_DECK = 6;
export const STACK_GAP = 8;

/** The header row of an expanded stack's frame. */
export const FRAME_HEAD = 32;
export const FRAME_PAD_BOTTOM = 10;

/** Between the bands of two Bases. */
export const BAND_GAP = 16;
export const TOP_MARGIN = 20;

// ── Fit and viewport (screen px) ───────────────────────────────────────────

/** Left and right room kept free when fitting. */
export const FIT_PAD_X = 18;
/**
 * Room at the top: the canvas toolbar and the Auto / Custom toggle sit in a
 * 32 px row 15 px from the top, and the first fold header must not start
 * under them.
 */
export const FIT_TOP = 56;
/** Room at the bottom for the "More below" cue. */
export const FIT_BOTTOM = 28;
/**
 * Fit never zooms a folded graph below this: at 80%, the 13.75 px stack
 * names are still 11 px on screen. A graph that does not fit shows its top
 * and a "More below" cue instead.
 */
export const READABLE_ZOOM_FLOOR = 0.8;
/** Fit never zooms in past 100%; larger text only costs room. */
export const FIT_ZOOM_MAX = 1.0;
export const FIT_ZOOM_STEP = 0.01;
/** The user may still zoom out past the floor by hand, down to this. */
export const MIN_ZOOM_FOLDED = 0.3;
export const MAX_ZOOM = 1.5;
/** Show "More below" only when at least this many px are hidden. */
export const MORE_BELOW_MIN_HIDDEN = 4;
/** One "More below" click pans at most this share of the visible height. */
export const PAN_DOWN_FRACTION = 0.8;
