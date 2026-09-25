// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, type ReactNode } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from './componentTheme';
import { METER_GLYPHS } from './imageMeterGlyphs';
import { ReviewRow, SrOnly } from './diffStyles';
import { getInlineDiffPair, type InlineDiffSegment } from './inlineDiff';
import {
  classifyImageChange,
  IMAGE_CLASS_WORD,
  IMAGE_METER_LEVEL,
  parseImageRef,
  type ImageChangeClass,
  type ImageRowModel,
} from './imageRef';

/**
 * One row per container image, at the head of a unit.
 *
 * An image reference is `registry/namespace/repository:tag@digest`, and in a bump
 * everything left of the tag is identical on both sides. Routed through a generic
 * value row it is printed twice at full strength in two narrow columns, overflows
 * both, and wraps — putting the one segment that actually moved on a second line.
 * So the repository is printed ONCE and dimmed, and only the tag is diffed.
 *
 * The row deliberately does not occupy the three-column grid the rest of the tree
 * uses (hence {@link ReviewRow}'s `$plain`, which also suppresses the column tint
 * bands). Its content is container / repository / transition, which is not
 * path / before / after, and forcing the tag into a 28% column is the failure
 * described above.
 */

const ROW_HEIGHT = 28;



/** Token treatment, matching the value cells of the tree below. */
const SEGMENT_SX = {
  old: {
    display: 'inline',
    fontWeight: 700,
    background: 'rgba(154,0,5,0.10)',
    border: '1px solid rgba(154,0,5,0.28)',
    borderRadius: '3px',
    padding: '0 2px',
  },
  new: {
    display: 'inline',
    fontWeight: 700,
    background: 'rgba(21,128,61,0.12)',
    border: '1px solid rgba(21,128,61,0.30)',
    borderRadius: '3px',
    padding: '0 2px',
  },
} as const;

const SEGMENT_KEPT_SX = { display: 'inline' } as const;

const SIDE_SX = {
  old: { color: componentTheme.danger },
  new: { color: componentTheme.successEmphasis, fontWeight: 700 },
} as const;

/**
 * The transition never wraps, and everything to its left gives up room first.
 *
 * It also never shrinks — except in the two cases where it cannot fit a narrow
 * pane by construction. A registry move must name both references in full
 * because they no longer share a prefix, and a digest-only move carries two
 * opaque hashes; either is wider than the pane at its narrowest. Both truncate
 * from the END, which keeps what distinguishes them: registries differ at the
 * host and two digests differ in their first characters.
 */
const TRANSITION_SX = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  whiteSpace: 'nowrap',
} as const;

