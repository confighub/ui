// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The parts of a detail page's summary card: the card itself, a state chip, and
 * the term/value facts beneath the title. Shared by the ChangeOrder and
 * ChangeSet pages.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { SvgIconComponent } from '@mui/icons-material';

import { clockTime, shortDate, utcTime, zoneName } from '../changeOrderHistory';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

/**
 * The summary at the top of a detail page, as a card on the page's ground: every
 * major region of these pages shares one border, radius and shadow.
 */
export function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      role="region"
      aria-label={label}
      sx={{
        background: changeOrderSurface.card,
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
        boxShadow: changeOrderCardTokens.shadow,
        // Clips a top band's corners to the card's radius. `clip`, not `hidden`: it creates no scroll container.
        overflow: 'clip',
      }}
    >
      {children}
    </Box>
  );
}

export function StateChip({ label, tone }: { label: string; tone: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        border: `1px solid ${tone}`,
        color: tone,
        padding: '2px 10px',
        fontSize: changeOrderType.size.small,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}

/**
 * A fact's value, as a link to somewhere else in the product. New tab,
 * deliberately: a detail page is a stopping point in its own right (a URL
 * people come back to, poll, share), and navigating away in place would
 * discard it, as `ChangeOrderUnitHeader`'s unit-detail link also reasons.
 */
export function FactLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: changeOrderBorder.strong }}
    >
      {children}
    </Box>
  );
}

/**
 * One term/value pair in the header's fact grid. `icon` sits before the term,
 * in the term's ink; it is decorative (the term names the fact), so it stays
 * out of the accessibility tree.
 */
export function Fact({
  term,
  icon: Icon,
  children,
  wide = false,
}: {
  term: string;
  icon?: SvgIconComponent;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: wide ? 'span 2' : undefined }}>
      <Box
        component="dt"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: changeOrderType.size.micro,
          letterSpacing: '.07em',
          color: changeOrderInk.subtle,
          margin: 0,
        }}
      >
        {Icon !== undefined ? <Icon aria-hidden="true" sx={{ fontSize: 14, flex: '0 0 auto' }} /> : null}
        {term}
      </Box>
      <Box
        component="dd"
        sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.default, margin: 0, overflowWrap: 'anywhere' }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * The Opened fact, in the viewer's time zone with the zone named, as the History
 * card writes its times. Hover gives UTC, readable and then verbatim as the
 * server sent it. No weekday, so it fits its column on one line. A value that
 * does not parse is shown as it came, rather than as "Invalid Date".
 */
export function OpenedAt({ value }: { value: string | undefined }) {
  if (value === undefined) return <>—</>;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return <>{value}</>;
  const utc = (
    <>
      <div>{utcTime(at)}</div>
      <div>{value}</div>
    </>
  );
  return (
    <Tooltip title={utc} describeChild placement="bottom-start">
      <Box component="time" dateTime={value}>
        {`${shortDate(at)}, ${clockTime(at)} ${zoneName(at)}`}
      </Box>
    </Tooltip>
  );
}
