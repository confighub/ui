// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Tracks whether an id-keyed value just transitioned to a NEW id whose
 * recorded creation time is within `windowMs` of now — i.e. "this just
 * happened," not merely "this is different from the last render." This
 * distinction matters for releases: withdrawing the current release
 * promotes an OLDER pre-existing release to "latest," and that transition
 * must NOT light up as fresh (its CreatedAt is old), only an actual new
 * publish should. Self-clearing after `windowMs` — no caller cleanup needed
 * beyond unmount (handled internally).
 *
 * Shared by the Releases tab's fresh-tint dot (ComponentSidePane) and the
 * DAG edge-pulse trigger (AppComponentView), which use different windows for
 * the same underlying "just published" signal.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Single shared "just published" settle duration for the release UI's warm
 * (accent) fresh-tint highlight. Consumed by BOTH:
 *  - the DAG node's ReleaseChip (indirectly — its `$fresh` state is driven
 *    by `successMessage` clearing, via AppComponentView's `flashSuccess`,
 *    which uses this constant as its timeout)
 *  - the Releases tab's fresh-tint dot in ComponentSidePane (directly —
 *    passed as `windowMs` to `useFreshSignal`)
 * Previously these were two independent magic numbers (3000ms and 4500ms)
 * that settled at different times for the SAME publish event, which read as
 * out of sync when both were visible at once. Change this one value to
 * retune both together.
 */
export const RELEASE_FRESH_SETTLE_MS = 3000;

export function useFreshSignal(
  id: string | undefined,
  createdAt: string | undefined,
  windowMs: number,
): boolean {
  const [isFresh, setIsFresh] = useState(false);
  const prevIdRef = useRef(id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (id && id !== prevIdRef.current) {
      const createdAtMs = createdAt ? new Date(createdAt).getTime() : 0;
      if (Date.now() - createdAtMs < windowMs) {
        setIsFresh(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setIsFresh(false), windowMs);
      }
    }
    prevIdRef.current = id;
  }, [id, createdAt, windowMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return isFresh;
}
