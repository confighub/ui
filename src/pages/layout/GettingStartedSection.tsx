// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExploreIcon from '@mui/icons-material/Explore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import {
  CHANGE_AND_PROMOTE_TOUR_ID,
  DEPLOY_AND_RELEASE_TOUR_ID,
  EXPLORE_AND_INSPECT_TOUR_ID,
  GETTING_STARTED_TOUR_ID,
  OWNERSHIP_AND_PROD_TOUR_ID,
  PROD_AND_NEXT_TOUR_ID,
  useTourControls,
} from '@/components/tour';
import { useAppSelector } from '@/hooks/useApp';
import { selectCompletedTourIds } from '@/state/slices/tourSlice';

// ============================================================================
// TYPES
// ============================================================================

interface GettingStartedStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Omitted for steps with no walkthrough video; the expanded row then shows text only. */
  videoUrl?: string;
  videoTitle: string;
  actionLabel: string;
  /** Route the action button opens. Ignored when `tourId` is set. */
  actionPath: string;
  docsUrl: string;
  /** Starts this registered guided tour instead of navigating. */
  tourId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS: GettingStartedStep[] = [
  {
    id: 'guided-tour',
    title: 'Make your first component',
    description:
      'A guided walkthrough of the New component wizard: name the component, paste a sample manifest, and create the base space with its units.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Install a Component" — the tutorial chapter this tour's wizard flow
    // mirrors (it uses `cub variant upload`; we use the wizard instead).
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/install/',
    tourId: GETTING_STARTED_TOUR_ID,
  },
  {
    id: 'guided-tour-explore',
    title: 'Explore your component',
    description:
      'A short tour of the component you just made: the variant tree, its Configuration view, and one value inside it.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Flow a Change" is the chapter that explains the base/variant tree
    // this step is exploring.
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/flow/',
    tourId: EXPLORE_AND_INSPECT_TOUR_ID,
  },
  {
    id: 'guided-tour-deploy',
    title: 'Deploy to dev',
    description: 'A short tour that clones the base into a dev variant.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Go Live" — creates the dev deployment, the action this tour walks
    // through. Publishing a release (the other half of "Go Live") is
    // explained at the very end of the last tour instead — see
    // ownershipAndProd.tsx's docstring for why.
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/release/',
    tourId: DEPLOY_AND_RELEASE_TOUR_ID,
  },
  {
    id: 'guided-tour-promote',
    title: 'Change the base & promote',
    description:
      'A short tour that runs a function on the base, then shows dev the incoming change and pulls it in.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Make a Change" — "modify the foundation, advance, and publish", the
    // same change-then-promote arc.
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/change/',
    tourId: CHANGE_AND_PROMOTE_TOUR_ID,
  },
  {
    id: 'guided-tour-ownership',
    title: 'Field ownership',
    description:
      'A short tour that edits one value directly on dev and shows the override survive a later upgrade.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Flow a Change" is the chapter that covers field ownership.
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/flow/',
    tourId: OWNERSHIP_AND_PROD_TOUR_ID,
  },
  {
    id: 'guided-tour-prod',
    title: 'A prod variant & what’s next',
    description:
      'A short tour that makes a prod variant from dev, then explains publishing a release — the one thing this tour set cannot demonstrate live.',
    icon: <ExploreIcon sx={{ fontSize: 15 }} />,
    videoTitle: 'Guided tour',
    actionLabel: 'Take the tour',
    actionPath: '/components',
    // "Add a Production Deployment" — the dedicated chapter for this tour.
    docsUrl: 'https://docs.confighub.com/get-started/tutorial/prod/',
    tourId: PROD_AND_NEXT_TOUR_ID,
  },
];

/** Every step launches a guided tour, so all of them run in order, numbered and connected. */
const TOUR_STEPS = STEPS;

/** Left offset of the marker centre; the sequence connector is drawn on this line. */
const MARKER_CENTER_PX = 21;

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

