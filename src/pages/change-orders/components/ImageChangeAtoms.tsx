// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The small, shared pieces of an image change, used by the list cell and the
 * detail hero: the image's monogram and an image tag with its changed part
 * marked.
 *
 * None of them is interactive: the list row they sit in is itself a button,
 * and a control inside it would be a control inside a control.
 */

import { memo } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../../x/apps/componentTheme';
import { changeOrderInk, changeOrderSurface } from '../changeOrdersTokens';
import { markDelta, monogramHueOf, monogramOf, type BumpKind, type ContainerRole, type ImageChange } from '../imageChange';
import { BUMP_TONE } from '../imageChangeTone';

const MONOGRAM_SIZE = {
  sm: { box: 26, font: 11, radius: 6 },
  md: { box: 32, font: 12.5, radius: 7 },
  lg: { box: 44, font: 15, radius: 9 },
} as const;

export interface MonogramProps {
  repository: string;
  size?: keyof typeof MONOGRAM_SIZE;
}

/** Two letters on the image's own stable colour pair. Decorative: the name always sits beside it. */
export const Monogram = memo(function Monogram({ repository, size = 'sm' }: MonogramProps) {
  const { ground, ink } = monogramHueOf(repository);
  const s = MONOGRAM_SIZE[size];
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        width: s.box,
        height: s.box,
        borderRadius: `${s.radius}px`,
        background: ground,
        color: ink,
        fontFamily: componentTheme.fontSans,
        fontSize: s.font,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}
    >
      {monogramOf(repository)}
    </Box>
  );
});

/**
 * The mark of a version change in the monogram's slot: a neutral square with a
 * "v", never letters on a hashed colour, so a version field cannot be taken for
 * an image. Same sizes as {@link Monogram}.
 */
export const VersionGlyph = memo(function VersionGlyph({ size = 'sm' }: { size?: keyof typeof MONOGRAM_SIZE }) {
  const s = MONOGRAM_SIZE[size];
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        width: s.box,
        height: s.box,
        borderRadius: `${s.radius}px`,
        background: changeOrderSurface.inset,
        color: changeOrderInk.muted,
        fontFamily: componentTheme.fontMono,
        fontSize: s.font + 1,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      v
    </Box>
  );
});

/** The identity mark of an image change: its monogram, or the version glyph for a version change. */
export function ImageMark({ image, size = 'sm' }: { image: Pick<ImageChange, 'kind' | 'repository'>; size?: keyof typeof MONOGRAM_SIZE }) {
  return image.kind === 'version' ? <VersionGlyph size={size} /> : <Monogram repository={image.repository} size={size} />;
}

export interface RolePillProps {
  role: ContainerRole;
}

/** `init` or `sidecar`; nothing for an app container, because the config does not say "app". */
export function RolePill({ role }: RolePillProps) {
  if (role === null) return null;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline',
        marginLeft: '5px',
        padding: '0 5px',
        borderRadius: '3px',
        background: changeOrderSurface.inset,
        color: changeOrderInk.muted,
        fontSize: 10.5,
        fontWeight: 500,
        verticalAlign: '1px',
        whiteSpace: 'nowrap',
      }}
    >
      {role}
    </Box>
  );
}

export interface ImageTagProps {
  /** The image tag shown. */
  tag: string;
  /** `from` is the old image tag, struck and grey; `to` is the new one, with its changed part marked. */
  side: 'from' | 'to';
  /** The old image tag, which the new one is compared with to find its changed part. */
  previous?: string;
  bump: BumpKind;
  /** Font size in px. */
  size?: number;
}

/**
 * One image tag, in the mono face. The new image tag never shrinks; the caller
 * decides where the old one may be cut.
 */
export const ImageTag = memo(function ImageTag({ tag, side, previous, bump, size }: ImageTagProps) {
  if (side === 'from') {
    return (
      <Box
        component="span"
        title={tag}
        sx={{
          fontFamily: componentTheme.fontMono,
          fontSize: size ?? 12.5,
          color: changeOrderInk.subtle,
          textDecoration: 'line-through',
          textDecorationColor: 'rgba(100,107,120,.55)',
          whiteSpace: 'nowrap',
        }}
      >
        {tag}
      </Box>
    );
  }
  const tone = BUMP_TONE[bump];
  const { keep, changed } = previous === undefined ? { keep: '', changed: tag } : markDelta(previous, tag);
  return (
    <Box
      component="span"
      title={tag}
      sx={{
        flex: 'none',
        fontFamily: componentTheme.fontMono,
        fontSize: size ?? 14,
        fontWeight: 650,
        color: changeOrderInk.default,
        whiteSpace: 'nowrap',
      }}
    >
      {keep}
      {changed ? (
        <Box
          component="span"
          sx={{ color: tone.ink, background: tone.soft, borderRadius: '3px', padding: '0 2px', margin: '0 -1px' }}
        >
          {changed}
        </Box>
      ) : null}
    </Box>
  );
});

/** The arrow between two image tags. Decorative: the image tags around it carry the full move in `title`. */
export function TagArrow({ size = 13 }: { size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ flex: 'none', color: changeOrderInk.subtle, fontFamily: componentTheme.fontSans, fontSize: size }}
    >
      →
    </Box>
  );
}
