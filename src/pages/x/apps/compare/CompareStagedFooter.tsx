// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What is staged, where it would land, and the one control that lands it.
 *
 * THE FOOTER NAMES ITS SET. With one deployment "3 staged" is unambiguous; with
 * five it is the most important thing on screen left unsaid. So the count is
 * broken down per deployment, each carrying the same letter badge its column and
 * its graph node wear, and the button says how many Spaces it is about to write
 * to rather than just "Apply".
 *
 * EACH DEPLOYMENT CAN BE UNCHECKED BEFORE APPLYING. The user may want the change
 * in staging and not yet in production, and the alternative — discard, re-stage,
 * apply again — invites them to get it wrong in the other direction.
 *
 * PARTIAL OUTCOMES ARE THE NORMAL CASE HERE, not an error path. One apply across
 * five Spaces can be accepted by three and refused by two, and a bar that said
 * "apply failed" after writing to three of them would be describing something
 * that did not happen. Refusals are named, and their edits STAY STAGED so the
 * work is not lost and the user can see exactly what did not land.
 */

import { type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';
import { LETTER_SX } from './slotLetter';
import type { DeploymentApplyOutcome, DeploymentEditSummary } from './compareEditing';
import { describeApply } from './compareEditing';

export interface CompareStagedFooterProps {
  summaries: readonly DeploymentEditSummary[];
  /** Deployments the user has left ticked. Only these are written. */
  selected: ReadonlySet<string>;
  onToggle: (deploymentId: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  applying: boolean;
  /** The result of the last apply, per deployment. Cleared when staging changes. */
  outcomes: readonly DeploymentApplyOutcome[];
}

const BAR_SX = {
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '8px 11px',
  borderTop: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgSubtle,
} as const;

const ROW_SX = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } as const;

const CHIP_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '2px 7px 2px 4px',
  borderRadius: `${componentTheme.radiusSm}px`,
  border: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  '&[aria-pressed="false"]': { opacity: 0.5 },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '1px' },
} as const;

const APPLY_SX = {
  marginLeft: 'auto',
  border: 0,
  borderRadius: `${componentTheme.radiusSm}px`,
  background: componentTheme.accent,
  color: componentTheme.fgOnEmphasis,
  font: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  padding: '5px 12px',
  cursor: 'pointer',
  '&:hover': { background: componentTheme.accentEmphasis },
  '&[disabled]': { opacity: 0.45, cursor: 'default' },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '2px' },
} as const;

const DISCARD_SX = {
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: `${componentTheme.radiusSm}px`,
  background: componentTheme.bgDefault,
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: componentTheme.fgMuted,
  padding: '4px 10px',
  cursor: 'pointer',
  '&:hover': { borderColor: componentTheme.borderEdge, color: componentTheme.fgDefault },
  '&[disabled]': { opacity: 0.45, cursor: 'default' },
} as const;

export function CompareStagedFooter({
  summaries,
  selected,
  onToggle,
  onApply,
  onDiscard,
  applying,
  outcomes,
}: CompareStagedFooterProps): ReactElement | null {
  if (summaries.length === 0 && outcomes.length === 0) return null;

  const chosen = summaries.filter((summary) => selected.has(summary.deploymentId));
  const staged = chosen.reduce((sum, summary) => sum + summary.count, 0);
  const { applied, refused, partial } = describeApply(outcomes);

  return (
    <Box sx={BAR_SX} data-testid="compare-staged-footer">
      {summaries.length > 0 ? (
        <Box sx={ROW_SX}>
          <Box component="span" sx={{ fontSize: 11.5, fontWeight: 700, color: componentTheme.fgDefault }}>
            {staged} staged
          </Box>
          {summaries.map((summary) => {
            const on = selected.has(summary.deploymentId);
            return (
              <Box
                key={summary.deploymentId}
                component="button"
                type="button"
                data-testid={`compare-staged-chip-${summary.label}`}
                aria-pressed={on}
                title={
                  (on
                    ? `${summary.label} will be written to. Click to leave it out of this apply.`
                    : `${summary.label} is left out of this apply. Its changes stay staged.`) +
                  (summary.displayName ? ` Space: ${summary.displayName}.` : '')
                }
                onClick={() => onToggle(summary.deploymentId)}
                sx={CHIP_SX}
              >
                <Box
                  component="span"
                  sx={{
                    ...LETTER_SX,
                    background: summary.letter === 'A' ? componentTheme.accent : componentTheme.fgDefault,
                  }}
                >
                  {summary.letter}
                </Box>
                {summary.label}
                <Box component="span" sx={{ fontFamily: componentTheme.fontMono, fontSize: 10 }}>
                  {summary.count}
                </Box>
              </Box>
            );
          })}

          <Box
            component="button"
            type="button"
            data-testid="compare-discard"
            disabled={applying}
            onClick={onDiscard}
            sx={DISCARD_SX}
          >
            Discard
          </Box>
          <Box
            component="button"
            type="button"
            data-testid="compare-apply"
            disabled={applying || chosen.length === 0}
            onClick={onApply}
            sx={APPLY_SX}
          >
            {applying
              ? 'Applying…'
              : `Apply to ${chosen.length} ${chosen.length === 1 ? 'deployment' : 'deployments'}`}
          </Box>
        </Box>
      ) : null}

      {outcomes.length > 0 ? (
        <Box
          data-testid="compare-apply-outcome"
          role="status"
          sx={{ fontSize: 11.5, color: componentTheme.fgMuted, lineHeight: 1.5 }}
        >
          {applied.length > 0 ? (
            <Box component="span" sx={{ color: componentTheme.successEmphasis, fontWeight: 600 }}>
              {`Applied to ${applied.map((outcome) => outcome.label).join(', ')}. `}
            </Box>
          ) : null}
          {refused.length > 0 ? (
            <Box component="span" sx={{ color: componentTheme.danger, fontWeight: 600 }}>
              {refused
                .map((outcome) => `${outcome.label} was refused — ${outcome.reason ?? 'the server did not accept it'}`)
                .join('. ')}
              {'. '}
            </Box>
          ) : null}
          {refused.length > 0 ? (
            // Said plainly, because the reassuring half is the part a user in
            // this situation most needs and least expects.
            <Box component="span">
              {partial
                ? 'The rest is still staged, so nothing was lost — you can retry or discard it.'
                : 'Your changes are still staged.'}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
