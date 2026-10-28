// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One row of the ChangeOrder History card: a promote action (promotion, override,
 * failure, or a match of them), a Release publish, or a run of Releases.
 *
 * NO ID IS RENDERED (docs/solutions/ui-never-render-an-id.md). People are
 * names, "Automation" or "Unknown user"; Spaces are slugs, or "Unknown Space"
 * when the viewer's Space list does not hold one. IDs appear only in hrefs.
 */

import { useId, useState, type ReactNode } from 'react';

import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BlockIcon from '@mui/icons-material/Block';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import HistoryIcon from '@mui/icons-material/History';
import HourglassDisabledIcon from '@mui/icons-material/HourglassDisabled';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

import type {
  ChangeOrderPromotionFailureLink,
  ChangeOrderPromotionFailureSpace,
  ChangeOrderPromotionFailureUnit,
} from '@confighub/rtk-query';

import {
  FAILURE_ACTION_LABEL,
  FAILURE_RECORDED_ITEMS,
  REACH_TEXT,
  clockTime,
  failureSpaceHeadline,
  fullTime,
  isCutError,
  isLongError,
  overrideReach,
  plural,
  shortDate,
  splitFailureItems,
  utcTime,
  zoneName,
  type HistoryActionEntry,
  type HistoryPerson,
  type HistoryReleaseEntry,
  type HistoryReviewEntry,
  type HistoryRow,
  type OverrideReach,
  type ReleaseRun,
} from '../changeOrderHistory';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { reviewInitials } from '../reviews/changeOrderReviews';

/** Avatar fills for people, chosen by a hash of the UserID. Each carries white initials at AA. */
/** The mockup's own break: below it, two-column rows stack. The theme's breakpoints sit far wider. */
const WIDE = '@media (min-width: 1100px)';

const AVATAR_COLORS = ['#2f5d9e', '#7a4a9c', '#1f7a6d', '#a2512a', '#55708f', '#8a3f5f'];

const UNKNOWN_USER_HINT = "This account was removed, or you cannot see it. ConfigHub still keeps what it did.";

/** Shown Spaces before "+N more Spaces". */
const SPACES_SHOWN = 6;
/** Shown Unit, or Link, errors before "Show N more". */
const ITEMS_SHOWN = 3;

function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** The same initials as the review panel: "rv-bot (Service Account)" is "RB". */
const initials = reviewInitials;

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

const linkButtonSx = {
  fontFamily: 'inherit',
  fontSize: changeOrderType.size.small,
  color: changeOrderAction.ink,
  textDecoration: 'underline',
  textDecorationColor: changeOrderAction.line,
  '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 2, borderRadius: '3px' },
} as const;

export function LinkButton({
  children,
  onClick,
  expanded,
  controls,
}: {
  children: ReactNode;
  onClick: () => void;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <ButtonBase
      disableRipple
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      sx={linkButtonSx}
    >
      {children}
    </ButtonBase>
  );
}

export function PersonAvatar({ person, size = 20 }: { person: HistoryPerson; size?: number }) {
  const base = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.47),
    fontWeight: changeOrderType.weight.bold,
    flex: '0 0 auto',
  };
  if (person.kind === 'automation') {
    return (
      <Avatar aria-hidden sx={{ ...base, bgcolor: changeOrderSurface.inset, color: changeOrderInk.muted }}>
        <SmartToyOutlinedIcon sx={{ fontSize: Math.round(size * 0.65) }} />
      </Avatar>
    );
  }
  if (person.kind === 'unknown' || person.kind === 'none' || person.kind === 'loading') {
    return (
      <Avatar
        aria-hidden
        sx={{
          ...base,
          bgcolor: changeOrderSurface.card,
          color: changeOrderInk.subtle,
          border: `1px dashed ${changeOrderBorder.strong}`,
        }}
      >
        {person.kind === 'none' ? (
          <HistoryIcon sx={{ fontSize: Math.round(size * 0.65) }} />
        ) : person.kind === 'loading' ? (
          '…'
        ) : (
          '?'
        )}
      </Avatar>
    );
  }
  return (
    <Avatar aria-hidden src={person.pictureUrl} sx={{ ...base, bgcolor: avatarColor(person.colorSeed), color: '#fff' }}>
      {initials(person.name)}
    </Avatar>
  );
}

function Marker({ children, tone }: { children: ReactNode; tone: 'you' | 'auto' }) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 9.5,
        fontWeight: changeOrderType.weight.bold,
        letterSpacing: '.04em',
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '1px 4px',
        color: tone === 'you' ? changeOrderAction.ink : changeOrderInk.muted,
        background: tone === 'you' ? changeOrderAction.soft : changeOrderSurface.inset,
      }}
    >
      {children}
    </Box>
  );
}

export function Who({ person }: { person: HistoryPerson }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} data-history-person={person.kind}>
      <PersonAvatar person={person} />
      {person.kind === 'unknown' ? (
        <Box
          component="b"
          tabIndex={0}
          title={UNKNOWN_USER_HINT}
          sx={{
            fontWeight: changeOrderType.weight.semibold,
            fontStyle: 'italic',
            color: changeOrderInk.muted,
            borderBottom: `1px dotted ${changeOrderInk.subtle}`,
            cursor: 'help',
          }}
        >
          Unknown user
        </Box>
      ) : person.kind === 'loading' ? (
        <Box component="span" sx={{ color: changeOrderInk.subtle }}>
          {person.name}
        </Box>
      ) : (
        <Box component="b" sx={{ fontWeight: changeOrderType.weight.semibold }}>
          {person.name}
        </Box>
      )}
      {person.isYou ? <Marker tone="you">You</Marker> : null}
      {person.kind === 'automation' ? <Marker tone="auto">Auto</Marker> : null}
    </Box>
  );
}

