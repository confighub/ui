// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Pure (no React) parse + presentation helpers for the `confighub.com/live-status`
 * Space annotation. This annotation is written by a live-infra reporter (e.g.
 * argobot watching ArgoCD Applications) and carries the last observed reconcile
 * status of whatever the Space deploys. It is purely reported state — nothing
 * here is read by the merge/upgrade/promotion engine.
 *
 * The annotation value is a JSON object (lowerCamelCase keys) mirroring the
 * `livestatus.Status` Go struct:
 *
 *   {
 *     "source":         "argocd",
 *     "app":            "my-app",
 *     "syncStatus":     "Synced" | "OutOfSync" | "Unknown",
 *     "healthStatus":   "Healthy" | "Progressing" | "Degraded" | "Missing" | "Suspended" | "Unknown",
 *     "operationPhase": "Running" | "Succeeded" | "Failed" | "Error" | "Terminating",
 *     "revision":       "<sha>",
 *     "message":        "…",
 *     "observedAt":     "2026-07-24T12:34:56Z"
 *   }
 *
 * Parsing is defensive throughout: a missing, malformed, or foreign annotation
 * value is treated as absent and never throws, so a corrupted annotation
 * degrades to "no live status" rather than breaking the view.
 */

export const LIVE_STATUS_ANNOTATION_KEY = 'confighub.com/live-status';

export interface LiveStatus {
  source?: string;
  app?: string;
  syncStatus?: string;
  healthStatus?: string;
  operationPhase?: string;
  revision?: string;
  message?: string;
  observedAt?: string;
}

type AnnotationMap = Record<string, string> | null | undefined;

/** Pull an optional string field off a parsed object without throwing. */
function optString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Parse the `confighub.com/live-status` annotation. Returns `null` when absent,
 * malformed, foreign, or carrying no recognized fields so the caller renders no
 * live-status indicator.
 */
export function parseLiveStatus(annotations: AnnotationMap): LiveStatus | null {
  const raw = annotations?.[LIVE_STATUS_ANNOTATION_KEY];
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const status: LiveStatus = {
      source: optString(obj, 'source'),
      app: optString(obj, 'app'),
      syncStatus: optString(obj, 'syncStatus'),
      healthStatus: optString(obj, 'healthStatus'),
      operationPhase: optString(obj, 'operationPhase'),
      revision: optString(obj, 'revision'),
      message: optString(obj, 'message'),
      observedAt: optString(obj, 'observedAt'),
    };
    // Require at least one meaningful signal, else treat as absent.
    if (!status.syncStatus && !status.healthStatus && !status.operationPhase) return null;
    return status;
  } catch {
    return null;
  }
}

// ============================================================================
// VITALS — two independent axes: "is it synced" and "is it healthy"
// ============================================================================
//
// The CTO wants both facts visible always, not only on exception: "I want to
// see the live status: is it synced and is it healthy." These two functions
// read the raw annotation and keep the axes apart, driving the always-visible
// "Live"/"Synced" tags on the card face (see `LiveStateChip` in
// DeploymentFlowNode.tsx) — there is deliberately no collapsed single-color
// severity rail anymore for these to also feed.
//
// **Historical note, corrected for accuracy:** the ORIGINAL shipped
// `deriveLiveStatusPresentation()` already treated `OutOfSync` as its own
// `attention` tone, correctly distinct from `Progressing` — this repo never
// shipped the collapse bug described in earlier drafts of this comment. The
// collapse was introduced MID-SESSION, in this same redesign's first pass,
// when the card-level vocabulary was restricted to ConfigHub's `UnitStatusType`
// (Ready/Progressing/Degraded/Unknown) — a vocabulary with no drift tier —
// and `OutOfSync` was folded into `Progressing` as the "closest honest fit"
// under that constraint. It was caught and reverted within the same body of
// work once the fuller two-axis requirement arrived, before ever shipping.
// `deriveLiveStatusPresentation()` (the single-axis collapsed function) no
// longer exists at all — every caller (vitals AND rail) reads the two
// independent functions below instead, which is structurally incapable of
// repeating that mistake since neither axis is ever collapsed into the other.
//
// Card-visible vocabulary: sync via ConfigHub's `SyncStatus` (Synced /
// OutOfSync / Progressing / Unknown), health via the Argo health vocabulary
// reported in the annotation (Healthy / Progressing / Degraded / Missing /
// Suspended / Unknown). Only the TONE (not these words) reaches the card
// face — the words themselves surface solely in each vital's peek.

export type VitalTone = 'ok' | 'neutral' | 'progress' | 'attention' | 'danger';

