// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

import { Kbd } from '../../lenses/parts';
import type { StatusKind } from '../../model/types';
import { GROUP, STATUS_COUNT_LABEL } from '../copy';
import { type GroupSummary, STATUS_COUNT_ORDER } from '../group-context';
import type { PanelLinks } from '../links';
import { STATUS_TONE } from '../tones';
import type { NextProblem, PrimaryAction } from '../verdict';
import { Dot, Section } from './parts';
import { PrimaryRow } from './PrimaryRow';
import type { PanelActions } from './types';

interface Props {
  group: GroupSummary;
  /** The table's status of the open Unit, which its count names. */
  status: StatusKind;
  needsAttention: boolean;
  nextProblem: NextProblem | null;
  onGoTo: (id: string) => void;
  /** The panel's primary action, when it is to go to the next problem: drawn here, in place of the plain line. */
  primary: PrimaryAction | null;
  actions: PanelActions;
  links: PanelLinks;
}

/** The counts of the open Unit's group, as the table's status colours, and the way to the next Unit that needs attention. */
export function GroupContextSection({ group, status, needsAttention: selfNeeds, nextProblem, onGoTo, primary, actions, links }: Props) {
  const ranked = primary?.id === 'next-problem' && !!actions['next-problem'];
  return (
    <Section
      title={group.label}
      meta={selfNeeds ? GROUP.units(group.total) : GROUP.needing(group.needing, group.total)}
      ranked={ranked}
      testId='vx-unit-group'
    >
      <Box component='ul' data-testid='vx-unit-counts' sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', color: 'text.secondary' }}>
        {STATUS_COUNT_ORDER.filter((s) => group.counts[s].count > 0).map((s) => (
          <Box component='li' key={s} data-status={s} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 500, fontSize: 13 }}>
            <Dot tone={STATUS_TONE[s]} />
            <Box component='b' sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
              {group.counts[s].count}
            </Box>
            {` ${STATUS_COUNT_LABEL[s]}${s === status ? ` ${GROUP.self}` : ''}`}
            {group.counts[s].gated > 0 && (
              <Box component='span' sx={{ color: 'text.disabled' }}>
                {` ${GROUP.gated(group.counts[s].gated)}`}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      {ranked && primary ? (
        <PrimaryRow primary={primary} actions={actions} links={links} />
      ) : (
        <Box data-testid='vx-unit-next' sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontSize: 13 }}>
          {nextProblem ? (
            <>
              <Box component='span' sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {GROUP.next}{' '}
                <Link
                  component='button'
                  type='button'
                  underline='hover'
                  onClick={() => onGoTo(nextProblem.id)}
                  aria-keyshortcuts='Shift+J'
                  sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, verticalAlign: 'baseline' }}
                >
                  {nextProblem.slug}
                </Link>
                {nextProblem.groupLabel && ` ${GROUP.nextIn(nextProblem.groupLabel)}`}
              </Box>
              <Kbd aria-hidden sx={{ ml: 'auto' }}>
                ⇧J
              </Kbd>
            </>
          ) : (
            <span>{selfNeeds ? GROUP.noneElse : GROUP.none}</span>
          )}
        </Box>
      )}
    </Section>
  );
}
