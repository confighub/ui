// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Progress on each review requirement of the stage: the count, the pips, and
 * the rules that decide who counts.
 *
 * When the UI count and the server's promote dry run do not agree, the
 * server's verdict is shown with its own message. The UI cannot see every
 * Attestation the server counts (confighubai/confighub#5737).
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BlockIcon from '@mui/icons-material/Block';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import { changeOrderFontMono, changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { fromText, fromTitle, gateThing, reviewCopy } from './reviewCopy';
import { Pips, ReviewTag } from './reviewParts';
import type { RequirementProgress } from './changeOrderReviewTypes';

const copy = reviewCopy.requirements;

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: '4px', '& svg': { fontSize: 11 } }}>
      {icon}
      <span>{children}</span>
    </Box>
  );
}

function RequirementRow({ req, showGate }: { req: RequirementProgress; showGate: boolean }) {
  const { rules } = req;
  // No server rows for the viewer: no count, no pips, one line saying why (#5788).
  const evaluated = req.evaluated;
  let tag: ReactNode = <ReviewTag tone="warn">{req.need === 0 ? copy.held : copy.needed(req.need)}</ReviewTag>;
  if (!evaluated) tag = <ReviewTag tone="idle">{reviewCopy.notEvaluatedShort[req.notEvaluated ?? 'error'] ?? reviewCopy.notEvaluated.short}</ReviewTag>;
  else if (req.rejected) tag = <ReviewTag tone="bad">{copy.rejected}</ReviewTag>;
  else if (req.satisfied) tag = <ReviewTag tone="ok">{copy.satisfied}</ReviewTag>;
  return (
    <Box data-testid={`review-requirement-${req.name}`} data-gate-kind={req.gate.kind} data-evaluated={evaluated ? 'true' : 'false'} title={req.description}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Box component="code" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.strong }}>
          {req.name}
        </Box>
        {tag}
        {evaluated ? (
          <Box component="span" sx={{ marginLeft: 'auto', fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, fontWeight: changeOrderType.weight.bold }}>
            {req.passes}
            <Box component="span" sx={{ color: changeOrderInk.subtle, fontWeight: changeOrderType.weight.medium }}>
              {' '}/ {req.required}
            </Box>
          </Box>
        ) : null}
      </Box>
      {showGate ? (
        <Box data-testid="review-requirement-gate" sx={{ marginTop: '2px', fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
          {copy.forGate(gateThing(req.gate))}
        </Box>
      ) : null}
      {evaluated ? (
        <Box sx={{ marginTop: '6px' }}>
          <Pips passes={Math.min(req.passes, req.required)} required={req.required} rejected={req.rejected} />
        </Box>
      ) : (
        <Box data-testid={`review-requirement-not-evaluated-${req.name}`} sx={{ marginTop: '4px', fontSize: changeOrderType.size.small, color: changeOrderInk.muted, lineHeight: 1.45 }}>
          {reviewCopy.notEvaluated[req.notEvaluated ?? 'error']}
        </Box>
      )}
      <Box
        component="ul"
        sx={{
          margin: '6px 0 0',
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          fontSize: changeOrderType.size.small,
          color: changeOrderInk.subtle,
        }}
      >
        <Rule icon={<PersonOutlineOutlinedIcon />}>
          {copy.from}{' '}
          <Box component="span" title={fromTitle(rules)} sx={{ color: changeOrderInk.muted }}>
            {fromText(rules)}
          </Box>
        </Rule>
        <Rule icon={<BlockIcon />}>{rules.allowAuthors ? copy.authorsAllowed : copy.notAuthor}</Rule>
        {rules.maxAge !== undefined ? <Rule icon={<AccessTimeIcon />}>{copy.valid(rules.maxAge)}</Rule> : null}
        <Rule icon={<WarningAmberOutlinedIcon />}>{rules.ignoreFail ? copy.rejectionsIgnored : copy.oneRejectionBlocks}</Rule>
        {rules.distinctGroups ? <Rule icon={<GroupsOutlinedIcon />}>{copy.oneFromEachGroup}</Rule> : null}
      </Box>
    </Box>
  );
}

/** Blocking first: a rejected requirement, then those still needing approvals, then the satisfied. */
function blockingFirst(requirements: RequirementProgress[]): RequirementProgress[] {
  const rank = (r: RequirementProgress) => {
    if (!r.evaluated) return 3;
    if (r.rejected) return 0;
    return r.satisfied ? 2 : 1;
  };
  return [...requirements].sort((a, b) => rank(a) - rank(b));
}

/** `showGate`: the requirements hold more than one gate, so each says which. */
export function ReviewRequirementList({ requirements, showGate = false }: { requirements: RequirementProgress[]; showGate?: boolean }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {blockingFirst(requirements).map((req) => (
        <RequirementRow key={req.gate.key + req.name} req={req} showGate={showGate} />
      ))}
    </Box>
  );
}
