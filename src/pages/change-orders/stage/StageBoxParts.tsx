// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts every status box is built from: the frame (tile, headline, body),
 * sentences with links, the dry-run line, "Go to …", and a failed promotion's
 * items.
 *
 * A problem is the loudest card on the page: a solid amber or red tile with a
 * white glyph, the headline in the palette's dark tone at 700, and the box tinted
 * with a full 1px border. Never a coloured left edge. Calm states keep the white
 * card and a tinted tile.
 */

import { createContext, useContext, type ReactNode, type Ref } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PublishIcon from '@mui/icons-material/Publish';
import ScheduleIcon from '@mui/icons-material/Schedule';
import UndoIcon from '@mui/icons-material/Undo';
import WarningIcon from '@mui/icons-material/Warning';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { stageCardCopy } from './stageCardCopy';
import { hrefOfRef, type LinkResolvers } from './stageLinks';
import type { CopyLinkRef, CopySegment, DryRunLine, StageBoxLook, StageCardStateKind, StageIconKey, StageTone } from './stageTypes';

/** Under this width the box tightens and its tile shrinks. */
const NARROW = '@media (max-width: 759.98px)';

// ---------------------------------------------------------------------------
// Links inside sentences
// ---------------------------------------------------------------------------

/** What a link inside a sentence needs: where it goes, and what an in-page link opens. */
export interface StageLinks {
  resolvers: LinkResolvers;
  /** A field link: open the Full diff card at that row. */
  onField: (ref: { spaceId: string; unitId: string; path: string }) => void;
  /** Open the Full diff card. */
  onDiff: () => void;
}

/** Ink with an underline that is always there, so a link in a sentence reads as one without colour. */
const proseLinkSx = {
  color: 'text.primary',
  font: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: 'var(--t3)',
  textDecorationThickness: '1px',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
  '&:hover': { textDecorationColor: 'var(--t1)' },
  '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
} as const;

const codeSx = { fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '-0.01em' } as const;

function SegmentLink({ part, links }: { part: Extract<CopySegment, { kind: 'link' }>; links: StageLinks }) {
  const ref: CopyLinkRef = part.ref;
  const href = hrefOfRef(ref, links.resolvers);
  const text = part.code === true ? <Box component="code" sx={{ ...codeSx, fontSize: 'inherit' }}>{part.text}</Box> : part.text;
  // Spaces and Units are named by slug, so they are set as slugs are.
  const mono = part.code === true || ref.to === 'space' || ref.to === 'unit';
  const sx = { ...proseLinkSx, ...(mono ? { ...codeSx, fontWeight: 500 } : {}) };
  if (ref.to === 'field' || ref.to === 'diff') {
    return (
      <Link
        href={href}
        title={part.title}
        sx={sx}
        data-field-link={ref.to === 'field' ? ref.path : undefined}
        onClick={(event) => {
          event.preventDefault();
          if (ref.to === 'field') links.onField({ spaceId: ref.spaceId, unitId: ref.unitId, path: ref.path });
          else links.onDiff();
        }}
      >
        {text}
      </Link>
    );
  }
  // A stage link stays on this ChangeOrder; a Space or Unit opens in a new tab, so the review here is kept.
  const newTab = ref.to === 'space' || ref.to === 'unit' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <Link component={RouterLink} to={href} title={part.title} sx={sx} {...newTab}>
      {text}
    </Link>
  );
}

/**
 * A sentence written as segments in `stageCardCopy`: links where it names a
 * stage, Space, Unit or field, code where it names a slug. Without `links` the
 * links are plain text.
 */
export function CopyText({ parts, links, codeInherit = false }: { parts: readonly CopySegment[]; links?: StageLinks; codeInherit?: boolean }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.kind === 'text') return <span key={i}>{part.text}</span>;
        if (part.kind === 'code') {
          return (
            <Box key={i} component="code" sx={{ ...codeSx, ...(codeInherit ? { fontSize: 'inherit' } : {}) }}>
              {part.text}
            </Box>
          );
        }
        if (links === undefined) return <span key={i}>{part.text}</span>;
        return <SegmentLink key={i} part={part} links={links} />;
      })}
    </>
  );
}

