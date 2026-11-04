// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts the Stage log's sentences are built from: sentences with links and
 * code, a sentence under a line, a tinted note, a quote, and a row of buttons.
 */

import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { stageCardCopy } from './stageCardCopy';
import { hrefOfRef, type LinkResolvers } from './stageLinks';
import type { CopyLinkRef, CopySegment, StageTone } from './stageTypes';

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
    <Link component={RouterLink} to={href} title={part.title} sx={sx} data-link={ref.to} {...newTab}>
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

// ---------------------------------------------------------------------------
// Notes, quotes and actions
// ---------------------------------------------------------------------------

const TONE_VARS: Record<StageTone, { bg: string; bd: string; fg: string }> = {
  success: { bg: 'var(--green-bg)', bd: 'var(--green-bd)', fg: 'success.main' },
  warning: { bg: 'var(--amber-bg)', bd: 'var(--amber-bd)', fg: 'warning.main' },
  error: { bg: 'var(--red-bg)', bd: 'var(--red-bd)', fg: 'error.main' },
  neutral: { bg: 'var(--bg-hover)', bd: 'var(--bd0)', fg: 'text.secondary' },
};

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

/** A row of buttons under the body. */
export function StatusActions({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', mt: '12px' }}>{children}</Box>;
}

/**
 * "a, b and c": Spaces as links. With `limit`, the first `limit` and then "and N more", which
 * shows the rest: a review can read 50 Spaces.
 */
export function SpaceList({ spaces, links, limit }: { spaces: readonly { spaceId: string; name: string }[]; links?: StageLinks; limit?: number }) {
  const [all, setAll] = useState(false);
  const cut = limit !== undefined && !all && spaces.length > limit;
  const shown = cut ? spaces.slice(0, limit) : spaces;
  const parts: CopySegment[] = [];
  shown.forEach((space, i) => {
    if (i > 0) parts.push({ kind: 'text', text: !cut && i === shown.length - 1 ? ' and ' : ', ' });
    parts.push({ kind: 'link', text: space.name, ref: { to: 'space', spaceId: space.spaceId } });
  });
  return (
    <>
      <CopyText parts={parts} links={links} />
      {cut ? (
        <>
          {' '}
          <ButtonBase
            onClick={() => setAll(true)}
            sx={{ font: 'inherit', fontSize: '11.5px', fontWeight: 600, color: 'text.secondary', verticalAlign: 'baseline', borderRadius: '3px', '&:hover': { color: 'text.primary' }, '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
          >
            {stageCardCopy.reviewRow.andMore(spaces.length - shown.length)}
          </ButtonBase>
        </>
      ) : null}
    </>
  );
}
