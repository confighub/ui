// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import type { PanelLinks } from '../links';
import { TONE_MARK, type Tone } from '../tones';
import type { PanelLine, Verdict } from '../verdict';
import { newTab } from './new-tab';
import { tint, toneColor } from './colors';
import { Dot } from './parts';
import type { PanelActions } from './types';

/** The verdict: one line in its status colour, the revisions, and a sentence that says why. */
export function VerdictBox({ verdict }: { verdict: Verdict }) {
  const { head, released, targeted } = verdict.revs;
  return (
    <Box
      data-testid='vx-unit-verdict'
      data-tone={verdict.tone}
      sx={{
        border: 1,
        borderRadius: 'var(--r-md)',
        px: 1.5,
        py: 1.25,
        borderColor: (t) => tint(t, verdict.tone, 'border'),
        bgcolor: (t) => tint(t, verdict.tone, 'bg'),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Dot tone={verdict.tone} />
        <Typography component='p' data-testid='vx-unit-headline' sx={{ fontSize: 13.5, fontWeight: 600, m: 0, minWidth: 0 }}>
          {verdict.headline}
        </Typography>
        <Typography
          component='span'
          sx={{ ml: 'auto', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {released > 0 ? `released ${released} · head ${head}` : targeted ? `never released · head ${head}` : `head ${head}`}
        </Typography>
      </Box>
      {verdict.detail && (
        <Typography component='p' sx={{ m: 0, mt: 0.5, ml: '15px', fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
          {verdict.detail}
        </Typography>
      )}
    </Box>
  );
}

const FIX_SX = { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } as const;

/** The colour of a gate check's result: a gate that still fails keeps the gated colour; a check that could not run is red. */
const CHECK_COLOR: Record<NonNullable<PanelLine['check']>['state'], string> = {
  running: 'text.secondary',
  passed: 'success.dark',
  failed: 'warning.dark',
  error: 'error.main',
};

/** How a gate checked again from the panel went, under its line; read out when it changes. */
function CheckResult({ check }: { check: NonNullable<PanelLine['check']> }) {
  return (
    <Box
      component='span'
      role='status'
      data-testid='vx-unit-gate-check'
      data-check={check.state}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: '3px', fontSize: 12, fontWeight: 500, color: CHECK_COLOR[check.state] }}
    >
      {check.state === 'running' && <CircularProgress size={10} thickness={5} sx={{ color: 'text.disabled' }} aria-hidden />}
      {check.text}
    </Box>
  );
}

interface LineListProps {
  lines: readonly PanelLine[];
  actions: PanelActions;
  links: PanelLinks;
  /** The line the verdict is about, which takes the verdict's border so the two read as one. */
  lead?: { key: string; tone: Tone };
  testId: string;
}

/** The causes, then the facts, each a line with its mark, its detail, and the fix that is available. */
export function LineList({ lines, actions, links, lead, testId }: LineListProps) {
  if (!lines.length) return null;
  return (
    <Box component='ul' data-testid={testId} sx={{ listStyle: 'none', m: 0, mt: 1.25, p: 0, display: 'grid', gap: 0.75 }}>
      {lines.map((line) => {
        const fix = line.fix && actions[line.fix.action] ? line.fix : undefined;
        return (
          <Box
            component='li'
            key={line.key}
            data-kind={line.kind}
            sx={{
              display: 'grid',
              gridTemplateColumns: '16px minmax(0, 1fr) auto',
              gap: 1,
              alignItems: 'baseline',
              px: 1.25,
              py: '7px',
              borderRadius: 'var(--r-sm)',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: (t) => (lead?.key === line.key ? tint(t, lead.tone, 'border') : t.palette.grey[200]),
            }}
          >
            <Box component='span' aria-hidden sx={{ fontWeight: 700, fontSize: 12, textAlign: 'center', color: (t) => toneColor(t, line.tone) }}>
              {TONE_MARK[line.tone]}
            </Box>
            <Box component='span' sx={{ minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
              {line.title}
              {line.subject && (
                <>
                  {' '}
                  <Box component='b' title={line.subjectTitle} sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, overflowWrap: 'normal', wordBreak: 'keep-all' }}>
                    {line.subject}
                  </Box>
                </>
              )}
              {line.subjectContext && (
                <Box
                  component='small'
                  data-testid='vx-unit-subject-context'
                  title={line.subjectTitle}
                  sx={{ display: 'block', color: 'text.disabled', fontFamily: 'var(--font-mono)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {line.subjectContext}
                </Box>
              )}
              {line.detail && (
                <Box component='small' sx={{ display: 'block', color: line.detailMuted ? 'text.disabled' : 'text.secondary', fontSize: 12, mt: '1px' }}>
                  {line.detail}
                </Box>
              )}
              {line.check && <CheckResult check={line.check} />}
            </Box>
            {fix ? (
              links[fix.action] ? (
                <Link underline='hover' aria-label={fix.name} {...newTab(links[fix.action])} sx={FIX_SX}>
                  {fix.label}
                </Link>
              ) : (
                <Link component='button' type='button' underline='hover' aria-label={fix.name} onClick={() => actions[fix.action]?.(fix.arg)} sx={FIX_SX}>
                  {fix.label}
                </Link>
              )
            ) : line.meta ? (
              <Box component='span' sx={{ fontSize: 11.5, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                {line.meta}
              </Box>
            ) : (
              <span />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