export interface VitalPresentation {
  /** Raw per-axis state word — shown only in the vital's peek, never on the card face. */
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
 * Derive the SYNC vital — "does the cluster match what was released" — from
 * the raw annotation, independent of health. Returns `null` when sync isn't
 * reported at all, which the caller renders as no mark whatsoever (absence
 * means "not reporting"; a faint "ok" mark means "reporting, and fine" — the
 * two must never look alike, see DeploymentFlowNode.tsx's `Vital`).
 */
export function deriveSyncPresentation(status: LiveStatus | undefined): VitalPresentation | null {
  if (!status) return null;
  // A failed/errored sync operation leaves the cluster out of sync with what
  // was released — that's a fact about THIS axis, not about health.
  if (status.operationPhase === 'Running') {
    return { state: 'Progressing', ...SYNC_PRESENTATION.Progressing };
  }
  if (status.operationPhase === 'Failed' || status.operationPhase === 'Error') {
    return { state: 'OutOfSync', ...SYNC_PRESENTATION.OutOfSync };
  }
  if (status.syncStatus === 'Synced') return { state: 'Synced', ...SYNC_PRESENTATION.Synced };
  if (status.syncStatus === 'OutOfSync') return { state: 'OutOfSync', ...SYNC_PRESENTATION.OutOfSync };
  if (status.syncStatus) return { state: 'Unknown', ...SYNC_PRESENTATION.Unknown }; // reported, unrecognized value
  return null; // sync not reported at all for this Space
}

/**
 * Derive the HEALTH vital — "are the workloads actually up" — independent of
 * sync, for the same reason.
 */
export function deriveHealthPresentation(status: LiveStatus | undefined): VitalPresentation | null {
  if (!status) return null;
  switch (status.healthStatus) {
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
    default:
      break;
  }
  if (status.healthStatus) return { state: 'Unknown', ...HEALTH_PRESENTATION.Unknown }; // reported, unrecognized value
  if (status.operationPhase === 'Failed' || status.operationPhase === 'Error') {
    // No healthStatus reported at all, but the operation itself failed.
    return { state: 'Degraded', ...HEALTH_PRESENTATION.Degraded };
  }
  return null; // health not reported at all
}

// ============================================================================
// DELIVERY SYSTEM — which system produced the live status, and its vocabulary
// ============================================================================
//
// The authoritative answer to "who observed this" is the annotation's own
// `source` field: it is documented on `livestatus.Status` (public/core/
// livestatus/livestatus.go) as required precisely so a reader can tell where an
// observation came from and distinguish reporters. argobot writes `"argobot"`
// today. Because it travels inside the same per-Space object the chips already
// parse, the primary path needs no Target lookup whatsoever.
//
// Anything unidentified is `'unknown'` — an EXPLICIT neutral state, never a
// silent blank.
//
// The point of knowing the system is vocabulary: each system has its own words
// for the same two axes, and paraphrasing them into a house dialect makes the
// card disagree with the console the user opens next. So the words shown come
// from the reporting system. TONE (which states read as good/bad — see
// `SYNC_PRESENTATION` / `HEALTH_PRESENTATION` above) is deliberately NOT
// provider-dependent: only the label vocabulary varies.

/** Delivery system identity used for the brand mark and the status vocabulary. */
export type LiveStatusProvider = 'argocd' | 'flux' | 'unknown';

/**
 * Map a live-status `source` (the reporting client's own name, e.g. `argobot`)
 * to a delivery system. Matched case-insensitively on substring so reporter
 * names that embed the system — `argobot`, `argocd-reporter`, `flux-watcher` —
 * all land correctly without this needing a new case per reporter.
 *
 * Known imprecision, accepted deliberately: a bare substring match on `'argo'`
 * would also fire on an unrelated reporter named e.g. `cargo-sync` or
 * `embargo-watcher`. `source` is a value ConfigHub's OWN reporters set (today:
 * only `argobot`), not third-party free text, so a collision would require
 * someone to deliberately name a reporter that way — considered an acceptable
 * trade against the alternative of an exact-match allowlist that breaks the
 * moment a reporter is renamed. Revisit if a reporter with such a name ever
 * ships.
 *
 * THIS IS THE ONE PLACE reporter names are interpreted: extend it here when a
 * new reporter appears, and every mark, tooltip and vocabulary follows.
 */
export function providerFromSource(source: string | null | undefined): LiveStatusProvider {
  if (!source) return 'unknown';
  const s = source.toLowerCase();
  if (s.includes('argo')) return 'argocd';
  if (s.includes('flux')) return 'flux';
  return 'unknown';
}

/**
 * Which delivery system a node should attribute its live status to: the one the
 * annotation's own `source` names (who actually reported). With no live status,
 * no `source`, or a `source` that is unrecognized, it is `'unknown'` — an
 * unrecognized reporter is a reason to say nothing.
 */
export function resolveLiveStatusProvider(status: LiveStatus | undefined): LiveStatusProvider {
  if (status?.source) return providerFromSource(status.source);
  return 'unknown';
}

/** Human name of the reporting system, for tooltips and peek copy. */
export const LIVE_STATUS_PROVIDER_NAME: Record<LiveStatusProvider, string> = {
  argocd: 'ArgoCD',
  flux: 'Flux',
  unknown: 'the delivery system',
};

/**
 * Flux's own words for each internal axis state. ArgoCD needs no map: the
 * internal state words above ARE Argo's vocabulary (they were lifted from the
 * annotation Argo writes), so `liveStatusLabel` uses them verbatim for
 * `'argocd'`.
 *
 * Flux collapses "synced" and "healthy" into one `Ready` condition, so both
 * axes share the same four words (Ready / Reconciling / Stalled / Suspended).
 * States with no Flux equivalent are deliberately absent rather than forced
 * into the nearest word — `liveStatusLabel` falls back to the raw state so an
 * unmappable value is never silently renamed into something Flux never said.
 *
 * NOTE: no Flux reporter writes `confighub.com/live-status` today (only
 * argobot/ArgoCD does). This map exists so a Flux reporter lights up correctly
 * the day it lands; until then a Flux-backed Space has no live status at all
 * and the card must show the neutral "not reported yet" state, never a Ready
 * it has no evidence for.
 */
const FLUX_SYNC_LABEL: Record<string, string> = {
  Synced: 'Ready',
  OutOfSync: 'Stalled',
  Progressing: 'Reconciling',
  Unknown: 'Unknown',
};

const FLUX_HEALTH_LABEL: Record<string, string> = {
  Healthy: 'Ready',
  Progressing: 'Reconciling',
  Degraded: 'Stalled',
  Suspended: 'Suspended',
  Unknown: 'Unknown',
};

/**
 * The word shown on a live-status chip, in the reporting system's own dialect.
 *
 * - `'argocd'` → Argo's words verbatim (Synced / OutOfSync / Unknown;
 *   Healthy / Progressing / Degraded / Suspended / Missing / Unknown).
 * - `'flux'` → Flux's words (Ready / Reconciling / Stalled / Suspended),
 *   falling back to the raw state for anything Flux has no word for.
 * - `'unknown'` → the generic house wording that predates this: "Live" /
 *   "Synced" when the axis is fine, the raw state otherwise. Without a named
 *   system there is no dialect to borrow, so nothing is claimed.
 */
export function liveStatusLabel(
  provider: LiveStatusProvider,
  axis: 'sync' | 'health',
  presentation: VitalPresentation,
): string {
  switch (provider) {
    case 'argocd':
      return presentation.state;
    case 'flux': {
      const map = axis === 'sync' ? FLUX_SYNC_LABEL : FLUX_HEALTH_LABEL;
      return map[presentation.state] ?? presentation.state;
    }
    default:
      if (presentation.tone === 'ok') return axis === 'health' ? 'Live' : 'Synced';
      return presentation.state;
  }
}

// ============================================================================
// REVISION
// ============================================================================

/**
 * A digest, in the `<algorithm>:<hex>` form OCI uses (`sha256:1a2b…`). The
 * algorithm may carry separators (`sha256+b64`), but never a colon, so the
 * first colon splits the two halves.
 */
const DIGEST_RE = /^([A-Za-z][A-Za-z0-9+._-]*):([0-9a-fA-F]+)$/;

/** A bare hash with no algorithm prefix — a git SHA. */
const HEX_RE = /^[0-9a-fA-F]+$/;

/** Longest revision shown verbatim when it isn't a hash at all (a tag or branch name). */
const MAX_REVISION_CHARS = 24;

/**
 * Abbreviate the hash half of a revision, using each ecosystem's own
 * convention: 7 for a git SHA-1, 12 for the longer digests OCI tooling shows.
 * Anything too short to be either is already abbreviated — leave it alone.
 */
function abbreviateHash(hex: string): string {
  if (hex.length > 40) return hex.slice(0, 12);
  if (hex.length > 7) return hex.slice(0, 7);
  return hex;
}

/**
 * Render `LiveStatus.revision` for the peek.
 *
 * The reported revision is whatever the delivery system synced to, and its
 * shape varies by source: argobot reports the OCI digest Argo pulled
 * (`sha256:<64 hex>`), a git-backed source would report a SHA, and a source
 * tracking a tag can report a plain name. Naively truncating the whole string
 * to a short-SHA width shows `sha256:` — the algorithm prefix and none of the
 * hash — so the algorithm is kept intact and only the hash half is shortened.
 *
 * Non-hash revisions (tags, branches) carry meaning in every character, so
 * they're shown whole unless absurdly long, where they're elided.
 */
export function formatLiveRevision(revision: string): string {
  const raw = revision.trim();
  const digest = DIGEST_RE.exec(raw);
  if (digest) return `${digest[1]}:${abbreviateHash(digest[2])}`;
  if (HEX_RE.test(raw)) return abbreviateHash(raw);
  return raw.length > MAX_REVISION_CHARS ? `${raw.slice(0, MAX_REVISION_CHARS - 1)}…` : raw;
}
