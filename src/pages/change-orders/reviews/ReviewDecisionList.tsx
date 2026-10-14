// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every decision on the stage, newest first: live ones in colour, revoked and
 * expired ones dimmed with the reason they no longer count.
 *
 * A decision is the Attestation records one person made in one `/attest` call,
 * one per Space. The "N Spaces" toggle lists them.
 */

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewLinkButtonSx } from './reviewButtons';
import { agoText, entryText, firstName, reviewCopy, reviewTime } from './reviewCopy';
import { Monogram, ReviewChip, ReviewTag } from './reviewParts';
import type { RequirementProgress, RequirementRules, ReviewDecision } from './changeOrderReviewTypes';

const copy = reviewCopy.decision;

function DecisionChip({ decision }: { decision: ReviewDecision }) {
  if (decision.expired) {
    return (
      <ReviewChip tone="idle">
        <AccessTimeIcon aria-hidden="true" />
        {copy.expired}
      </ReviewChip>
    );
  }
  if (decision.revokedAt !== undefined) return <ReviewChip tone="idle">{copy.revoked}</ReviewChip>;
  if (decision.result === 'Pass') {
    return (
      <ReviewChip tone="ok">
        <CheckIcon aria-hidden="true" />
        {copy.approved}
      </ReviewChip>
    );
  }
  return (
    <ReviewChip tone="bad">
      <BlockIcon aria-hidden="true" />
      {copy.rejected}
    </ReviewChip>
  );
}

function linkLine(decision: ReviewDecision, byId: ReadonlyMap<string, ReviewDecision>): string | null {
  const first = firstName(decision.person.name);
  if (decision.expired) return copy.noLongerCounts(first);
  if (decision.replacedByDecisionId !== undefined) {
    const next = byId.get(decision.replacedByDecisionId);
    if (next !== undefined) return copy.replacedBy(first, next.result, reviewTime(next.createdAt));
  }
  if (decision.replacesDecisionId !== undefined) {
    const prev = byId.get(decision.replacesDecisionId);
    if (prev !== undefined) return copy.replaces(first, prev.result, reviewTime(prev.createdAt));
  }
  return null;
}

/**
 * When the decision stops counting. Validity is per requirement (S3): one
 * Approval can count for a requirement with a long MaxAge after it is too old
 * for another. A revocation names who revoked it, which can be a manager of
 * the Space rather than the attester (S2).
 */
function whenLine(decision: ReviewDecision, requirements: string[]): string {
  if (decision.revokedAt !== undefined) {
    const by = decision.revokedBy;
    if (by !== undefined && by.userId !== decision.person.userId) return copy.revokedAtBy(reviewTime(decision.revokedAt), by.name);
    return copy.revokedAt(reviewTime(decision.revokedAt));
  }
  // The server's ValidUntil per requirement (#5788): each requirement's own MaxAge.
  const untils = requirements
    .map((name) => [name, decision.byRequirement[name]?.validUntil] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== undefined);
  if (decision.expired) {
    const last = Object.values(decision.byRequirement)
      .map((entry) => entry.validUntil)
      .filter((v): v is string => v !== undefined)
      .sort()
      .pop();
    return copy.expiredAt(reviewTime(decision.createdAt), reviewTime(last));
  }
  if (untils.length === 0) return '';
  if (new Set(untils.map(([, until]) => until)).size === 1) return copy.validUntil(reviewTime(untils[0][1]));
  return untils.map(([name, until]) => copy.validUntilFor(name, reviewTime(until))).join(', ');
}

/**
 * What the server said about this decision for one requirement: where it
 * counts, or why it does not (`AttestationGateEntry.Reason`, #5788).
 */
function EntryChip({
  name,
  decision,
  rules,
  showName,
}: {
  name: string;
  decision: ReviewDecision;
  rules: RequirementRules | undefined;
  showName: boolean;
}) {
  const entry = decision.byRequirement[name];
  if (entry === undefined) return null;
  const { tone, text } = entryText(entry, decision, rules);
  return (
    <Box component="span" data-testid="review-decision-entry" data-requirement={name} data-reason={entry.reason ?? (entry.countedOn > 0 ? 'Counted' : '')}>
      <ReviewTag tone={tone}>{showName ? `${name}: ${text}` : text}</ReviewTag>
    </Box>
  );
}