/** A link to an app route inside a sentence. It leaves the ChangeOrder, so it opens a new tab. */
export function ProseLink({ href, children, code = false, weight = 500 }: { href: string; children: ReactNode; code?: boolean; weight?: 400 | 500 }) {
  return (
    <Link
      component={RouterLink}
      to={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ ...proseLinkSx, ...(code ? { ...codeSx, fontWeight: weight } : {}) }}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

/** A loud box tints its body and sets its text in ink; a calm one in secondary text. */
const LoudContext = createContext(false);

const TONE_VARS: Record<StageTone, { bg: string; bd: string; fg: string }> = {
  success: { bg: 'var(--green-bg)', bd: 'var(--green-bd)', fg: 'success.main' },
  warning: { bg: 'var(--amber-bg)', bd: 'var(--amber-bd)', fg: 'warning.main' },
  error: { bg: 'var(--red-bg)', bd: 'var(--red-bd)', fg: 'error.main' },
  neutral: { bg: 'var(--bg-hover)', bd: 'var(--bd0)', fg: 'text.secondary' },
};

/** Each glyph as [calm, solid]: a problem tile carries the filled variant, in white. */
const GLYPHS: Record<StageIconKey, [typeof CheckCircleIcon, typeof CheckCircleIcon]> = {
  check: [CheckCircleIcon, CheckCircleIcon],
  person: [PersonOutlineIcon, PersonOutlineIcon],
  upload: [PublishIcon, PublishIcon],
  error: [ErrorOutlineIcon, ErrorIcon],
  warning: [WarningAmberIcon, WarningIcon],
  block: [BlockIcon, BlockIcon],
  undo: [UndoIcon, UndoIcon],
  progress: [AutorenewIcon, AutorenewIcon],
  help: [HelpOutlineIcon, HelpOutlineIcon],
};

export interface StageStatusBoxProps {
  look: StageBoxLook;
  headline: ReactNode;
  /** `data-stage-state`. */
  stateKind: StageCardStateKind;
  /** The box hosts review actions: it is what "Review now" and a copied review link scroll to. */
  reviewAnchorId?: string;
  /** The headline, focused after an action that changes the state. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** A clock instead of the look's glyph: the stage is waiting, not wrong. */
  glyph?: 'clock';
  children?: ReactNode;
}

/** The frame: a 36px tile, the headline, and the body. */
export function StageStatusBox({ look, headline, stateKind, reviewAnchorId, headingRef, glyph, children }: StageStatusBoxProps) {
  const solid = look.tile === 'solid' && (look.tone === 'warning' || look.tone === 'error');
  const tone = TONE_VARS[look.tone];
  const Glyph = glyph === 'clock' ? ScheduleIcon : GLYPHS[look.icon][solid ? 1 : 0];
  return (
    <Paper
      elevation={2}
      component="section"
      aria-labelledby="stage-status-heading"
      id={reviewAnchorId}
      data-testid="stage-status"
      data-stage-state={stateKind}
      sx={{
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: '12px',
        p: '16px',
        scrollMarginTop: '16px',
        ...(solid ? { bgcolor: tone.bg, borderColor: tone.bd } : {}),
        [NARROW]: { gridTemplateColumns: '28px minmax(0, 1fr)', gap: '10px', p: '14px' },
        '& button:focus-visible, & summary:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          boxSizing: 'border-box',
          borderRadius: 'var(--r-sm)',
          display: 'grid',
          placeItems: 'center',
          border: '1px solid',
          ...(solid
            ? { bgcolor: tone.fg, borderColor: tone.fg, color: 'common.white' }
            : { bgcolor: tone.bg, borderColor: tone.bd, color: tone.fg }),
          [NARROW]: { width: 28, height: 28 },
        }}
      >
        <Glyph sx={{ fontSize: 20, [NARROW]: { fontSize: 16 } }} />
      </Box>
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere', color: solid ? 'text.primary' : 'text.secondary' }}>
        <Typography
          variant="h2"
          component="h3"
          id="stage-status-heading"
          tabIndex={-1}
          ref={headingRef}
          sx={{
            mt: '7px',
            color: solid ? `${look.tone}.dark` : 'text.primary',
            fontWeight: solid ? 700 : 600,
            '&:focus': { outline: 'none' },
            [NARROW]: { mt: '3px' },
          }}
        >
          {headline}
        </Typography>
        <LoudContext.Provider value={solid}>{children}</LoudContext.Provider>
      </Box>
    </Paper>
  );
}

/** A sentence of the box's body. */
export function StatusText({ children, testId, held, sx }: { children: ReactNode; testId?: string; held?: boolean; sx?: object }) {
  return (
    <Typography
      component="p"
      variant="body2"
      data-testid={testId}
      data-held={held === true ? true : undefined}
      sx={{ mt: '4px', maxWidth: '72ch', color: 'inherit', ...sx }}
    >
      {children}
    </Typography>
  );
}

/** A tinted note inside the box: a fill and a full 1px border in the tone, never a side stripe. */
export function InlineNotice({ tone, children, testId }: { tone: 'warning' | 'error' | 'neutral'; children: ReactNode; testId?: string }) {
  const vars = TONE_VARS[tone];
  return (
    <Box
      data-testid={testId}
      sx={{
        mt: '12px',
        p: '8px 12px',
        maxWidth: 560,
        boxSizing: 'border-box',
        bgcolor: tone === 'neutral' ? 'var(--bg)' : vars.bg,
        border: '1px solid',
        borderColor: tone === 'neutral' ? 'var(--bd1)' : vars.bd,
        borderRadius: 'var(--r-sm)',
        typography: 'body2',
        color: 'text.primary',
      }}
    >
      {children}
    </Box>
  );
}

/** Someone's words, quoted: a white panel with a 1px red line, the byline above the text. */
export function QuoteBlock({ byline, children, testId }: { byline: ReactNode; children: string; testId?: string }) {
  return (
    <Box
      component="blockquote"
      data-testid={testId}
      sx={{ m: '12px 0 0', p: '12px', bgcolor: 'background.paper', border: '1px solid var(--red-bd)', borderRadius: 'var(--r-sm)', maxWidth: '72ch', boxSizing: 'border-box', typography: 'body2', color: 'text.primary' }}
    >
      <Box component="span" sx={{ display: 'block', mb: children === '' ? 0 : '4px', typography: 'subtitle2', color: 'text.secondary' }}>
        {byline}
      </Box>
      {children === '' ? null : <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{children}</Box>}
    </Box>
  );
}

/** The dry-run line (`data-testid="stage-dry-run"`). An icon only when it fails or cannot tell. */
export function DryRunLineView({ line, children }: { line: Pick<DryRunLine, 'mode' | 'text' | 'icon' | 'fidelity'>; children?: ReactNode }) {
  const loud = useContext(LoudContext);
  if (line.text === null && children === undefined) return null;
  return (
    <Typography
      component="p"
      variant="body2"
      data-testid="stage-dry-run"
      data-dry-run={line.mode}
      data-fidelity={line.fidelity}
      sx={{ display: 'flex', gap: '6px', alignItems: 'flex-start', mt: loud ? '12px' : '4px', color: 'inherit' }}
    >
      {line.icon === 'fail' ? <ErrorOutlineIcon aria-hidden sx={{ fontSize: 14, mt: '2px', color: 'error.main' }} /> : null}
      {line.icon === 'warn' ? <WarningAmberIcon aria-hidden sx={{ fontSize: 14, mt: '2px', color: 'warning.main' }} /> : null}
      <Box component="span" sx={{ minWidth: 0 }}>
        {line.text}
        {children}
      </Box>
    </Typography>
  );
}

/**
 * The dry-run line, with a way to run it again. When the dry run could not
 * answer, the line stays plain and ends in a "Check again" link, so the main
 * button below it does not move. When it failed, Promote is withheld and
 * "Check again" is the box's action.
 */
export function DryRunCheck({ line, onCheckAgain }: { line: DryRunLine; onCheckAgain?: () => void }) {
  if (line.mode === 'unavailable' && onCheckAgain !== undefined) {
    return (
      <DryRunLineView line={{ ...line, icon: 'none' }}>
        {' '}
        <Link component="button" type="button" onClick={onCheckAgain} data-testid="stage-check-again" sx={{ ...proseLinkSx, verticalAlign: 'baseline' }}>
          {stageCardCopy.merge.checkAgain}
        </Link>
      </DryRunLineView>
    );
  }
  return (
    <>
      <DryRunLineView line={line} />
      {line.mode === 'fails' && onCheckAgain !== undefined ? (
        <StatusActions>
          <Button variant="outlined" color="inherit" onClick={onCheckAgain} data-testid="stage-check-again" sx={{ bgcolor: 'background.paper' }}>
            {stageCardCopy.merge.checkAgain}
          </Button>
        </StatusActions>
      ) : null}
    </>
  );
}

/** Spaces as links, in a sentence: "a", "a and b", "a, b and c". */
export function SpaceList({ spaces, links }: { spaces: readonly { spaceId: string; name: string }[]; links?: StageLinks }) {
  const parts: CopySegment[] = [];
  spaces.forEach((space, i) => {
    if (i > 0) parts.push({ kind: 'text', text: i === spaces.length - 1 ? ' and ' : ', ' });
    parts.push({ kind: 'link', text: space.name, ref: { to: 'space', spaceId: space.spaceId } });
  });
  return <CopyText parts={parts} links={links} />;
}

/** Where "Go to …" leads. */
export interface NextStep {
  /** A stage name, or `null` for the Complete step. */
  name: string | null;
  href: string;
}

/** "Go to Test →": a text button that is a link. `label` says it another way ("Go to {previous}"). */
export function GoToNext({ next, label, testId = 'stage-go-next' }: { next: NextStep; label?: string; testId?: string }) {
  return (
    <Button
      component={RouterLink}
      to={next.href}
      variant="text"
      endIcon={<ArrowForwardIcon sx={{ fontSize: '16px !important' }} />}
      data-testid={testId}
      sx={{ ml: '-10px', px: '10px', color: 'text.primary', '&:hover': { bgcolor: 'var(--bg-hover)' }, '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
    >
      {label ?? (next.name === null ? stageCardCopy.goToComplete : stageCardCopy.goTo(next.name))}
    </Button>
  );
}

/** A row of buttons under the body. */
export function StatusActions({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', mt: '12px' }}>{children}</Box>;
}

/** The source stage says so in one line at the card's edge, with no box: there is nothing to do there. */
export function StageSourceLine({ invocation, next }: { invocation: boolean; next: NextStep | null }) {
  return (
    <Typography
      component="p"
      variant="body2"
      data-testid="stage-status"
      data-stage-state={invocation ? 'invocationSource' : 'source'}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', color: 'text.secondary', pt: '2px', pl: '1px' }}
    >
      <span>{invocation ? stageCardCopy.body.invocationSource : stageCardCopy.body.source}</span>
      {next !== null ? <GoToNext next={next} /> : null}
    </Typography>
  );
}

