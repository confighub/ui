// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The compact stage strip: one segment per stage, plus `N of M done`.
 *
 * VARIABLE LENGTH, DELIBERATELY. The reference design draws exactly four
 * segments (`base / dev / staging / prod`) on every row. Stages are free-form
 * Space labels with no backend existence, and each rollout's sequence is built
 * from its own in-scope Spaces, so the count genuinely varies. Segments
 * therefore flex to the sequence. Against the design's own sample data this
 * renders identically.
 *
 * The source segment is drawn but never counted: the change starts there, so
 * counting it would report every rollout one stage further along than it is.
 *
 * Each segment carries a `title` naming its stage and state, because colour
 * alone is not an accessible way to say which stage is which.
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

import type { ConsoleStage, SegmentTone } from './rolloutsConsoleModel';
import { stageDisplayName } from './rolloutCopy';
import { rolloutsConsoleCopy } from './rolloutsConsoleCopy';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
`;

/**
 * Semantic only — never decorative. Seven distinct treatments, not seven colours
 * on the same flat shape: `degraded` and `blocked` both read as "trouble" to
 * someone who cannot see colour, so each gets its own outline/fill pairing.
 */
const SEGMENT_SX: Record<SegmentTone, SxProps<Theme>> = {
  done: { bgcolor: 'success.main' },
  ready: {
    bgcolor: 'info.light',
    boxShadow: (theme: Theme) => `inset 0 0 0 1.5px ${theme.palette.info.main}`,
  },
  // Striped, not flat, so the state survives even with the pulse switched off
  // under prefers-reduced-motion — colour and animation both, not just one.
  progressing: {
    backgroundImage: (theme: Theme) =>
      `repeating-linear-gradient(115deg, ${theme.palette.warning.light} 0 4px, ${theme.palette.warning.main} 4px 8px)`,
    boxShadow: (theme: Theme) => `inset 0 0 0 1.5px ${theme.palette.warning.main}`,
    animation: `${pulse} 1.6s ease-in-out infinite`,
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  },
  degraded: { bgcolor: 'error.main' },
  // Hollow where `done` is solid, so the difference survives without colour:
  // the change landed here and nothing checked whether it is healthy.
  unverified: {
    bgcolor: 'transparent',
    boxShadow: (theme: Theme) => `inset 0 0 0 1.5px ${theme.palette.success.main}`,
  },
  blocked: {
    bgcolor: 'warning.light',
    boxShadow: (theme: Theme) => `inset 0 0 0 1.5px ${theme.palette.warning.main}`,
  },
  gated: {
    bgcolor: 'grey.200',
    boxShadow: (theme: Theme) => `inset 0 0 0 1px ${theme.palette.grey[300]}`,
  },
  // A drained `done`: solid, because the change did land here, and grey,
  // because it is not there any more. Solid separates it from `gated`, which is
  // the pale outlined segment of a stage the change has never reached.
  restored: { bgcolor: 'grey.500' },
};

export function RolloutStageStrip({
  stages,
  stagesDone,
  stagesTotal,
  nextStageId,
  progressUnavailable,
  tones = SEGMENT_SX,
  showCaption = true,
  /**
   * The component pane's "you are here" caret (design brief §3): a second
   * row, same flex sizing as the segments above it so the two align with no
   * arithmetic, one empty cell per stage and a triangle in the viewer's.
   * `null`/omitted draws nothing — the console never has a single viewer to
   * mark.
   */
  viewerStageIndex = null,
  segmentMaxWidth,
}: {
  stages: ConsoleStage[];
  stagesDone: number;
  stagesTotal: number;
  nextStageId: string | null;
  progressUnavailable: boolean;
  /** Re-skin without re-implementing (design brief §3) — defaults to the console's own MUI-palette tones. */
  tones?: Record<SegmentTone, SxProps<Theme>>;
  /** Suppress the `N of M done · next: X` line — the component pane says the same thing as a viewer sentence instead. */
  showCaption?: boolean;
  viewerStageIndex?: number | null;
  /**
   * Upper bound per segment, in px. Omitted = today's fill-the-row behaviour,
   * which the console needs (a wide table cell, same width regardless of
   * stage count). `flex: 1` already shrinks segments when space is tight;
   * this only removes the excess GROWTH, so nothing that fit before can
   * overflow because of it.
   *
   * Read by BOTH the segment row and the caret row below — never given as
   * two separate literals. A cap on the segments alone with the caret still
   * filling the row would drift the caret off its own stage, and only at
   * widths where the cap actually bites: invisible in a narrow test, wrong
   * at a wider one in front of a user.
   */
  segmentMaxWidth?: number;
}) {
  // No sequence could be built — the server did not say which Spaces this
  // targets. An empty segment row would read as "no stages", which is a
  // different and wrong claim, so the strip is omitted and the caption carries
  // the whole message.
  if (stages.length === 0) {
    return (
      <Typography
        variant='caption'
        color='text.secondary'
        noWrap
        /*
          The theme's `caption` variant carries `textTransform: uppercase`
          globally, so this rendered "NOT REPORTED" — shouting a state the
          reader can do nothing about, and against the ruling that this feature
          uses no uppercase. Overridden here rather than in the theme, which
          every other surface depends on.
        */
        sx={{ textTransform: 'none' }}
      >
        {rolloutsConsoleCopy.states.unknown.label}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      <Stack direction='row' spacing={0.5} data-testid='rollout-stage-strip'>
        {stages.map((stage) => (
          <Box
            key={stage.stageId}
            data-testid='rollout-stage-segment'
            data-tone={progressUnavailable ? 'gated' : stage.segmentTone}
            /*
              The display name, never the raw id. A `title` is user-visible and
              is NOT part of `innerText`, so a synthetic id here is invisible to
              any text scan of the page and plainly visible to anyone hovering.
            */
            title={`${stageDisplayName(stage.stageId, stage.isSource)}: ${stage.state.label}`}
            sx={{
              height: 6,
              flex: 1,
              minWidth: 12,
              maxWidth: segmentMaxWidth,
              borderRadius: 0.5,
              ...(progressUnavailable ? tones.gated : tones[stage.segmentTone]),
            }}
          />
        ))}
      </Stack>

      {viewerStageIndex !== null && (
        <Stack direction='row' spacing={0.5} aria-hidden='true'>
          {stages.map((stage, i) => (
            <Box
              key={stage.stageId}
              sx={{ flex: 1, minWidth: 12, maxWidth: segmentMaxWidth, display: 'flex', justifyContent: 'center' }}
            >
              {i === viewerStageIndex && (
                <Box
                  data-testid='component-rollout-here'
                  data-stage={stage.stageId}
                  sx={{
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderBottom: (theme: Theme) => `4px solid ${theme.palette.text.primary}`,
                  }}
                />
              )}
            </Box>
          ))}
        </Stack>
      )}

      {showCaption && (
        <Typography variant='caption' color='text.secondary' noWrap>
          {progressUnavailable
            ? rolloutsConsoleCopy.states.unknown.label
            : rolloutsConsoleCopy.stagesDone(stagesDone, stagesTotal)}
          {!progressUnavailable && nextStageId !== null
            ? ` · ${rolloutsConsoleCopy.nextStage(nextStageId)}`
            : ''}
        </Typography>
      )}
    </Stack>
  );
}