/**
 * The panel is its own surface card. It opens off the rust top nav, so it supplies
 * the contrast itself (white paper, hairline border, popover shadow) instead of
 * inheriting the nav's rust fill. Rust stays what the design system says it is:
 * an action signal, not a background.
 */
const Panel = styled(Box)(({ theme }) => ({
  width: '100%',
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--bd0)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--sh-md)',
  overflow: 'hidden',
  fontFamily: theme.typography.fontFamily,
}));

const StepRow = styled(Box)<{ $current: boolean }>(({ $current }) => ({
  position: 'relative',
  backgroundColor: $current ? 'var(--rust-bg)' : 'transparent',
  transition: 'background-color 0.12s',
  '&:hover': {
    backgroundColor: $current ? 'var(--rust-bg)' : 'var(--bg-hover)',
  },
}));

/**
 * The clickable title line. It is a sibling of the expanded body and of the
 * completion marker, so no interactive element ever nests inside another.
 */
const StepTitleButton = styled(Box)(() => ({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 12px 9px 8px',
  cursor: 'pointer',
  outline: 'none',
  '&:focus-visible': {
    borderRadius: 'var(--r-sm)',
    boxShadow: 'inset 0 0 0 2px var(--rust-ring)',
  },
}));

const MarkerButton = styled('button')<{ $completed: boolean; $current: boolean }>(
  ({ $completed, $current }) => ({
    flexShrink: 0,
    marginLeft: 12,
    width: 18,
    height: 18,
    padding: 0,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 9.5,
    fontWeight: 700,
    lineHeight: 1,
    fontFamily: 'inherit',
    transition: 'background-color 0.12s, border-color 0.12s, color 0.12s',
    backgroundColor: $completed ? 'var(--green)' : 'var(--surface)',
    border: `1px solid ${$completed ? 'var(--green)' : $current ? 'var(--rust)' : 'var(--bd0)'}`,
    // t2, not t3: the step number is content, and t3 fails AA at this size.
    color: $completed ? '#ffffff' : $current ? 'var(--rust)' : 'var(--t2)',
    '&:hover': {
      borderColor: $completed ? 'var(--green)' : 'var(--rust)',
      color: $completed ? '#ffffff' : 'var(--rust)',
    },
    '&:focus-visible': {
      outline: '2px solid var(--rust-ring)',
      outlineOffset: 1,
    },
  }),
);

/** Full-bleed 3px meter under the header. Decorative: the "n of m" label carries the value. */
const ProgressTrack = styled(Box)(() => ({
  height: 3,
  width: '100%',
  backgroundColor: 'var(--bd1)',
  overflow: 'hidden',
}));