export function StageName({ stage }: { stage: string | undefined }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: changeOrderFontMono,
        fontSize: changeOrderType.size.small,
        fontWeight: changeOrderType.weight.semibold,
        border: `1px solid ${changeOrderBorder.strong}`,
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '0 5px',
        background: changeOrderSurface.card,
        color: stage ? changeOrderInk.default : changeOrderInk.muted,
      }}
    >
      {stage || 'no Stage'}
    </Box>
  );
}

type SpaceTone = 'plain' | 'ok' | 'bad' | 'none';

const SPACE_TONE: Record<SpaceTone, { border: string; background: string; icon: string }> = {
  plain: { border: changeOrderBorder.default, background: changeOrderSurface.sunk, icon: changeOrderInk.subtle },
  ok: { border: changeOrderStatus.successLine, background: changeOrderStatus.successGround, icon: changeOrderStatus.success },
  bad: { border: changeOrderStatus.dangerLine, background: changeOrderStatus.dangerSoft, icon: changeOrderStatus.danger },
  none: { border: changeOrderBorder.strong, background: changeOrderSurface.card, icon: changeOrderInk.subtle },
};

export function SpaceChip({
  spaceId,
  slug,
  tone = 'plain',
  Icon,
}: {
  spaceId?: string;
  slug: string | undefined;
  tone?: SpaceTone;
  Icon?: SvgIconComponent;
}) {
  const t = SPACE_TONE[tone];
  const sx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: changeOrderFontMono,
    fontSize: changeOrderType.size.small,
    background: t.background,
    border: `1px ${tone === 'none' ? 'dashed' : 'solid'} ${t.border}`,
    borderRadius: `${changeOrderShape.radius.sm}px`,
    padding: '1px 6px',
    color: slug ? changeOrderInk.default : changeOrderInk.muted,
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  } as const;
  const content = (
    <>
      {Icon ? <Icon aria-hidden sx={{ fontSize: 13, color: t.icon }} /> : null}
      {slug || 'Unknown Space'}
    </>
  );
  if (spaceId === undefined) {
    return (
      <Box component="span" sx={sx}>
        {content}
      </Box>
    );
  }
  return (
    <Box component="a" href={`/spaces/${spaceId}`} target="_blank" rel="noopener noreferrer" sx={sx} data-history-space={slug ?? ''}>
      {content}
    </Box>
  );
}

function KindTag({ children, tone }: { children: ReactNode; tone: 'override' | 'failure' }) {
  const fg = tone === 'override' ? changeOrderStatus.warn : changeOrderStatus.danger;
  const bg = tone === 'override' ? changeOrderStatus.warnSoft : changeOrderStatus.dangerSoft;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: changeOrderType.size.micro,
        fontWeight: changeOrderType.weight.strong,
        letterSpacing: '.05em',
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '1px 6px',
        border: `1px solid ${fg}`,
        color: fg,
        background: bg,
      }}
    >
      {children}
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        fontSize: changeOrderType.size.micro,
        letterSpacing: '.07em',
        color: changeOrderInk.subtle,
        marginBottom: '5px',
        fontWeight: changeOrderType.weight.semibold,
      }}
    >
      {children}
    </Box>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        fontSize: changeOrderType.size.small,
        color: changeOrderInk.muted,
        marginTop: '8px',
        display: 'flex',
        gap: '6px',
        alignItems: 'flex-start',
      }}
    >
      <InfoOutlinedIcon aria-hidden sx={{ fontSize: 15, color: changeOrderInk.subtle, marginTop: '1px' }} />
      <span>{children}</span>
    </Box>
  );
}

