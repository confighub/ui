// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import Tooltip from '@mui/material/Tooltip';

import { componentTheme } from '../componentTheme';
import { type LiveStatusProvider } from '../liveStatus';

/**
 * Small monochrome delivery-system marks shown immediately before a node's
 * live-status chips, so the card says WHICH system observed the cluster rather
 * than presenting the reading as ConfigHub's own.
 *
 * These are deliberately SIMPLIFIED marks, not the vendors' full logo path
 * data: at the ~14px they render at, the extra hundreds of points are invisible
 * and would only bloat the bundle. Each is drawn with `currentColor` only —
 * never the vendors' brand colors — and the wrapper renders them in muted
 * secondary text, because the status color must stay the dominant signal on
 * the card. The mark answers "who said so", quietly; the chip answers "what".
 */

/** ArgoCD — the octopus: domed head with two knocked-out eyes and three tentacles. */
const ArgoCDMark = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 1.5a7 7 0 017 7v1a7 7 0 01-14 0v-1a7 7 0 017-7zM9.3 6.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zm5.4 0a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z"
    />
    <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M7.5 15.8c.9 2 .8 4-.4 5.9" />
      <path d="M12 16.4c.6 1.9.6 3.7 0 5.4" />
      <path d="M16.5 15.8c-.9 2-.8 4 .4 5.9" />
    </g>
  </SvgIcon>
);

/** Flux — the reconciliation loop: three rotationally symmetric arcs around a hub. */
const FluxMark = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M13.3 4.61A7.5 7.5 0 0119.05 14.57" />
      <path d="M17.75 16.82A7.5 7.5 0 016.26 16.82" />
      <path d="M4.95 14.57A7.5 7.5 0 0110.7 4.61" />
    </g>
    <circle cx="12" cy="12" r="2.6" />
  </SvgIcon>
);

/**
 * Neither ArgoCD nor Flux — an EXPLICIT "we don't know who would report this"
 * mark, drawn as an open dashed ring. Deliberately not a blank: a missing glyph
 * would read as a rendering gap, while this reads as an unestablished source.
 */
const UnknownProviderMark = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <circle
      cx="12"
      cy="12"
      r="7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeDasharray="3 3"
    />
  </SvgIcon>
);

const MARK_BY_PROVIDER: Record<LiveStatusProvider, (props: SvgIconProps) => React.ReactElement> = {
  argocd: ArgoCDMark,
  flux: FluxMark,
  unknown: UnknownProviderMark,
};

const TOOLTIP_BY_PROVIDER: Record<LiveStatusProvider, string> = {
  argocd: 'Live status reported by ArgoCD',
  flux: 'Live status reported by Flux',
  unknown: 'Live status source not reported',
};

/**
 * The delivery-system mark that leads a node's live-status row. Always renders
 * something — an unrecognized provider gets the neutral mark and a tooltip
 * saying so, rather than silently disappearing and leaving the chips looking
 * like ConfigHub's own reading.
 */
export const LiveStatusProviderMark = ({ provider }: { provider: LiveStatusProvider }) => {
  const Mark = MARK_BY_PROVIDER[provider];
  return (
    <Tooltip title={TOOLTIP_BY_PROVIDER[provider]} placement="top">
      <Box
        component="span"
        className="nodrag nopan"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          color: componentTheme.fgSubtle,
        }}
      >
        <Mark sx={{ width: 14, height: 14 }} />
      </Box>
    </Tooltip>
  );
};