const ProgressBar = styled(Box)<{ $value: number; $complete: boolean }>(
  ({ $value, $complete }) => ({
    height: '100%',
    width: `${$value}%`,
    backgroundColor: $complete ? 'var(--green)' : 'var(--rust)',
    transition: 'width 0.25s ease, background-color 0.25s ease',
  }),
);

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StepItemProps {
  step: GettingStartedStep;
  /** 1-based position in the guided-tour sequence. Omitted for the standalone steps. */
  sequence?: number;
  completed: boolean;
  /** The first unfinished step, tinted so there is exactly one obvious next move. */
  current: boolean;
  expanded: boolean;
  /** Draws the vertical connector down to the next sequential step. */
  connected: boolean;
  onToggleComplete: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

const StepItem = memo(
  ({
    step,
    sequence,
    completed,
    current,
    expanded,
    connected,
    onToggleComplete,
    onToggleExpand,
  }: StepItemProps) => {
    const navigate = useNavigate();
    const { start } = useTourControls();

    const handleAction = useCallback(() => {
      if (step.tourId) {
        start(step.tourId);
        return;
      }
      navigate(step.actionPath);
    }, [navigate, start, step.actionPath, step.tourId]);

    const handleToggleExpand = useCallback(() => {
      onToggleExpand(step.id);
    }, [onToggleExpand, step.id]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onToggleExpand(step.id);
      },
      [onToggleExpand, step.id],
    );

    const handleToggleComplete = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onToggleComplete(step.id);
      },
      [onToggleComplete, step.id],
    );

    const highlighted = current && !completed;
    const videoId = step.videoUrl?.split('/embed/')[1];

    return (
      <StepRow $current={highlighted}>
        {/* Sequence connector — runs from this marker into the next row's marker,
            so the five steps read as one ordered path rather than five options. */}
        {connected && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: `${MARKER_CENTER_PX}px`,
              top: 27,
              bottom: -9,
              width: '1px',
              backgroundColor: completed ? 'var(--green-bd)' : 'var(--bd0)',
            }}
          />
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-start', pt: '9px' }}>
          <Tooltip title={completed ? 'Mark as not done' : 'Mark as done'} enterDelay={400}>
            <MarkerButton
              type='button'
              $completed={completed}
              $current={highlighted}
              onClick={handleToggleComplete}
              aria-pressed={completed}
              aria-label={`${completed ? 'Mark as not done' : 'Mark as done'}: ${step.title}`}
              sx={{ position: 'relative' }}
            >
              {completed ? (
                <CheckRoundedIcon sx={{ fontSize: 12 }} />
              ) : sequence ? (
                sequence
              ) : (
                step.icon
              )}
            </MarkerButton>
          </Tooltip>

          <StepTitleButton
            role='button'
            tabIndex={0}
            aria-expanded={expanded}
            onClick={handleToggleExpand}
            onKeyDown={handleKeyDown}
          >
            <Typography
              sx={{
                flex: 1,
                fontSize: '12.5px',
                fontWeight: highlighted ? 700 : 600,
                lineHeight: 1.35,
                color: completed ? 'var(--t3)' : 'var(--t1)',
                textDecoration: completed ? 'line-through' : 'none',
              }}
            >
              {step.title}
            </Typography>

            <Box sx={{ flexShrink: 0, display: 'flex', color: 'var(--t3)' }}>
              {expanded ? (
                <ExpandLessIcon sx={{ fontSize: 15 }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 15 }} />
              )}
            </Box>
          </StepTitleButton>
        </Box>

        {/* Expanded body — what the step does, an optional video, and the action */}
        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ pl: '38px', pr: '12px', pb: 1.5 }}>
            <Typography sx={{ fontSize: '11.5px', lineHeight: 1.5, color: 'var(--t2)' }}>
              {step.description}
            </Typography>

            {videoId && (
              <Box
                component='a'
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target='_blank'
                rel='noopener noreferrer'
                aria-label={`Watch: ${step.videoTitle}`}
                sx={{
                  position: 'relative',
                  display: 'block',
                  mt: 1.25,
                  height: 92,
                  borderRadius: 'var(--r-sm)',
                  overflow: 'hidden',
                  border: '1px solid var(--bd0)',
                  '&:hover .gs-play': { transform: 'scale(1.08)' },
                }}
              >
                <Box
                  component='img'
                  src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                  alt=''
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <Box
                  className='gs-play'
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    translate: '-50% -50%',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(17,18,20,0.72)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.15s',
                  }}
                >
                  <PlayArrowRoundedIcon sx={{ fontSize: 22, color: '#ffffff' }} />
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.25 }}>
              <Button
                variant='contained'
                color='primary'
                size='small'
                onClick={handleAction}
                startIcon={step.icon}
                sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap' }}
              >
                {step.actionLabel}
              </Button>

              <Tooltip title='Open documentation' enterDelay={400}>
                <IconButton
                  size='small'
                  component='a'
                  href={step.docsUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label={`Documentation: ${step.title}`}
                >
                  <OpenInNewIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Collapse>
      </StepRow>
    );
  },
);

