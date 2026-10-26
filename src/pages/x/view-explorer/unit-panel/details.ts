// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedRevisionRead, ExtendedUnitRead, ValidationResultList } from '@confighub/rtk-query';

import { liveStatusText, releaseTone, type RunningRelease, type VitalTone } from '../../apps/liveStatus';
import { gateLabel } from './attention';
import type { Tone } from './tones';
import type { FetchedDetails, ReleaseLive } from './verdict';

/**
 * What the row panel reads for the open Unit alone, as plain values for the
 * verdict: the Unit's own read (conflicts, its latest event, link findings,
 * gate results, the Trigger behind each gate, and warnings), the author of its head revision, and the
 * Release its Space runs. Pure, so each mapping has a spec.
 */

/** The first failing path and message of a gate, from its validation results. */
export function gateDetail(results: ValidationResultList | undefined): { path?: string; message?: string } | undefined {
  const failed = results?.find((r) => !r.Passed);
  if (!failed) return undefined;
  const attribute = failed.FailedAttributes?.find((a) => a.Path) ?? failed.FailedAttributes?.[0];
  const message =
    attribute?.Issues?.find((i) => i.Message)?.Message ?? failed.Issues?.find((i) => i.Message)?.Message ?? failed.Details?.find(Boolean);
  return { path: attribute?.Path || undefined, message: message || undefined };
}

/** The verdict's details from the read of the Unit (with its latest event included). */
export function detailsFromUnit(read: ExtendedUnitRead, spaceSlug: string): Omit<FetchedDetails, 'status'> {
  const u = read.Unit;
  const gateDetails: Record<string, { path?: string; message?: string }> = {};
  for (const [gate, results] of Object.entries(u?.ValidationResults ?? {})) {
    if (!u?.ValidationErrors?.[gate]) continue;
    const detail = gateDetail(results);
    if (detail) gateDetails[gate] = detail;
  }
  const warnings = Object.keys(u?.ValidationWarnings ?? {})
    .filter((name) => u?.ValidationWarnings?.[name])
    .sort((a, b) => a.localeCompare(b))
    .map((name) => gateLabel(name, spaceSlug));
  const e = read.LatestUnitEvent;
  return {
    conflicts: u?.Conflicts ?? [],
    event: e
      ? { status: e.Status, action: e.Action, revisionNum: e.RevisionNum || undefined, message: e.Message || undefined, at: e.TerminatedAt || e.UpdatedAt || e.CreatedAt || undefined }
      : undefined,
    linkFindings: u?.LinkFindings ?? [],
    gateDetails,
    triggerIds: u?.ValidationTriggerIDs ?? {},
    warnings,
  };
}

/** Who made a revision, as the Unit page's revisions name them. */
export function revisionAuthor(revision: ExtendedRevisionRead | undefined): string | undefined {
  return revision?.User?.DisplayName || revision?.User?.Username || undefined;
}

const LIVE_TONE: Record<VitalTone, Tone> = {
  ok: 'ok',
  neutral: 'muted',
  progress: 'info',
  attention: 'attention',
  danger: 'blocked',
};

/** The Release fact, or none when the Release has no live status: nothing was reported, so nothing is shown. */
export function releaseLive(running: RunningRelease | undefined): ReleaseLive | undefined {
  const status = running?.liveStatus;
  if (!running || !status) return undefined;
  return {
    num: running.releaseNum,
    status: liveStatusText(status),
    tone: LIVE_TONE[releaseTone(status)],
    reporter: status.Reporter || undefined,
    observedAt: status.ObservedAt,
  };
}
