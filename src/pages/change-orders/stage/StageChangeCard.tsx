// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the promotion writes: the title, where the change was made and how many
 * Spaces it reaches, then the outcome boxes (`StageOutcomeBoxes`), one per way
 * the change comes out across the stage's Spaces.
 *
 * In place of the boxes the card says why there is nothing to show yet: the
 * change is still being read, could not be read, writes nothing here, or the
 * stage before has not taken it. The notes that qualify every count (a floor,
 * omitted and undecided resources) are said above the boxes, open or closed.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import { stageCardCopy } from './stageCardCopy';
import { CopyText, type StageLinks } from './StageBoxParts';
import type { ChangeCardNotice } from './stageChangeLines';
import type { CopySegment } from './stageTypes';

const copy = stageCardCopy.change;

export interface StageChangeCardProps {
  /** After the change is written the title says so: "What the change wrote". */
  written: boolean;
  /** The scope after the title, as phrases joined by " · ": "Made in [Dev]", "Same in all 3 Spaces". */
  scope: readonly CopySegment[][];
  links: StageLinks;
  /** Said in place of the boxes (`changeCardNotice`). Never "writes no field" while that is not known. */
  notice?: ChangeCardNotice;
  /** What qualifies every count on the card: a floor, omitted and undecided resources (`quietNotes`). */
  notes?: readonly string[];
  /** The outcome groups do not account for every Space: a defect, said in red. */
  shortfall?: string;
  /** The outcome boxes, shown when there is no notice. */
  children?: ReactNode;
}

export function StageChangeCard({ written, scope, links, notice, notes = [], shortfall, children }: StageChangeCardProps) {
  const quiet = notice === undefined || notice === null;
  return (
    <Paper elevation={2} data-testid="stage-change-card" sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', p: '12px 16px', borderBottom: '1px solid var(--bd0)' }}>
        <Typography variant="h4" component="h3" sx={{ color: 'text.primary' }}>
          {written ? copy.titleAfter : copy.titleBefore}
        </Typography>
        <Typography component="span" variant="body2" data-testid="stage-change-scope" sx={{ color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>
          {scope.map((phrase, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : null}
              <CopyText parts={phrase} links={links} />
            </span>
          ))}
        </Typography>
      </Box>
      {notes.length > 0 || shortfall !== undefined ? (
        <Box data-testid="stage-change-notes" sx={{ p: '10px 16px 0', display: 'grid', gap: '2px' }}>
          {notes.map((note) => (
            <Typography key={note} component="p" variant="body2" sx={{ fontSize: '11.5px', color: 'text.secondary' }}>
              {note}
            </Typography>
          ))}
          {shortfall !== undefined ? (
            <Typography component="p" variant="body2" data-testid="stage-change-shortfall" sx={{ fontSize: '11.5px', color: 'error.main' }}>
              {shortfall}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      {quiet ? (
        children
      ) : (
        <Typography
          component="p"
          variant="body2"
          data-testid="stage-change-notice"
          data-notice={notice.kind}
          sx={{ p: '10px 16px 12px', color: 'text.secondary' }}
        >
          {notice.kind === 'notReached' ? <CopyText parts={notice.parts} links={links} /> : notice.text}
        </Typography>
      )}
    </Paper>
  );
}
