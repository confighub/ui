// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The one rule about a selector's CONTENT that is checked on this side.
 *
 * WHY THIS IS NOT REDUNDANT WITH THE SERVER, which is the reasoning that would otherwise
 * delete it. Everything else about whether a selector is valid comes from resolving it,
 * and that is deliberate -- a client-side grammar drifts and this page has already been
 * bitten by one. But `Labels.Component = 'payments'` is a PERFECTLY VALID where
 * expression: the Space list resolves it happily and returns a real set, so resolution
 * reports nothing wrong with it.
 *
 * Only `validateStageWhereSpace` refuses it, and that runs at SAVE. So this is the single
 * case where server-authoritative resolution cannot catch what server-authoritative
 * saving will reject, because the two checks run under different rules at different
 * endpoints. Without a check here, an author writes the Stage, sees a sensible preview,
 * and learns at Save.
 *
 * The check exists for TIMING, never for authority. The server decides; this only says
 * so sooner.
 *
 * WHY THE REGEX IS COPIED RATHER THAN WRITTEN. It is `changeWorkflowComponentPredicate`
 * from `internal/models/changeworkflow.go:204`, character for character. The page's
 * previous version was `\bLabels\s*\.\s*Component\b` -- tolerant of whitespace the
 * server's is not -- and that divergence existed before anyone looked for it. A copy that
 * is nearly the same is a second rule, and a second rule drifts. If the server's changes,
 * this must change with it.
 */

/**
 * `(?i)\bLabels\.Component\b` in Go's syntax, which is this in JavaScript's.
 *
 * Not built from a constant or a template: the point is that it can be compared to the
 * server's by eye, and anything assembled cannot be.
 */
const COMPONENT_IN_SELECTOR = /\bLabels\.Component\b/i;

/**
 * Whether a Stage's selector names the component at all.
 *
 * Presence, never comparison -- what a Stage may not do is mention the component, not
 * mention it with a particular operator. A selector agreeing with the component changes
 * nothing, and one disagreeing selects nothing while reporting nothing wrong, which is
 * why the server refuses both rather than reasoning about which was meant.
 */
export function namesComponent(where: string): boolean {
  return COMPONENT_IN_SELECTOR.test(where);
}

/**
 * The server's own sentence, unedited.
 *
 * Carried rather than rewritten because it says the thing and says why, and a second
 * sentence saying the same thing worse is how the two come to disagree. From
 * `internal/views/changeworkflow.go:137`.
 */
export const COMPONENT_IN_SELECTOR_MESSAGE =
  "the component is the change order's own and is appended to every stage's selector, so remove the predicate";
