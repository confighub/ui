// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure (no React) helpers for the live status of a deployment: what the tool
 * deploying a Release (e.g. argobot watching an Argo CD Application) reports
 * about it running.
 *
 * The status is `Release.LiveStatus`, so it describes one Release. A Space's
 * live status is the status of the Release it is running: its latest published
 * Release for its current release Target, the one the server's `Healthy`
 * promotion gate reads. When that Release carries no `LiveStatus`, the Space
 * has not been reported on yet. It never borrows the status of an older
 * Release, because that status is about a configuration the Space is no longer
 * running.
 *
 * Sync, Health and Operation are normalized by the server, so gates and tones
 * read them whatever the reporter. The reporter's own words (`ReporterSync`,
 * `ReporterHealth`, `ReporterOperation`) are kept for display detail only.
 */
import type { ExtendedReleaseRead, ReleaseLiveStatus } from '@confighub/rtk-query';

export type LiveStatus = ReleaseLiveStatus;

/** The Release a Space is running, and what its deploying tool reports about it. */
export interface RunningRelease {
  releaseId?: string;
  releaseNum: number;
  /** Identifies the bundle that was deployed. */
  manifestDigest?: string;
  createdAt?: string;
  /** `null` until the deploying tool reports on this Release. */
  liveStatus: LiveStatus | null;
}

/**
 * The Release each Space is running: among the given Releases, the published
 * one with the highest `ReleaseNum` for the Space's current release Target.
 *
 * `releaseTargetIdBySpaceId` names the Spaces asked about. A Space with no
 * release Target is running no Release, as the server's `GetLatest` answers,
 * so it gets no entry even when it published some before its Target was
 * cleared. A Release that does not name its Target is taken as being for the
 * current one.
 */
export function runningReleases(
  releases: readonly ExtendedReleaseRead[],
  releaseTargetIdBySpaceId: ReadonlyMap<string, string | undefined>,
): Map<string, RunningRelease> {
  const bySpaceId = new Map<string, RunningRelease>();
  for (const entry of releases) {
    const release = entry.Release;
    const spaceId = release?.SpaceID;
    const releaseNum = release?.ReleaseNum;
    if (!release || !spaceId || releaseNum === undefined) continue;
    if (release.Published === false) continue;
    const releaseTargetId = releaseTargetIdBySpaceId.get(spaceId);
    if (!releaseTargetId) continue;
    if (release.TargetID && release.TargetID !== releaseTargetId) continue;
    const current = bySpaceId.get(spaceId);
    if (current && current.releaseNum >= releaseNum) continue;
    bySpaceId.set(spaceId, {
      releaseId: release.ReleaseID,
      releaseNum,
      manifestDigest: release.ManifestDigest,
      createdAt: release.CreatedAt,
      liveStatus: release.LiveStatus ?? null,
    });
  }
  return bySpaceId;
}

// ============================================================================
// VITALS — two independent axes: "is it synced" and "is it healthy"
// ============================================================================
//
// Both facts are shown always, not only on exception, and neither is folded
// into the other: OutOfSync is drift, Progressing is a reconcile in flight, and
// a card that collapsed them into one word could not say which. These two
// functions drive the always-visible tags on the card face (`LiveStateChip` in
// DeploymentFlowNode.tsx) and the folded graph's conditions.
//
// Only the TONE reaches the card face; the state words surface in each vital's
// peek.

export type VitalTone = 'ok' | 'neutral' | 'progress' | 'attention' | 'danger';

export interface VitalPresentation {
  /** Per-axis state word, normalized — shown only in the vital's peek, never on the card face. */
  state: string;
  tone: VitalTone;
  /** One-line description for the peek. */
  desc: string;
}

type ToneDesc = Omit<VitalPresentation, 'state'>;

const SYNC_PRESENTATION: Record<'Synced' | 'OutOfSync' | 'Progressing' | 'Unknown', ToneDesc> = {
  Synced: { tone: 'ok', desc: 'Cluster matches the released config' },
  OutOfSync: { tone: 'attention', desc: 'Cluster has drifted from the released config' },
  Progressing: { tone: 'progress', desc: 'Reconcile in flight' },
  Unknown: { tone: 'neutral', desc: 'Not reported by the worker' },
};