function DecisionRow({
  decision,
  byId,
  now,
  showType,
  rulesByName,
}: {
  decision: ReviewDecision;
  byId: ReadonlyMap<string, ReviewDecision>;
  now: number;
  showType: boolean;
  rulesByName: ReadonlyMap<string, RequirementRules>;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const voided = !decision.live;
  // The requirements the server reported this decision for (#5788 entries), in workflow order.
  const requirements = Object.keys(decision.byRequirement);
  let tone: 'ok' | 'bad' | 'idle' = decision.result === 'Pass' ? 'ok' : 'bad';
  if (voided) tone = 'idle';
  const when = whenLine(decision, requirements);
  const link = linkLine(decision, byId);
  return (
    <Box
      component="li"
      id={`review-decision-${decision.id}`}
      data-testid="review-decision"
      data-decision-live={decision.live ? 'true' : 'false'}
      sx={{
        display: 'grid',
        gridTemplateColumns: '28px minmax(0,1fr)',
        gap: '10px',
        padding: '10px 0',
        borderTop: `1px solid ${changeOrderBorder.default}`,
        '&:first-of-type': { borderTop: 0, paddingTop: '2px' },
      }}
    >
      <Monogram initials={decision.person.initials} tone={tone} size={28} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
          <Box
            component="span"
            sx={{ fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.semibold, color: voided ? changeOrderInk.subtle : changeOrderInk.default }}
          >
            {decision.person.name}
            {decision.person.isYou ? copy.you : ''}
          </Box>
          <DecisionChip decision={decision} />
          <Box component="span" sx={{ marginLeft: 'auto', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, fontFamily: changeOrderFontMono }}>
            {agoText(decision.createdAt, now)}
          </Box>
        </Box>
        {decision.note !== '' ? (
          <Box
            component="q"
            sx={{
              display: 'block',
              marginTop: '4px',
              fontSize: changeOrderType.size.body,
              lineHeight: 1.5,
              color: voided ? changeOrderInk.subtle : changeOrderInk.muted,
              textDecoration: voided ? 'line-through' : 'none',
              textDecorationColor: changeOrderBorder.strong,
              overflowWrap: 'anywhere',
              quotes: '"\\201C" "\\201D"',
            }}
          >
            {decision.note}
          </Box>
        ) : null}
        <Box
          sx={{
            marginTop: '4px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2px 10px',
            fontSize: changeOrderType.size.small,
            color: changeOrderInk.subtle,
          }}
        >
          {showType ? (
            <Box component="span" data-decision-type={decision.type} sx={{ color: changeOrderInk.muted, fontWeight: changeOrderType.weight.semibold }}>
              {copy.typeLabel(decision.type)}
            </Box>
          ) : null}
          {requirements.length > 0 ? (
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
              {requirements.join(', ')}
            </Box>
          ) : null}
          {when !== '' ? <span>{when}</span> : null}
          <Box
            component="button"
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            sx={{ ...reviewLinkButtonSx, fontSize: changeOrderType.size.small }}
          >
            {copy.revisions(decision.spaceSlugs.length)}
          </Box>
        </Box>
        {requirements.length > 0 ? (
          <Box sx={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {requirements.map((name) => (
              <EntryChip key={name} name={name} decision={decision} rules={rulesByName.get(name)} showName={requirements.length > 1} />
            ))}
          </Box>
        ) : null}
        <Box
          id={listId}
          hidden={!open}
          sx={{
            marginTop: '5px',
            display: open ? 'flex' : 'none',
            flexDirection: 'column',
            gap: '2px',
            fontFamily: changeOrderFontMono,
            fontSize: changeOrderType.size.small,
            color: changeOrderInk.muted,
          }}
        >
          {decision.spaceSlugs.map((slug) => (
            <span key={slug}>{slug}</span>
          ))}
        </Box>
        {link !== null ? (
          <Box
            sx={{
              marginTop: '6px',
              padding: '6px 9px',
              borderLeft: `2px solid ${changeOrderBorder.strong}`,
              fontSize: changeOrderType.size.small,
              color: changeOrderInk.muted,
              background: changeOrderSurface.sunk,
              borderRadius: `0 ${changeOrderShape.radius.sm}px ${changeOrderShape.radius.sm}px 0`,
            }}
          >
            {link}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * Newest first, but a decision that replaced another is followed at once by
 * the one it replaced, so "Replaces" and "Replaced by" read next to each
 * other. Chains keep the newest-first order between them, by their newest
 * decision.
 */
function chainOrder(decisions: ReviewDecision[], byId: ReadonlyMap<string, ReviewDecision>): ReviewDecision[] {
  const placed = new Set<string>();
  const out: ReviewDecision[] = [];
  for (const decision of decisions) {
    if (placed.has(decision.id)) continue;
    let head = decision;
    const seen = new Set<string>([head.id]);
    for (let next = byId.get(head.replacedByDecisionId ?? ''); next !== undefined && !seen.has(next.id); next = byId.get(head.replacedByDecisionId ?? '')) {
      seen.add(next.id);
      head = next;
    }
    for (let at: ReviewDecision | undefined = head; at !== undefined && !placed.has(at.id); at = byId.get(at.replacesDecisionId ?? '')) {
      placed.add(at.id);
      out.push(at);
    }
  }
  return out;
}

export function ReviewDecisionList({
  decisions,
  requirements = [],
  now,
}: {
  decisions: ReviewDecision[];
  /** The gate's requirements, for the rules behind a discard reason (MaxAge, who may approve). */
  requirements?: RequirementProgress[];
  now: number;
}) {
  if (decisions.length === 0) {
    return (
      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle, padding: '2px 0' }}>{copy.none}</Box>
    );
  }
  const byId = new Map(decisions.map((d) => [d.id, d]));
  // Name each decision's Attestation Type only when more than one Type is in play (S1).
  const showType = new Set(decisions.map((d) => d.type)).size > 1;
  const rulesByName = new Map(requirements.map((r) => [r.name, r.rules]));
  return (
    <Box component="ul" sx={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {chainOrder(decisions, byId).map((decision) => (
        <DecisionRow key={decision.id} decision={decision} byId={byId} now={now} showType={showType} rulesByName={rulesByName} />
      ))}
    </Box>
  );
}