StepItem.displayName = 'StepItem';

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

const LS_COMPLETED = 'getting_started_completed';

const readIds = (key: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const writeIds = (key: string, ids: Set<string>): void => {
  localStorage.setItem(key, JSON.stringify([...ids]));
};

const allStepIds = STEPS.map((s) => s.id);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface GettingStartedSectionProps {
  isNavOpen: boolean;
}

export const GettingStartedSection = memo(({ isNavOpen }: GettingStartedSectionProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => readIds(LS_COMPLETED));

  // A step is complete either because the user manually checked it off
  // (`completedIds`, the only thing `handleToggleComplete` ever writes to)
  // or because its tour actually ran to its last step and the completion
  // screen was acknowledged (`completedTourIds`, owned by the tour engine).
  // The union only ever adds completions — un-toggling a step the tour
  // engine already marked done does not un-mark it; the tour genuinely did
  // finish, and that fact does not become false again.
  const completedTourIds = useAppSelector(selectCompletedTourIds);
  const effectiveCompletedIds = useMemo(() => {
    const merged = new Set(completedIds);
    for (const step of STEPS) {
      if (step.tourId && completedTourIds.includes(step.tourId)) merged.add(step.id);
    }
    return merged;
  }, [completedIds, completedTourIds]);

  const completedCount = useMemo(
    () => allStepIds.filter((id) => effectiveCompletedIds.has(id)).length,
    [effectiveCompletedIds],
  );

  const currentId = useMemo(
    () => STEPS.find((step) => !effectiveCompletedIds.has(step.id))?.id ?? null,
    [effectiveCompletedIds],
  );

  const handleToggleComplete = useCallback((id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeIds(LS_COMPLETED, next);
      return next;
    });
  }, []);

  /** One row open at a time: this is a dropdown, so the list has to stay short. */
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (!isNavOpen) return null;

  const total = STEPS.length;
  const allDone = completedCount === total;
  const progress = (completedCount / total) * 100;

  const renderStep = (step: GettingStartedStep, sequence?: number, connected = false) => (
    <StepItem
      key={step.id}
      step={step}
      sequence={sequence}
      completed={effectiveCompletedIds.has(step.id)}
      current={currentId === step.id}
      expanded={expandedId === step.id}
      connected={connected}
      onToggleComplete={handleToggleComplete}
      onToggleExpand={handleToggleExpand}
    />
  );

  return (
    <Panel>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, px: '12px', py: '9px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '13px', fontWeight: 700, color: 'var(--t1)' }}>
            Get started
          </Typography>
          <Typography sx={{ mt: '1px', fontSize: '11px', color: 'var(--t2)' }}>
            {total} short tours, in order.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Typography
            sx={{
              fontSize: '11px',
              fontWeight: 600,
              color: allDone ? 'var(--green)' : 'var(--t2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {completedCount} of {total}
          </Typography>

          <Tooltip title={collapsed ? 'Show steps' : 'Hide steps'} enterDelay={400}>
            <IconButton
              size='small'
              onClick={() => setCollapsed((p) => !p)}
              aria-label={collapsed ? 'Show steps' : 'Hide steps'}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              ) : (
                <ExpandLessIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <ProgressTrack aria-hidden>
        <ProgressBar $value={progress} $complete={allDone} />
      </ProgressTrack>

      {/* Always the step list, even once every step is complete — each row
          shows its own completed state (StepItem), and the panel itself
          stays reachable and reopenable rather than replacing the list with
          a one-time "you're done" screen the user has to dismiss to get
          back to their tours. */}
      <Collapse in={!collapsed} unmountOnExit>
        <Box sx={{ py: 0.75 }}>
          {TOUR_STEPS.map((step, index) => renderStep(step, index + 1, index < TOUR_STEPS.length - 1))}
        </Box>
      </Collapse>
    </Panel>
  );
});

GettingStartedSection.displayName = 'GettingStartedSection';