const HEALTH_PRESENTATION: Record<
  'Healthy' | 'Progressing' | 'Degraded' | 'Missing' | 'Suspended' | 'Unknown',
  ToneDesc
> = {
  Healthy: { tone: 'ok', desc: 'Workloads are up and passing' },
  Progressing: { tone: 'progress', desc: 'Rollout in flight' },
  Degraded: { tone: 'danger', desc: 'Workloads failing' },
  Missing: { tone: 'danger', desc: 'Expected workloads absent' },
  Suspended: { tone: 'neutral', desc: 'Reconciliation paused' },
  Unknown: { tone: 'neutral', desc: 'Not reported by the worker' },
};

/**
 * Derive the SYNC vital — "does the cluster match what was released" —
 * independent of health. Returns `null` when sync isn't reported at all, which
 * the caller renders as no mark whatsoever (absence means "not reporting"; a
 * faint "ok" mark means "reporting, and fine" — the two must never look alike,
 * see DeploymentFlowNode.tsx's `Vital`).
 */
export function deriveSyncPresentation(status: LiveStatus | null | undefined): VitalPresentation | null {
  if (!status) return null;
  // An operation in flight or failed says more about whether the cluster has
  // the Release than the last sync comparison does.
  if (status.Operation === 'Running') {
    return { state: 'Progressing', ...SYNC_PRESENTATION.Progressing };
  }
  if (status.Operation === 'Failed') {
    return { state: 'OutOfSync', ...SYNC_PRESENTATION.OutOfSync };
  }
  if (status.Sync === 'Synced') return { state: 'Synced', ...SYNC_PRESENTATION.Synced };
  if (status.Sync === 'OutOfSync') return { state: 'OutOfSync', ...SYNC_PRESENTATION.OutOfSync };
  if (status.Sync) return { state: 'Unknown', ...SYNC_PRESENTATION.Unknown };
  return null;
}

/**
 * Derive the HEALTH vital — "are the workloads actually up" — independent of
 * sync, for the same reason.
 */
export function deriveHealthPresentation(status: LiveStatus | null | undefined): VitalPresentation | null {
  if (!status) return null;
  switch (status.Health) {
    case 'Healthy':
      return { state: 'Healthy', ...HEALTH_PRESENTATION.Healthy };
    case 'Progressing':
      return { state: 'Progressing', ...HEALTH_PRESENTATION.Progressing };
    case 'Degraded':
      return { state: 'Degraded', ...HEALTH_PRESENTATION.Degraded };
    case 'Missing':
      return { state: 'Missing', ...HEALTH_PRESENTATION.Missing };
    case 'Suspended':
      return { state: 'Suspended', ...HEALTH_PRESENTATION.Suspended };
    case 'Unknown':
      return { state: 'Unknown', ...HEALTH_PRESENTATION.Unknown };
    default:
      break;
  }
  if (status.Operation === 'Failed') {
    // No health reported at all, but the operation itself failed.
    return { state: 'Degraded', ...HEALTH_PRESENTATION.Degraded };
  }
  return null;
}

/** How severe each tone is, for picking the worst of several: danger > attention > progress > neutral > ok. */
export const TONE_SEVERITY: Record<VitalTone, number> = {
  ok: 0,
  neutral: 1,
  progress: 2,
  attention: 3,
  danger: 4,
};

/** Legend order, worst last, with what each tone means for a Release. */
export const LIVE_TONE_LEGEND: readonly { tone: VitalTone; label: string }[] = [
  { tone: 'ok', label: 'Synced and healthy' },
  { tone: 'neutral', label: 'Not reported' },
  { tone: 'progress', label: 'Progressing' },
  { tone: 'attention', label: 'Out of sync' },
  { tone: 'danger', label: 'Degraded or failed' },
];

/** The more severe of two tones. */
export function worseTone(a: VitalTone, b: VitalTone): VitalTone {
  return TONE_SEVERITY[b] > TONE_SEVERITY[a] ? b : a;
}