const TRANSITION_SHRINKABLE_SX = {
  ...TRANSITION_SX,
  flex: '0 1 auto',
  minWidth: 0,
  '& > span': { overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
} as const;

const NAME_SX = {
  flex: '1 1 auto',
  minWidth: 36,
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  overflow: 'hidden',
} as const;

const CONTAINER_NAME_SX = {
  flex: 'none',
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/**
 * The repository truncates from the LEFT, so the registry host falls away before
 * the repository name — the part you need survives the part you do not.
 */
const REPO_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
  direction: 'rtl',
  textAlign: 'left',
} as const;

const INIT_BADGE_SX = {
  flex: 'none',
  fontSize: 8.5,
  fontWeight: 800,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: componentTheme.fgMuted,
  background: componentTheme.bgInset,
  borderRadius: '3px',
  padding: '1px 4px',
  lineHeight: 1.6,
} as const;

const WORD_SX = {
  flex: 'none',
  fontSize: 8.5,
  fontWeight: 800,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  borderRadius: '3px',
  padding: '1px 4px',
  lineHeight: '14px',
  background: componentTheme.attentionMuted,
  color: componentTheme.attention,
  border: `1px solid ${componentTheme.attentionEmphasis}33`,
} as const;

const ABSENT_SX = {
  color: componentTheme.fgSubtle,
  fontStyle: 'italic',
  fontSize: 10.5,
} as const;

const ARROW_SX = { flex: 'none', color: componentTheme.fgSubtle, display: 'inline-flex' } as const;

/**
 * Row width below which a digest row drops the `sha256:` prefix.
 *
 * IN CONTENT-BOX PIXELS. `container-type: inline-size` queries the content box,
 * so this is NOT comparable to a getBoundingClientRect() reading of the row:
 * the row carries 9px of left and 12px of right padding, which a border-box
 * measurement includes and this number does not.
 *
 * Measured rather than chosen. The transition needs 326px to show the full
 * form. The pane produces a row content box of 335px at its narrowest and
 * 530px at its next width; at 335 the transition is given 249px, a 77px
 * shortfall that was being taken out of the hex. The two prefixes are worth
 * about 101px together, so surrendering them clears the deficit with room left.
 * 440 sits between the two widths the pane actually produces.
 */
const DIGEST_PREFIX_MIN_ROW = 440;

const DIGEST_PREFIX_SX = {
  color: componentTheme.fgSubtle,
  flex: 'none',
  [`@container imagerow (max-width: ${DIGEST_PREFIX_MIN_ROW}px)`]: { display: 'none' },
} as const;

const ArrowGlyph = (
  <Box component="span" sx={ARROW_SX} aria-hidden>
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  </Box>
);

function Segments({ segments, tone }: { segments: InlineDiffSegment[]; tone: 'old' | 'new' }): ReactNode {
  return (
    <>
      {segments.map((seg, i) => (
        <Box key={i} component="span" sx={seg.changed ? SEGMENT_SX[tone] : SEGMENT_KEPT_SX}>{seg.text}</Box>
      ))}
    </>
  );
}

/**
 * What the two sides of the transition should read, given what actually moved.
 *
 * On an ordinary bump the repository is shared, so only the tag is diffed. On a
 * registry move it is not shared and cannot be printed once, so both sides are
 * named in full — printing only the tag there would show two identical strings
 * and nothing to mark, which is the failure this branch exists to prevent.
 */
function transitionText(row: ImageRowModel, cls: ImageChangeClass): { before: string; after: string; shared: string | null } {
  const from = parseImageRef(row.from);
  const to = parseImageRef(row.to);
  if (cls === 'repo') return { before: row.from ?? '', after: row.to ?? '', shared: null };
  if (cls === 'digest') {
    return { before: splitDigest(from?.digest).hex, after: splitDigest(to?.digest).hex, shared: to?.tag ?? from?.tag ?? '' };
  }
  return { before: from?.tag ?? row.from ?? '', after: to?.tag ?? row.to ?? '', shared: null };
}

/**
 * A digest in two parts: the algorithm, and enough hex to tell two apart.
 *
 * They are separated because they degrade differently. The hex is the entire
 * information content of a digest-only row, and the algorithm is the same
 * `sha256:` on every row ever rendered — so when the row runs out of space the
 * prefix is what goes, and the hex keeps its room.
 */
function splitDigest(digest: string | null | undefined): { prefix: string; hex: string } {
  if (!digest) return { prefix: '', hex: '' };
  const colon = digest.indexOf(':');
  if (colon < 0) return { prefix: '', hex: digest.slice(0, 7) };
  return { prefix: digest.slice(0, colon + 1), hex: digest.slice(colon + 1, colon + 8) };
}

interface ImageChangeRowProps {
  row: ImageRowModel;
  testIdPrefix?: string;
  srValuePrefix?: { old: string; new: string };
}

const ImageChangeRow = memo(({ row, testIdPrefix, srValuePrefix }: ImageChangeRowProps): ReactNode => {
  const from = parseImageRef(row.from);
  const to = parseImageRef(row.to);
  const cls = classifyImageChange(from, to);
  const word = IMAGE_CLASS_WORD[cls];
  const ref = to ?? from;
  // The repository earns its place only when it is not the container name again.
  // On a registry move the transition already names both sides in full.
  const showRepo = cls !== 'repo' && ref !== null && ref.repository !== row.containerName;
  const { before, after, shared } = transitionText(row, cls);
  const transitionSx = cls === 'repo' || cls === 'digest' ? TRANSITION_SHRINKABLE_SX : TRANSITION_SX;
  const digestPrefix = cls === 'digest' ? splitDigest(to?.digest ?? from?.digest).prefix : '';
  const pair = getInlineDiffPair(before, after);
  // The hidden before/after words say "removed" and "added". On a row where
  // nothing moved they would describe a change that did not happen, so the
  // reference is announced plainly instead.
  const srPrefix = row.unchanged ? undefined : srValuePrefix;

  return (
    <ReviewRow
      $plain
      data-testid={testIdPrefix ? `${testIdPrefix}-image-row` : undefined}
      title={[row.from, row.to].filter(Boolean).join('\n')}
      sx={{
        containerType: 'inline-size',
        containerName: 'imagerow',
        gap: '8px',
        paddingLeft: '9px',
        paddingRight: '12px',
        minHeight: ROW_HEIGHT,
        borderBottom: `1px solid ${componentTheme.borderMuted}`,
        // An unchanged container is shown because a container left behind while
        // its neighbours moved is worth seeing. It is not a change, and reads as
        // the tree's own context rows do.
        ...(row.unchanged ? { opacity: 0.45 } : null),
      }}
    >
      <Box component="span" data-testid={testIdPrefix ? `${testIdPrefix}-image-meter` : undefined} data-meter={IMAGE_METER_LEVEL[cls]}>
        {METER_GLYPHS[IMAGE_METER_LEVEL[cls]]}
      </Box>
      <Box component="span" sx={NAME_SX} data-testid={testIdPrefix ? `${testIdPrefix}-image-name` : undefined}>
        <Box component="span" sx={CONTAINER_NAME_SX}>{row.containerName}</Box>
        {row.isInit ? <Box component="span" sx={INIT_BADGE_SX}>init</Box> : null}
        {showRepo ? (
          <Box component="span" sx={REPO_SX} title={ref?.repoPath}>
            <Box component="span" sx={{ direction: 'ltr', unicodeBidi: 'embed' }}>{ref?.repoPath}</Box>
          </Box>
        ) : null}
      </Box>
      <Box component="span" sx={transitionSx} data-testid={testIdPrefix ? `${testIdPrefix}-image-delta` : undefined}>
        {shared ? <Box component="span" sx={{ color: componentTheme.fgSubtle }}>{shared}</Box> : null}
        {row.from === null ? <Box component="span" sx={ABSENT_SX}>not set</Box> : (
          <Box component="span" sx={SIDE_SX.old}>
            {srPrefix ? <SrOnly>{srPrefix.old}</SrOnly> : null}
            {digestPrefix ? <Box component="span" sx={DIGEST_PREFIX_SX}>{digestPrefix}</Box> : null}
            <Segments segments={pair.old} tone="old" />
          </Box>
        )}
        {ArrowGlyph}
        {row.to === null ? <Box component="span" sx={ABSENT_SX}>taken out</Box> : (
          <Box component="span" sx={SIDE_SX.new}>
            {srPrefix ? <SrOnly>{srPrefix.new}</SrOnly> : null}
            {digestPrefix ? <Box component="span" sx={DIGEST_PREFIX_SX}>{digestPrefix}</Box> : null}
            <Segments segments={pair.new} tone="new" />
          </Box>
        )}
      </Box>
      {word ? (
        <Box component="span" sx={WORD_SX} data-testid={testIdPrefix ? `${testIdPrefix}-image-word` : undefined}>{word}</Box>
      ) : null}
    </ReviewRow>
  );
});

ImageChangeRow.displayName = 'ImageChangeRow';

interface ImageChangeRowsProps {
  rows: ImageRowModel[];
  testIdPrefix?: string;
  /**
   * Visually-hidden before/after prefixes, so the distinction is not carried by
   * colour alone. These rows leave the column grid and therefore lose its tint
   * bands, which makes the hidden text the row's only non-colour cue.
   */
  srValuePrefix?: { old: string; new: string };
}

/** The image rows for one unit, above its tree. Renders nothing when there are none. */
export const ImageChangeRows = memo(({ rows, testIdPrefix, srValuePrefix }: ImageChangeRowsProps): ReactNode => {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <ImageChangeRow key={row.containerPrefix} row={row} testIdPrefix={testIdPrefix} srValuePrefix={srValuePrefix} />
      ))}
    </>
  );
});

ImageChangeRows.displayName = 'ImageChangeRows';
