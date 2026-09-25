// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How often to re-read the ChangeOrder while a rollout is on screen.
 *
 * A promotion is not necessarily ours — CI drives most of them — so the view has
 * to notice progress it did not cause. 5s matches the cadence of a person
 * watching a rollout without making the ChangeOrder read (which recomputes the
 * propagation graph server-side, see `changeorder_propagation.go`) a hot loop.
 * The component view's own gate poll runs at 2s, but that one reads cheap
 * columns; this one walks Links.
 */
export const ROLLOUT_POLL_INTERVAL_MS = 5000;