/**
 * One tone for a Release's live status: the worse of its sync and health
 * vitals, so a Release that is Synced but Degraded reads as failing. A Release
 * with no status, or with neither axis reported, is `neutral`: nothing says it
 * is fine.
 */
export function releaseTone(status: LiveStatus | null | undefined): VitalTone {
  const sync = deriveSyncPresentation(status);
  const health = deriveHealthPresentation(status);
  if (!sync && !health) return 'neutral';
  return worseTone(sync?.tone ?? 'ok', health?.tone ?? 'ok');
}

/**
 * Peek lines carrying the reporter's own words for an axis, and the operation
 * applying the Release. The normalized state loses detail a person debugging
 * the deployment wants: Argo CD's `Error` phase is normalized to `Failed`, and
 * `Error` is the word they will search for. The reporter's word is shown only
 * when it differs from the normalized one, which the chip already says.
 */
export function reporterDetailLines(
  status: LiveStatus | null | undefined,
  axis: 'sync' | 'health',
): string[] {
  if (!status) return [];
  const lines: string[] = [];
  const word = axis === 'sync' ? status.ReporterSync : status.ReporterHealth;
  const normalized = axis === 'sync' ? status.Sync : status.Health;
  if (word && word !== normalized) lines.push(`reported as ${word}`);
  const operation = status.ReporterOperation || status.Operation;
  if (operation) lines.push(`operation: ${operation}`);
  return lines;
}

// ============================================================================
// WORDS — what a live status chip says
// ============================================================================
//
// Chips show the normalized words (Synced / OutOfSync; Healthy / Progressing /
// Degraded / …) whatever tool reported the status: every reporter maps its own
// states onto them, so a word means the same thing on every deployment. The
// reporter's own words are shown in the detail lines (`reporterDetailLines`),
// and its name (`Reporter`) only as "via …".

/** A Release's live status in normalized words, "Synced · Healthy", or "Not reported". */
export function liveStatusText(status: LiveStatus | null | undefined): string {
  if (!status) return 'Not reported';
  const words = [deriveSyncPresentation(status)?.state, deriveHealthPresentation(status)?.state].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : 'Not reported';
}

// ============================================================================
// DIGEST
// ============================================================================

/**
 * A digest, in the `<algorithm>:<hex>` form OCI uses (`sha256:1a2b…`). The
 * algorithm may carry separators (`sha256+b64`), but never a colon, so the
 * first colon splits the two halves.
 */
const DIGEST_RE = /^([A-Za-z][A-Za-z0-9+._-]*):([0-9a-fA-F]+)$/;

/** A bare hash with no algorithm prefix. */
const HEX_RE = /^[0-9a-fA-F]+$/;

/** Longest value shown verbatim when it isn't a hash at all. */
const MAX_DIGEST_CHARS = 24;

/**
 * Abbreviate the hash half of a digest, using each ecosystem's own convention:
 * 7 for a git SHA-1, 12 for the longer digests OCI tooling shows. Anything too
 * short to be either is already abbreviated — leave it alone.
 */
function abbreviateHash(hex: string): string {
  if (hex.length > 40) return hex.slice(0, 12);
  if (hex.length > 7) return hex.slice(0, 7);
  return hex;
}

/**
 * Render a Release's `ManifestDigest` for the peek.
 *
 * Truncating the whole string to a short-hash width would show `sha256:` — the
 * algorithm prefix and none of the hash — so the algorithm is kept intact and
 * only the hash half is shortened. Anything that is not a hash is shown whole
 * unless absurdly long, where it is elided.
 */
export function formatDigest(digest: string): string {
  const raw = digest.trim();
  const parts = DIGEST_RE.exec(raw);
  if (parts) return `${parts[1]}:${abbreviateHash(parts[2])}`;
  if (HEX_RE.test(raw)) return abbreviateHash(raw);
  return raw.length > MAX_DIGEST_CHARS ? `${raw.slice(0, MAX_DIGEST_CHARS - 1)}…` : raw;
}
