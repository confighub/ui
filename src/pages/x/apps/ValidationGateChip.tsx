// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Link as RouterLink } from 'react-router-dom';

import { validationFindings } from '@/pages/unit-detail/components/action-side-bar/validationFindings';
import { unitOverviewHref } from '@/pages/unit-detail/unitDetailHrefs';
import type { ValidationResult } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

import { componentTheme } from './componentTheme';

/** The gate the resolve queue sets on a Unit until its validating Triggers have run. */
const AWAITING_TRIGGERS_GATE = 'awaiting/triggers';

/** How many findings a gate lists in the hover before saying how many more there are. */
const FINDING_LIMIT = 3;

/** One line per finding of a gate: where it is and what is wrong with it. */
const gateFindingLines = (results: ValidationResult[] | undefined): string[] => {
  const findings = validationFindings(results);
  const lines = [
    ...findings.fields.map((finding) => {
      const where = [finding.resourceType, finding.resourceName, finding.path].filter(Boolean).join(' ');
      const what = finding.messages.join('; ');
      return [where, what].filter(Boolean).join(': ') || 'Did not pass';
    }),
    ...findings.unit.map((finding) => finding.messages.join('; ') || `${finding.functionName ?? 'The function'} did not pass`),
  ];
  if (lines.length <= FINDING_LIMIT) return lines;
  return [...lines.slice(0, FINDING_LIMIT), `and ${lines.length - FINDING_LIMIT} more`];
};

const GateDetails = ({
  heading,
  gates,
  results,
}: {
  heading: string;
  gates: string[];
  results?: { [gate: string]: ValidationResult[] };
}) => (
  <Box sx={{ fontSize: 11.5, lineHeight: 1.4, maxWidth: 420 }}>
    <Box sx={{ fontWeight: 700, mb: 0.5 }}>{heading}</Box>
    {gates.map((gate) => {
      const lines = gate === AWAITING_TRIGGERS_GATE
        ? ['Waiting for the validating Triggers to run']
        : gateFindingLines(results?.[gate]);
      return (
        <Box key={gate} sx={{ mt: 0.5 }}>
          <Box sx={{ fontFamily: componentTheme.fontMono, fontWeight: 600, wordBreak: 'break-all' }}>{gate}</Box>
          <Box component='ul' sx={{ m: 0, pl: 2 }}>
            {lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </Box>
        </Box>
      );
    })}
    <Box sx={{ mt: 0.75, opacity: 0.8 }}>Click for the full results on the Unit&apos;s Overview</Box>
  </Box>
);

/**
 * A unit's validation errors ("Gated") or warnings ("Warnings") as a chip. Hovering lists what
 * each gate found; clicking opens the unit's Overview, on the gate's card when there is one.
 */
export const ValidationGateChip = ({
  kind,
  gates,
  results,
  spaceId,
  unitId,
}: {
  kind: 'errors' | 'warnings';
  gates: string[];
  results?: { [gate: string]: ValidationResult[] };
  spaceId: string;
  unitId: string;
}) => {
  const isWarning = kind === 'warnings';
  const awaiting = gates.includes(AWAITING_TRIGGERS_GATE);
  const label = isWarning ? 'Warnings' : 'Gated';
  return (
    <Tooltip
      placement='left'
      arrow
      title={
        <GateDetails
          heading={isWarning ? 'Validation warnings (block no Release)' : 'Validation errors (block Releases)'}
          gates={gates}
          results={results}
        />
      }
    >
      <Chip
        component={RouterLink}
        to={unitOverviewHref(spaceId, unitId, gates.length === 1 ? gates[0] : '')}
        clickable
        // The row toggles the unit open; the chip goes to the unit.
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-testid={isWarning ? 'component-unit-warnings-chip' : 'component-unit-gated-chip'}
        size='small'
        label={
          awaiting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {label}
              <CircularProgress size={10} sx={{ color: 'inherit' }} />
            </Box>
          ) : (
            label
          )
        }
        sx={{
          // The look of the pane's other badges (GateBadge), which a styled Chip cannot link.
          height: 20,
          fontSize: 11,
          fontWeight: 500,
          fontFamily: componentTheme.fontSans,
          borderRadius: componentTheme.radiusMd,
          '& .MuiChip-label': { padding: '0 8px' },
          // The tones of the cards' Gated and Warnings chips: errors in danger, warnings in attention.
          color: isWarning ? componentTheme.attention : componentTheme.danger,
          background: isWarning ? componentTheme.attentionMuted : componentTheme.dangerMuted,
          cursor: 'pointer',
        }}
      />
    </Tooltip>
  );
};