function SpaceList({
  spaceIds,
  spaceSlugById,
  tone,
  Icon,
}: {
  spaceIds: readonly string[];
  spaceSlugById: ReadonlyMap<string, string>;
  tone?: SpaceTone;
  Icon?: SvgIconComponent;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? spaceIds : spaceIds.slice(0, SPACES_SHOWN);
  return (
    <>
      {shown.map((spaceId) => (
        <SpaceChip key={spaceId} spaceId={spaceId} slug={spaceSlugById.get(spaceId)} tone={tone} Icon={Icon} />
      ))}
      {spaceIds.length > SPACES_SHOWN ? (
        <LinkButton onClick={() => setAll((v) => !v)} expanded={all}>
          {all ? 'Show fewer' : `+${spaceIds.length - SPACES_SHOWN} more Spaces`}
        </LinkButton>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function ErrorText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = isLongError(text);
  const cut = isCutError(text);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component="pre"
        id={id}
        data-history-error
        sx={{
          fontFamily: changeOrderFontMono,
          fontSize: changeOrderType.size.small,
          color: changeOrderInk.default,
          lineHeight: changeOrderType.lineHeight.loose,
          margin: 0,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...(long && !open
            ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : {}),
        }}
      >
        {text}
      </Box>
      {long ? (
        <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
          <LinkButton onClick={() => setOpen((v) => !v)} expanded={open} controls={id}>
            {open ? 'Show less' : 'Show full error'}
          </LinkButton>
          {cut ? (
            <Box component="span" sx={{ fontSize: changeOrderType.size.micro, color: changeOrderInk.subtle }}>
              ConfigHub cut this error at 2048 characters.
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

const errListSx = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.md}px`,
  overflow: 'hidden',
  '& > li': {
    padding: '7px 10px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr)',
    [WIDE]: { gridTemplateColumns: 'minmax(0, 210px) minmax(0, 1fr)' },
    gap: '4px 12px',
    alignItems: 'start',
  },
  '& > li + li': { borderTop: `1px solid ${changeOrderSurface.inset}` },
} as const;

function FailureItemList({
  label,
  noun,
  items,
  hrefFor,
}: {
  label: string;
  noun: 'Unit' | 'Link';
  items: readonly (ChangeOrderPromotionFailureUnit | ChangeOrderPromotionFailureLink)[] | undefined;
  hrefFor: (item: ChangeOrderPromotionFailureUnit | ChangeOrderPromotionFailureLink) => string | undefined;
}) {
  const [all, setAll] = useState(false);
  const { recorded, overflow } = splitFailureItems(items);
  if (recorded.length === 0 && !overflow) return null;
  const shown = all ? recorded : recorded.slice(0, ITEMS_SHOWN);
  const count = overflow ? `${FAILURE_RECORDED_ITEMS} recorded, more failed` : String(recorded.length);
  return (
    <Box>
      <SectionLabel>
        {label} · {count}
      </SectionLabel>
      <Box component="ul" sx={errListSx} aria-label={label}>
        {shown.map((item, index) => {
          const href = hrefFor(item);
          return (
            <li key={`${item.Slug ?? ''}-${index}`}>
              <Box sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, overflowWrap: 'anywhere' }}>
                {href ? (
                  <Box
                    component="a"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: changeOrderBorder.strong }}
                  >
                    {item.Slug}
                  </Box>
                ) : (
                  item.Slug || `Unnamed ${noun}`
                )}
              </Box>
              <ErrorText text={item.Error ?? 'No error was recorded.'} />
            </li>
          );
        })}
        {recorded.length > ITEMS_SHOWN ? (
          <Box component="li" sx={{ gridTemplateColumns: '1fr !important', justifyItems: 'start' }}>
            <LinkButton onClick={() => setAll((v) => !v)} expanded={all}>
              {all ? `Show fewer ${noun}s` : `Show ${recorded.length - ITEMS_SHOWN} more recorded ${noun}s`}
            </LinkButton>
          </Box>
        ) : null}
        {overflow ? (
          <Box
            component="li"
            data-history-overflow
            sx={{
              gridTemplateColumns: '1fr !important',
              background: changeOrderSurface.sunk,
              color: changeOrderInk.muted,
              fontSize: changeOrderType.size.small,
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <MoreHorizIcon aria-hidden sx={{ fontSize: 15, color: changeOrderInk.subtle }} />
              More {noun}s failed than are recorded. ConfigHub keeps the first {FAILURE_RECORDED_ITEMS} {noun} errors
              for each Space; open the Space to see every {noun}.
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const ACTION_TONE: Record<string, { Icon: SvgIconComponent; fg: string; border: string; bg: string }> = {
  Failed: { Icon: BlockIcon, fg: changeOrderStatus.danger, border: changeOrderStatus.dangerLine, bg: changeOrderStatus.dangerSoft },
  Blocked: { Icon: HourglassDisabledIcon, fg: changeOrderStatus.warn, border: changeOrderStatus.warnLine, bg: changeOrderStatus.warnSoft },
  Promote: { Icon: ErrorOutlineIcon, fg: changeOrderStatus.danger, border: changeOrderStatus.dangerLine, bg: changeOrderSurface.card },
};

function FailureSpace({ space }: { space: ChangeOrderPromotionFailureSpace }) {
  const tone = ACTION_TONE[space.Action ?? ''] ?? ACTION_TONE.Failed;
  const label = FAILURE_ACTION_LABEL[space.Action ?? ''] ?? (space.Action || 'Not completed');
  return (
    <Box
      data-history-failure-space={space.SpaceSlug ?? ''}
      data-action={space.Action ?? ''}
      sx={{ padding: '10px 12px', '& + &': { borderTop: `1px solid ${changeOrderSurface.inset}` } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: changeOrderType.size.small,
            fontWeight: changeOrderType.weight.semibold,
            borderRadius: `${changeOrderShape.radius.sm}px`,
            padding: '1px 6px',
            border: `1px solid ${tone.border}`,
            color: tone.fg,
            background: tone.bg,
          }}
        >
          <tone.Icon aria-hidden sx={{ fontSize: 14 }} />
          {label}
        </Box>
        <SpaceChip spaceId={space.SpaceID} slug={space.SpaceSlug} />
        <Box component="span" data-history-headline sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
          {failureSpaceHeadline(space)}
        </Box>
      </Box>
      <Box sx={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
        {space.Error ? (
          <Box>
            <SectionLabel>Error</SectionLabel>
            <ErrorText text={space.Error} />
          </Box>
        ) : null}
        <FailureItemList
          label="Unit errors"
          noun="Unit"
          items={space.Units}
          hrefFor={(item) => {
            const unitId = (item as ChangeOrderPromotionFailureUnit).UnitID;
            return unitId && space.SpaceID ? `/units/${space.SpaceID}/${unitId}` : undefined;
          }}
        />
        <FailureItemList label="Link errors" noun="Link" items={space.Links} hrefFor={() => undefined} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry frame
// ---------------------------------------------------------------------------

type EntryTone = 'promotion' | 'override' | 'failure' | 'release' | 'opened' | 'reviewWait' | 'reviewVoid';

const ENTRY_TONE: Record<EntryTone, { fg: string; border: string; bg: string; edge?: string }> = {
  promotion: { fg: changeOrderStatus.success, border: changeOrderStatus.successLine, bg: changeOrderStatus.successGround },
  override: { fg: changeOrderStatus.warn, border: changeOrderStatus.warnLine, bg: changeOrderStatus.warnSoft, edge: changeOrderStatus.warn },
  failure: { fg: changeOrderStatus.danger, border: changeOrderStatus.dangerLine, bg: changeOrderStatus.dangerSoft, edge: changeOrderStatus.danger },
  release: { fg: changeOrderStatus.progress, border: changeOrderStatus.progressLine, bg: changeOrderStatus.progressSoft },
  opened: { fg: changeOrderInk.subtle, border: changeOrderBorder.default, bg: changeOrderSurface.sunk },
  reviewWait: { fg: changeOrderStatus.warn, border: changeOrderStatus.warnLine, bg: changeOrderStatus.warnSoft },
  reviewVoid: { fg: changeOrderInk.subtle, border: changeOrderBorder.strong, bg: changeOrderSurface.inset },
};

function EntryFrame({
  tone,
  Icon,
  label,
  at,
  children,
  dataKind,
}: {
  tone: EntryTone;
  Icon: SvgIconComponent;
  label: string;
  at: number;
  children: ReactNode;
  dataKind: string;
}) {
  const t = ENTRY_TONE[tone];
  return (
    <Box
      component="li"
      aria-label={label}
      data-history-entry={dataKind}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '28px minmax(0,1fr) 48px',
        gap: '0 10px',
        padding: '10px 16px',
        borderTop: `1px solid ${changeOrderSurface.inset}`,
        // The day's thread: one hairline through the centre of the icon column, under the tiles.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 30,
          top: 0,
          bottom: 0,
          width: '1px',
          background: changeOrderBorder.default,
        },
        [WIDE]: {
          gridTemplateColumns: '28px minmax(0,1fr) 64px',
          gap: '0 12px',
          padding: '10px 20px',
          '&::before': { left: 34 },
        },
        ...(t.edge
          ? {
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${changeOrderShape.leadingEdge}px`,
                background: t.edge,
              },
            }
          : {}),
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 28,
          height: 28,
          borderRadius: `${changeOrderShape.radius.lg}px`,
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${t.border}`,
          background: t.bg,
          color: t.fg,
        }}
      >
        <Icon sx={{ fontSize: 17 }} />
      </Box>
      <Box sx={{ minWidth: 0, paddingTop: '3px' }}>{children}</Box>
      <Tooltip title={utcTime(at)} describeChild placement="bottom-end">
        <Box
          component="time"
          dateTime={new Date(at).toISOString()}
          sx={{
            fontFamily: changeOrderFontMono,
            fontSize: changeOrderType.size.small,
            color: changeOrderInk.subtle,
            textAlign: 'right',
            paddingTop: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          {clockTime(at)}
        </Box>
      </Tooltip>
    </Box>
  );
}

const headSx = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  flexWrap: 'wrap',
  fontSize: changeOrderType.size.prose,
  lineHeight: changeOrderType.lineHeight.body,
} as const;

const metaSx = { marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' } as const;

const detailSx = {
  marginTop: '8px',
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.lg}px`,
  background: changeOrderSurface.card,
  overflow: 'hidden',
} as const;

const sectionSx = {
  padding: '10px 12px',
  '& + &': { borderTop: `1px solid ${changeOrderSurface.inset}` },
} as const;

function Disclosure({
  open,
  onToggle,
  controls,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  children: ReactNode;
}) {
  return (
    <ButtonBase
      disableRipple
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      sx={{
        ...linkButtonSx,
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        marginTop: '6px',
      }}
    >
      <ChevronRightIcon
        aria-hidden
        sx={{
          fontSize: 18,
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .18s cubic-bezier(.16,1,.3,1)',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />
      {children}
    </ButtonBase>
  );
}

// ---------------------------------------------------------------------------
// Promote actions
// ---------------------------------------------------------------------------

const REACH_STYLE: Record<OverrideReach, { tone: SpaceTone; Icon: SvgIconComponent; StateIcon: SvgIconComponent; fg: string }> = {
  written: { tone: 'ok', Icon: CheckIcon, StateIcon: CheckCircleOutlineIcon, fg: changeOrderStatus.success },
  failed: { tone: 'bad', Icon: CloseIcon, StateIcon: ErrorOutlineIcon, fg: changeOrderStatus.danger },
  'no-record': { tone: 'none', Icon: HelpOutlineIcon, StateIcon: HelpOutlineIcon, fg: changeOrderInk.muted },
};

function actionLabel(action: HistoryActionEntry): string {
  const stage = action.stage || 'no Stage';
  const who = action.person.name;
  if (action.override) return `Override by ${who} into ${stage}, ${fullTime(action.at)}`;
  if (action.failure) return `Promotion with failures by ${who} into ${stage}, ${fullTime(action.at)}`;
  return `Promotion by ${who} into ${stage}, ${fullTime(action.at)}`;
}

function ActionEntry({
  action,
  spaceSlugById,
  defaultOpen,
}: {
  action: HistoryActionEntry;
  spaceSlugById: ReadonlyMap<string, string>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detailId = useId();
  const written = action.promotion?.SpaceIDs ?? [];
  const failedSpaces = action.failure?.Spaces ?? [];

  let tone: EntryTone;
  let Icon: SvgIconComponent;
  let head: ReactNode;
  let meta: ReactNode = null;
  let detail: ReactNode = null;
  let disclose = '';

  if (action.override) {
    const override = action.override;
    const gates = override.FailedGates ?? [];
    const reach = overrideReach(action);
    const writtenCount = reach.filter((row) => row.reach === 'written').length;
    tone = 'override';
    Icon = BoltIcon;
    disclose = 'Reason, failing gates and outcome';
    head = (
      <>
        <Who person={action.person} />
        <span>forced a promotion into</span>
        <StageName stage={action.stage} />
        <span>past {plural(gates.length, 'failing gate')}</span>
        <KindTag tone="override">Override</KindTag>
      </>
    );
    meta = (
      <Box component="span" sx={{ color: changeOrderInk.muted, fontSize: changeOrderType.size.body }}>
        {writtenCount} of {plural(reach.length, 'listed Space')} written
      </Box>
    );
    detail = (
      <>
        <Box sx={sectionSx}>
          <SectionLabel>Reason, as written by {action.person.kind === 'person' ? action.person.name : action.person.name.toLowerCase()}</SectionLabel>
          <Box
            component="blockquote"
            data-history-reason
            sx={{
              margin: 0,
              padding: '8px 12px',
              borderLeft: `${changeOrderShape.leadingEdge}px solid ${changeOrderStatus.warnLine}`,
              background: changeOrderSurface.sunk,
              borderRadius: '0 6px 6px 0',
              fontSize: changeOrderType.size.prose,
              color: changeOrderInk.default,
              whiteSpace: 'pre-wrap',
            }}
          >
            {override.Reason || 'No reason was recorded.'}
          </Box>
        </Box>
        <Box sx={sectionSx}>
          <SectionLabel>Gates that were failing</SectionLabel>
          <Box component="ul" sx={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
            {gates.map((gate, index) => (
              <Box component="li" key={index} sx={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: changeOrderType.size.body }}>
                <LockOpenOutlinedIcon aria-hidden sx={{ fontSize: 15, color: changeOrderStatus.warn, marginTop: '1px' }} />
                <span>{gate}</span>
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={sectionSx}>
          <SectionLabel>Spaces listed in the override</SectionLabel>
          <Box sx={{ display: 'grid', gap: '4px' }}>
            {reach.map((row) => {
              const style = REACH_STYLE[row.reach];
              return (
                <Box
                  key={row.spaceId}
                  data-history-reach={row.reach}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr)',
                    gap: 0,
                    [WIDE]: { gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)', gap: '10px' },
                    alignItems: 'center',
                    fontSize: changeOrderType.size.body,
                  }}
                >
                  <Box>
                    <SpaceChip spaceId={row.spaceId} slug={spaceSlugById.get(row.spaceId)} tone={style.tone} Icon={style.Icon} />
                  </Box>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: style.fg }}>
                    <style.StateIcon aria-hidden sx={{ fontSize: 15 }} />
                    {REACH_TEXT[row.reach]}
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Note>
            Recorded before the write, so a listed Space may not have the change.
          </Note>
        </Box>
        {failedSpaces.length > 0 ? (
          <Box>
            <Box sx={{ padding: '10px 12px 0' }}>
              <SectionLabel>Spaces with failures</SectionLabel>
            </Box>
            {failedSpaces.map((space, index) => (
              <FailureSpace key={`${space.SpaceID ?? ''}-${index}`} space={space} />
            ))}
          </Box>
        ) : null}
      </>
    );
  } else if (action.failure) {
    tone = 'failure';
    Icon = ErrorOutlineIcon;
    disclose = 'Space, Unit and Link errors';
    head = (
      <>
        <Who person={action.person} />
        {/*
          Two sentences: what was promoted into the Stage, then how many Spaces
          had failures. "Promoted" only for Spaces the promotion record lists
          as written; a Space with Action Promote can be partly written, which
          its own headline in the detail says.
        */}
        <span data-history-sentence>
          {written.length > 0
            ? `promoted ${plural(written.length, 'Space')} into`
            : `ran a promotion of ${plural(failedSpaces.length, 'Space')} into`}
        </span>
        {/* The full stop sits on the Stage tag, so the row's gap does not part them. */}
        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
          <StageName stage={action.stage} />.
        </Box>
        <span data-history-sentence>
          {written.length > 0
            ? `${failedSpaces.length} more had failures.`
            : failedSpaces.length === 1
              ? 'It had failures.'
              : `${failedSpaces.length} had failures.`}
        </span>
        <KindTag tone="failure">Failures</KindTag>
      </>
    );
    meta = (
      <>
        {written.length > 0 ? <SpaceList spaceIds={written} spaceSlugById={spaceSlugById} tone="ok" Icon={CheckIcon} /> : null}
        {failedSpaces.map((space, index) => (
          <SpaceChip key={`${space.SpaceID ?? ''}-${index}`} spaceId={space.SpaceID} slug={space.SpaceSlug} tone="bad" Icon={CloseIcon} />
        ))}
      </>
    );
    detail = failedSpaces.map((space, index) => <FailureSpace key={`${space.SpaceID ?? ''}-${index}`} space={space} />);
  } else {
    tone = 'promotion';
    Icon = KeyboardDoubleArrowRightIcon;
    head = (
      <>
        <Who person={action.person} />
        <span>promoted {plural(written.length, 'Space')} into</span>
        <StageName stage={action.stage} />
      </>
    );
    meta = <SpaceList spaceIds={written} spaceSlugById={spaceSlugById} />;
  }

  return (
    <EntryFrame tone={tone} Icon={Icon} label={actionLabel(action)} at={action.at} dataKind={tone}>
      <Box sx={headSx}>{head}</Box>
      {meta ? <Box sx={metaSx}>{meta}</Box> : null}
      {detail ? (
        <>
          <Disclosure open={open} onToggle={() => setOpen((v) => !v)} controls={detailId}>
            {open ? 'Hide details' : disclose}
          </Disclosure>
          <Box id={detailId} hidden={!open} sx={open ? detailSx : undefined} data-history-detail>
            {open ? detail : null}
          </Box>
        </>
      ) : null}
    </EntryFrame>
  );
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

function ReleaseName({ num }: { num: number | undefined }) {
  return (
    <Box component="b" sx={{ fontWeight: changeOrderType.weight.semibold }}>
      {num === undefined ? 'a Release' : `rel-${num}`}
    </Box>
  );
}

function ReleaseEntry({ entry }: { entry: HistoryReleaseEntry }) {
  const r = entry.release;
  const space = <SpaceChip spaceId={r.SpaceID} slug={r.SpaceSlug} />;
  const name = r.ReleaseNum === undefined ? 'A Release' : `Release rel-${r.ReleaseNum}`;
  const label =
    entry.person.kind === 'none'
      ? `${name} published to ${r.SpaceSlug ?? 'an unknown Space'}, publisher not recorded, ${fullTime(entry.at)}`
      : `${name} published to ${r.SpaceSlug ?? 'an unknown Space'} by ${entry.person.name}, ${fullTime(entry.at)}`;
  return (
    <EntryFrame tone="release" Icon={Inventory2OutlinedIcon} label={label} at={entry.at} dataKind="release">
      <Box sx={headSx}>
        {entry.person.kind === 'none' ? (
          <>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} data-history-person="none">
              <PersonAvatar person={entry.person} />
              <ReleaseName num={r.ReleaseNum} />
            </Box>
            <span>published to</span>
            {space}
            <Box component="span" sx={{ color: changeOrderInk.subtle }}>
              Publisher not recorded
            </Box>
          </>
        ) : (
          <>
            <Who person={entry.person} />
            <span>published</span>
            <ReleaseName num={r.ReleaseNum} />
            <span>to</span>
            {space}
          </>
        )}
      </Box>
    </EntryFrame>
  );
}

function ReleaseRunEntry({ run }: { run: ReleaseRun }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const first = run.items[run.items.length - 1].at;
  const last = run.items[0].at;
  const stages = [...new Set(run.items.map((item) => item.stage).filter((s): s is string => s !== undefined))];
  const spaceCount = new Set(run.items.map((item) => item.release.SpaceID ?? item.release.SpaceSlug)).size;
  const who = run.person.kind === 'none' ? 'an unrecorded publisher' : run.person.name;
  return (
    <EntryFrame
      tone="release"
      Icon={Inventory2OutlinedIcon}
      label={`${run.items.length} Releases published by ${who} between ${clockTime(first)} and ${clockTime(last)} ${zoneName(last)}`}
      at={last}
      dataKind="release-run"
    >
      <Box sx={headSx}>
        {run.person.kind === 'none' ? (
          <>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PersonAvatar person={run.person} />
              <b>{run.items.length} Releases</b>
            </Box>
            <span>published, publisher not recorded,</span>
          </>
        ) : (
          <>
            <Who person={run.person} />
            <span>published</span>
            <b>{run.items.length} Releases</b>
          </>
        )}
        <span>to {plural(spaceCount, 'Space')}{stages.length > 0 ? ' in' : ''}</span>
        {stages.map((stage) => (
          <StageName key={stage} stage={stage} />
        ))}
        <Box component="span" sx={{ color: changeOrderInk.subtle }}>
          {clockTime(first)} to {clockTime(last)}
        </Box>
      </Box>
      <Disclosure open={open} onToggle={() => setOpen((v) => !v)} controls={detailId}>
        {open ? 'Hide Releases' : 'Show each Release'}
      </Disclosure>
      <Box id={detailId} hidden={!open} sx={open ? detailSx : undefined}>
        {open ? (
          <Box sx={sectionSx}>
            <Box component="ul" sx={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '2px' }}>
              {run.items.map((item) => (
                <Box
                  component="li"
                  key={item.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '70px minmax(0,1fr) 54px',
                    gap: '8px',
                    alignItems: 'center',
                    fontSize: changeOrderType.size.body,
                  }}
                >
                  <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.semibold }}>
                    {item.release.ReleaseNum === undefined ? '—' : `rel-${item.release.ReleaseNum}`}
                  </Box>
                  <span>
                    <SpaceChip spaceId={item.release.SpaceID} slug={item.release.SpaceSlug} />
                  </span>
                  <Tooltip title={utcTime(item.at)} describeChild placement="bottom-end">
                    <Box
                      component="time"
                      dateTime={new Date(item.at).toISOString()}
                      sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.subtle, textAlign: 'right', fontSize: changeOrderType.size.small }}
                    >
                      {clockTime(item.at)}
                    </Box>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </EntryFrame>
  );
}

// ---------------------------------------------------------------------------
// Review events
// ---------------------------------------------------------------------------

type ReviewTagTone = 'ok' | 'bad' | 'idle' | 'warn';

const REVIEW_TAG_TONE: Record<ReviewTagTone, { fg: string; bg: string }> = {
  ok: { fg: changeOrderStatus.success, bg: changeOrderStatus.successGround },
  bad: { fg: changeOrderStatus.danger, bg: changeOrderStatus.dangerSoft },
  idle: { fg: changeOrderInk.muted, bg: changeOrderSurface.inset },
  warn: { fg: changeOrderStatus.warn, bg: changeOrderStatus.warnSoft },
};

function ReviewKindTag({ tone, children }: { tone: ReviewTagTone; children: ReactNode }) {
  const t = REVIEW_TAG_TONE[tone];
  return (
    <Box
      component="span"
      data-review-tag
      sx={{
        fontSize: changeOrderType.size.micro,
        fontWeight: changeOrderType.weight.bold,
        letterSpacing: '.03em',
        textTransform: 'uppercase',
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '1px 6px',
        color: t.fg,
        background: t.bg,
      }}
    >
      {children}
    </Box>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body }}>
      {children}
    </Box>
  );
}

function MonoList({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={name}>
          {i > 0 ? ', ' : ''}
          <Mono>{name}</Mono>
        </span>
      ))}
    </>
  );
}

/**
 * One review event: an approval, a rejection, a revocation, an approval that
 * expired, or the moment a stage started to wait on review.
 */
/** "the gate to prod", "the release in staging", "sign-off": one gate a review counts toward. */
function gateName(gate: { kind: HistoryReviewEntry['gateKind']; stage: string }): string {
  if (gate.kind === 'release') return `the release in ${gate.stage}`;
  if (gate.kind === 'final') return 'sign-off';
  return `the gate to ${gate.stage}`;
}

/** "a", "a and b", "a, b and c". */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Every gate the review counts toward, in words. */
function gatesText(entry: HistoryReviewEntry): string {
  const gates = entry.gates ?? [{ kind: entry.gateKind, stage: entry.stage }];
  return andList(gates.map(gateName));
}

/** Where the decision was made, when not on this ChangeOrder. */
const ORIGIN_TEXT: Record<'other' | 'none', string> = {
  other: 'Made on another ChangeOrder',
  none: 'Made outside a ChangeOrder',
};

/**
 * The stage whose change was reviewed: "approved staging". What it counts toward
 * ("For the gate to prod") is in the tooltip. Without a reviewed stage (an older
 * entry), the gate alone.
 */
function ReviewTarget({ entry }: { entry: HistoryReviewEntry }) {
  if (entry.reviewedStage === undefined) {
    return <span>for {gatesText(entry)}</span>;
  }
  const gates = `For ${gatesText(entry)}`;
  return (
    <Tooltip title={gates}>
      <Box component="span" data-history-gates={gates} sx={{ display: 'inline-flex' }}>
        <StageName stage={entry.reviewedStage} />
      </Box>
    </Tooltip>
  );
}

function gateText(entry: HistoryReviewEntry): string {
  if (entry.reviewedStage === undefined) return `for ${gatesText(entry)}`;
  return `${entry.reviewedStage}, for ${gatesText(entry)}`;
}

function ReviewEntry({ entry }: { entry: HistoryReviewEntry }) {
  let tone: EntryTone = 'promotion';
  let Icon: SvgIconComponent = CheckIcon;
  let tag: ReactNode;
  let head: ReactNode;
  let label = '';
  const who = entry.person.name;
  const satisfied = entry.satisfiedRequirementNames ?? [];
  const target = <ReviewTarget entry={entry} />;
  switch (entry.reviewKind) {
    case 'approved':
      tag = <ReviewKindTag tone="ok">Approved</ReviewKindTag>;
      label = `${who} approved ${gateText(entry)}, ${fullTime(entry.at)}`;
      head = (
        <>
          <Who person={entry.person} />
          <span>approved</span>
          {target}
          {satisfied.length > 0 ? (
            <span>
              <MonoList names={satisfied} /> satisfied
            </span>
          ) : (
            <span>
              on <MonoList names={entry.requirementNames} />
              {entry.revisionCount !== undefined ? `, ${plural(entry.revisionCount, 'Revision')}` : ''}
            </span>
          )}
        </>
      );
      break;
    case 'rejected':
      // A rejection blocks only where a requirement does not ignore rejections (S4).
      tone = entry.blocksPromotion === true ? 'failure' : 'reviewVoid';
      Icon = BlockIcon;
      tag = <ReviewKindTag tone="bad">Rejected</ReviewKindTag>;
      label = `${who} rejected ${gateText(entry)}, ${fullTime(entry.at)}`;
      head = (
        <>
          <Who person={entry.person} />
          <span>rejected</span>
          {target}
          <span>
            on <MonoList names={entry.requirementNames} />
            {entry.blocksPromotion === true ? `. ${entry.gateKind === 'release' ? 'Release' : 'Promotion'} blocked` : '. Rejections do not block here'}
          </span>
        </>
      );
      break;
    case 'revoked': {
      // The revoker, who can be a manager of the Space rather than the attester (S2).
      tone = 'reviewVoid';
      Icon = UndoIcon;
      tag = <ReviewKindTag tone="idle">Revoked</ReviewKindTag>;
      const original = entry.originalPerson;
      const ownDecision = original === undefined || original.key === entry.person.key;
      label = ownDecision
        ? `${who} revoked a decision ${gateText(entry)}, ${fullTime(entry.at)}`
        : `${who} revoked a decision by ${original.name} ${gateText(entry)}, ${fullTime(entry.at)}`;
      const from = entry.replacesAt !== undefined ? ` from ${shortDateTime(entry.replacesAt)}` : '';
      head = (
        <>
          <Who person={entry.person} />
          {ownDecision ? (
            <span>revoked their decision{from}</span>
          ) : (
            <>
              <span>revoked</span>
              <Box component="span" data-history-original sx={{ display: 'inline-flex', alignItems: 'center' }}>
                <Who person={original} />’s
              </Box>
              <span>decision{from}</span>
            </>
          )}
          {target}
        </>
      );
      break;
    }
    case 'expired':
      tone = 'reviewVoid';
      Icon = AccessTimeIcon;
      tag = <ReviewKindTag tone="idle">Expired</ReviewKindTag>;
      label = `An approval by ${who} ${gateText(entry)} expired, ${fullTime(entry.at)}`;
      head = (
        <>
          {/* One flex item, so the row's gap does not split the name from its ’s. */}
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <Who person={entry.person} />’s
          </Box>
          <span>approval</span>
          {target}
          {/* Expiry is per requirement (S3): name the ones it no longer counts for. */}
          <span>
            expired for <MonoList names={entry.requirementNames} />
          </span>
        </>
      );
      break;
    case 'requested': {
      // A real ChangeOrder.ReviewRequest (#5788): who asked whom, and for which stage.
      tone = 'reviewWait';
      Icon = PersonOutlineOutlinedIcon;
      tag = <ReviewKindTag tone="warn">Review</ReviewKindTag>;
      const asked = entry.requestedOf;
      label = `${who} asked ${asked?.name ?? 'someone'} to review ${gateText(entry)}, ${fullTime(entry.at)}`;
      head = (
        <>
          {entry.person.kind === 'none' ? <span>Review requested</span> : (
            <>
              <Who person={entry.person} />
              <span>asked</span>
            </>
          )}
          {asked !== undefined ? <Who person={asked} /> : null}
          <span>to review</span>
          {target}
        </>
      );
      break;
    }
  }
  return (
    <EntryFrame tone={tone} Icon={Icon} label={label} at={entry.at} dataKind={`review-${entry.reviewKind}`}>
      <Box sx={headSx}>
        {tag}
        {head}
      </Box>
      {entry.origin !== undefined ? (
        <Box
          data-testid="history-review-origin"
          sx={{ marginTop: '2px', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}
        >
          {ORIGIN_TEXT[entry.origin]}
        </Box>
      ) : null}
      {entry.note !== undefined && entry.note !== '' ? (
        <Box
          component="q"
          sx={{
            display: 'block',
            marginTop: '3px',
            fontSize: changeOrderType.size.body,
            color: changeOrderInk.muted,
            overflowWrap: 'anywhere',
            quotes: '"\\201C" "\\201D"',
          }}
        >
          {entry.note}
        </Box>
      ) : null}
    </EntryFrame>
  );
}

/** `13 Oct, 16:02`: the page's own date order, from `shortDate`, without the year. */
function shortDateTime(at: number): string {
  return `${shortDate(at).replace(/ \d{4}$/, '')}, ${clockTime(at)}`;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function HistoryRowView({
  row,
  spaceSlugById,
  defaultOpen,
}: {
  row: HistoryRow;
  spaceSlugById: ReadonlyMap<string, string>;
  /** Overrides and failures in the newest days open with their detail showing. */
  defaultOpen: boolean;
}) {
  if (row.kind === 'action') return <ActionEntry action={row} spaceSlugById={spaceSlugById} defaultOpen={defaultOpen} />;
  if (row.kind === 'release') return <ReleaseEntry entry={row} />;
  if (row.kind === 'review') return <ReviewEntry entry={row} />;
  return <ReleaseRunEntry run={row} />;
}

export function ChangeOrderOpenedEntry({ at }: { at: number }) {
  return (
    <EntryFrame tone="opened" Icon={FlagOutlinedIcon} label={`ChangeOrder opened, ${fullTime(at)}`} at={at} dataKind="opened">
      <Box sx={headSx}>
        <b>ChangeOrder opened</b>
      </Box>
    </EntryFrame>
  );
}
