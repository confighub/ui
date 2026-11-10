// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/*
 * The pragma pins React's JSX runtime and the MUI barrel import, with no icon package, keeps the
 * Node ES resolver from failing on a directory import: `changeOrderRefusals.tsx` imports this
 * file and a browser-free spec renders that one.
 */
/** @jsxImportSource react */

import { Fragment, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { Box, ButtonBase, InputBase, Link, Popover, Typography, type PopoverActions, type SxProps, type Theme } from '@mui/material';

import { plural } from '../changeOrderHistory';
import { spaceHref } from '../stage/stageLinks';
import {
  buttonName,
  capNames,
  defaultGroupKey,
  filterSpaces,
  groupChoices,
  groupChoiceText,
  groupHeaderText,
  groupSpaces,
  moreText,
  NAMES_SHOWN,
  OPEN_GROUPS_UP_TO,
  ROWS_SHOWN,
  sameInAllText,
  type ListedSpace,
} from './spaceListLogic';
import { SpaceLabelsContext } from './spaceLabelsContext';

const FOCUS_SX = { '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } } as const;

const LINK_SX = {
  color: 'text.secondary',
  font: 'inherit',
  overflowWrap: 'anywhere',
  textDecoration: 'none',
  '&:hover': { color: 'text.primary', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px', borderRadius: '2px' },
} as const;

const MONO_SX = { fontFamily: 'var(--font-mono)', fontSize: '11.5px' } as const;

/** The Spaces with their labels: the ones they carry, or those of the page's Space list. */
function useLabelled(spaces: readonly ListedSpace[]): ListedSpace[] {
  const labelsOf = useContext(SpaceLabelsContext);
  return useMemo(
    () => spaces.map((space) => (space.labels !== undefined || labelsOf === undefined ? space : { ...space, labels: labelsOf(space.spaceId) })),
    [spaces, labelsOf],
  );
}

function SpaceName({ space, link }: { space: ListedSpace; link: boolean }) {
  if (!link) return <>{space.name}</>;
  // A Space opens in a new tab, so the review on this page is kept.
  return (
    <Link component={RouterLink} to={space.href ?? spaceHref(space.spaceId)} target="_blank" rel="noopener noreferrer" sx={LINK_SX}>
      {space.name}
    </Link>
  );
}

const moreButtonSx = {
  font: 'inherit',
  fontSize: '11.5px',
  fontWeight: 600,
  color: 'text.secondary',
  verticalAlign: 'baseline',
  borderRadius: '3px',
  '&:hover': { color: 'text.primary' },
  ...FOCUS_SX,
} as const;

/** The names of a list, the first `ROWS_SHOWN` at once and the rest on request. */
function NameRows({ spaces, link }: { spaces: readonly ListedSpace[]; link: boolean }) {
  const [limit, setLimit] = useState(ROWS_SHOWN);
  const listRef = useRef<HTMLUListElement>(null);
  // Set when "Show more" is pressed: the button goes away with its last press, so focus moves to the first new row.
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    if (focusRow.current === null) return;
    const row = listRef.current?.children[focusRow.current];
    focusRow.current = null;
    (row?.querySelector('a') ?? (row as HTMLElement | undefined))?.focus();
  }, [limit]);
  const hidden = spaces.length - limit;
  return (
    <>
      <Box component="ul" ref={listRef} sx={{ m: 0, p: 0, listStyle: 'none', ...MONO_SX, lineHeight: 1.8 }}>
        {spaces.slice(0, limit).map((space) => (
          <li key={space.spaceId} tabIndex={-1}>
            <SpaceName space={space} link={link} />
          </li>
        ))}
      </Box>
      {hidden > 0 ? (
        <ButtonBase
          onClick={() => {
            focusRow.current = limit;
            setLimit((n) => n + ROWS_SHOWN);
          }}
          data-testid="space-list-show-more" sx={{ ...moreButtonSx, py: '4px' }}>
          Show {Math.min(hidden, ROWS_SHOWN)} more
        </ButtonBase>
      ) : null}
    </>
  );
}

/**
 * Every Space of a list: a box to filter by, a Group by choice, and the names in a
 * scroll area. Grouped, each group header is a button that opens its names.
 */
export function SpacesPanel({ spaces, link, noun = 'Space' }: { spaces: readonly ListedSpace[]; link: boolean; noun?: string }) {
  const id = useId();
  const ownFilterRef = useRef<HTMLInputElement | null>(null);
  // The popover's focus trap puts focus on the dialog when it mounts; the filter takes it at once, before the transition ends.
  useEffect(() => {
    ownFilterRef.current?.focus({ preventScroll: true });
  }, []);
  const choices = useMemo(() => groupChoices(spaces), [spaces]);
  // undefined: the person has not chosen, so the default stands.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const groupKey = chosen === undefined ? defaultGroupKey(choices) : choices.some((choice) => choice.key === chosen) ? chosen : null;
  const [query, setQuery] = useState('');
  // A group the person has flipped from how it began: open for a short list, closed for a long one.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  // The filter is deferred, so typing stays quick when the list is long.
  const deferredQuery = useDeferredValue(query);
  const matching = useMemo(() => filterSpaces(spaces, deferredQuery), [spaces, deferredQuery]);
  const groups = useMemo(() => groupSpaces(matching, groupKey), [matching, groupKey]);
  const filtering = deferredQuery.trim() !== '';
  const openAtFirst = spaces.length <= OPEN_GROUPS_UP_TO;
  const toggle = (groupId: string) =>
    setFlipped((current) => {
      const next = new Set(current);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', p: '12px', width: 'min(440px, calc(100vw - 32px))', boxSizing: 'border-box', flex: '1 1 auto', minHeight: 0 }}>
      <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <InputBase
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputRef={ownFilterRef}
          placeholder={`Filter ${noun}s`}
          inputProps={{ 'aria-label': `Filter ${noun}s`, 'data-testid': 'space-list-filter' }}
          sx={{ flex: '1 1 160px', px: '8px', py: '2px', fontSize: 13, border: '1px solid var(--bd1)', borderRadius: 'var(--r-sm)', '&.Mui-focused': { outline: '2px solid var(--rust)', outlineOffset: '1px' } }}
        />
        {choices.length > 0 ? (
          <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 12, color: 'text.secondary' }}>
            Group by
            <Box
              component="select"
              data-testid="space-list-group-by"
              value={groupKey ?? ''}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setChosen(event.target.value === '' ? null : event.target.value);
                setFlipped(new Set());
              }}
              sx={{ font: 'inherit', fontSize: 12, color: 'text.primary', border: '1px solid var(--bd1)', borderRadius: 'var(--r-sm)', bgcolor: 'background.paper', py: '3px' }}
            >
              <option value="">None</option>
              {choices.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {groupChoiceText(choice)}
                </option>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
      <Typography variant="caption" role="status" data-testid="space-list-count" sx={{ color: 'text.secondary', textTransform: 'none', letterSpacing: 0 }}>
        {filtering ? `${matching.length} of ${plural(spaces.length, noun)}` : plural(spaces.length, noun)}
      </Typography>
      <Box sx={{ maxHeight: 380, minHeight: 0, flex: '1 1 auto', overflowY: 'auto', display: 'grid', alignContent: 'start', gap: '2px' }} data-testid="space-list-scroll">
        {matching.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No {noun} matches.
          </Typography>
        ) : null}
        {groups.map((group) => {
          const names = <NameRows key={group.id} spaces={group.spaces} link={link} />;
          if (groupKey === null) return <Fragment key={group.id}>{names}</Fragment>;
          // A filter opens every group that has a match, so a match is never hidden.
          const open = filtering || openAtFirst !== flipped.has(group.id);
          const bodyId = `${id}-${group.id}`;
          return (
            <Box key={group.id}>
              <ButtonBase
                onClick={() => (filtering ? undefined : toggle(group.id))}
                aria-expanded={open}
                aria-controls={bodyId}
                // Not `disabled`: a disabled button leaves the tab order.
                aria-disabled={filtering || undefined}
                data-testid="space-list-group"
                sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', py: '4px', px: '4px', fontSize: 12.5, fontWeight: 600, textAlign: 'left', color: 'text.primary', borderRadius: '3px', '&:hover': { bgcolor: 'var(--bg-hover)' }, ...FOCUS_SX }}
              >
                {groupHeaderText(group)}
                <Box component="span" aria-hidden sx={{ fontSize: 12, transform: open ? 'rotate(180deg)' : 'none' }}>
                  ▾
                </Box>
              </ButtonBase>
              <Box id={bodyId} hidden={!open} sx={{ pl: '8px', pb: '4px' }}>
                {open ? names : null}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

interface SpacesMoreButtonProps {
  /** Every Space of the list, the ones shown in the sentence included. */
  spaces: readonly ListedSpace[];
  /** What the button says; "51 more" when left out. */
  children?: ReactNode;
  /** The names are plain text, not links. */
  plain?: boolean;
  /** How many names the sentence names before the button, for the default text. */
  shown?: number;
  /** The words of `children` when it is not a string, so the accessible name holds them. */
  visibleText?: string;
  /** Replaces the small bold trigger style, for a trigger that stands as a fact in a header. */
  buttonSx?: SxProps<Theme>;
  testId?: string;
  /** What the names are, for the button's accessible name and the panel; Space when left out. */
  noun?: string;
}

/** Room the panel has below the button, or above it when the button is near the bottom of the window. */
function placeFor(button: HTMLElement): { above: boolean; maxHeight: number } {
  const rect = button.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 20;
  const above = rect.top - 20;
  const isAbove = below < 260 && above > below;
  return { above: isAbove, maxHeight: Math.max(160, Math.min(480, isAbove ? above : below)) };
}

/** A button that opens the whole list of Spaces. Its accessible name says what it opens. */
export function SpacesMoreButton({ spaces, children, plain = false, shown = NAMES_SHOWN, visibleText, buttonSx, testId = 'space-list-more', noun = 'Space' }: SpacesMoreButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ above: boolean; maxHeight: number }>({ above: false, maxHeight: 480 });
  const popoverAction = useRef<PopoverActions>(null);
  const resizeWatch = useRef<ResizeObserver | null>(null);
  const panelId = useId();
  const labelled = useLabelled(spaces);
  const defaultText = moreText(Math.max(0, spaces.length - shown));
  return (
    <>
      <ButtonBase
        onClick={(event) => {
          setPlace(placeFor(event.currentTarget));
          setAnchor(event.currentTarget);
        }}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor !== null ? panelId : undefined}
        aria-label={buttonName(typeof children === 'string' ? children : children === undefined ? defaultText : visibleText, spaces.length, noun)}
        data-testid={testId}
        sx={buttonSx ?? moreButtonSx}
      >
        {children ?? defaultText}
      </ButtonBase>
      <Popover
        id={panelId}
        action={popoverAction}
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: place.above ? 'top' : 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: place.above ? 'bottom' : 'top', horizontal: 'left' }}
        // The filter takes focus when the panel mounts (see `SpacesPanel`), so nothing here moves focus later.
        slotProps={{
          transition: {
            onEntered: (node: HTMLElement) => {
              // The panel grows or shrinks as groups open and the choice changes; the popover is placed once, so it is placed again.
              resizeWatch.current = new ResizeObserver(() => popoverAction.current?.updatePosition());
              resizeWatch.current.observe(node);
            },
            onExited: () => {
              resizeWatch.current?.disconnect();
              resizeWatch.current = null;
            },
          },
          paper: {
            role: 'dialog',
            'aria-label': plural(spaces.length, noun),
            sx: { [place.above ? 'mb' : 'mt']: '4px', display: 'flex', flexDirection: 'column', maxHeight: place.maxHeight, border: '1px solid var(--bd1)', borderRadius: 'var(--r-sm)' },
          },
        }}
      >
        <SpacesPanel spaces={labelled} link={!plain} noun={noun} />
      </Popover>
    </>
  );
}

interface SpaceNameListProps {
  spaces: readonly ListedSpace[];
  limit?: number;
  /** The names are plain text, not links. */
  plain?: boolean;
  /** What the names are, when they are not Spaces. */
  noun?: string;
}

/** The first names of a list, comma separated, then "+51 more" as a button that opens them all. */
export function SpaceNameList({ spaces, limit = NAMES_SHOWN, plain = false, noun }: SpaceNameListProps) {
  const { shown, more } = capNames(spaces, limit);
  return (
    <Box component="span" data-testid="space-name-list" sx={{ ...MONO_SX, lineHeight: 1.8, color: 'text.secondary' }}>
      {shown.map((space, i) => (
        <Fragment key={space.spaceId}>
          {i > 0 ? ', ' : null}
          <SpaceName space={space} link={!plain} />
        </Fragment>
      ))}
      {more > 0 ? (
        <>
          {' '}
          <SpacesMoreButton spaces={spaces} plain={plain} shown={limit} noun={noun}>
            {`+${moreText(more)}`}
          </SpacesMoreButton>
        </>
      ) : null}
    </Box>
  );
}

/**
 * A group in which every Space took the same change, said as a count with the
 * names behind a button. A Space that differs is not in such a group: it keeps its
 * name in the group of its own outcome.
 */
export function SameInAllSpaces({ spaces, wholeStage = true }: { spaces: readonly ListedSpace[]; wholeStage?: boolean }) {
  return (
    <Box component="span" data-testid="space-same-in-all" sx={{ fontFamily: (theme) => theme.typography.fontFamily, fontSize: 12.5, color: 'text.secondary' }}>
      {sameInAllText(spaces.length, wholeStage)}{' '}
      <SpacesMoreButton spaces={spaces} visibleText="See the Spaces">
        <Box component="span" sx={{ textDecoration: 'underline', textUnderlineOffset: '3px', fontSize: 12.5 }}>
          See the Spaces
        </Box>
      </SpacesMoreButton>
    </Box>
  );
}

/** "+M more" under rows drawn in full: a click shows the rest in place, not in a popover. */
export function MoreRowsButton({ total, more, noun = 'Unit', onShow }: { total: number; more: number; noun?: string; onShow: () => void }) {
  if (more === 0) return null;
  return (
    <Box sx={{ p: '4px 12px' }}>
      <ButtonBase onClick={onShow} aria-label={buttonName(`+${moreText(more)}`, total, noun)} data-testid="rows-more" sx={moreButtonSx}>
        +{moreText(more)}
      </ButtonBase>
    </Box>
  );
}

/**
 * A list of names that have no ids (a caption "In dev, prod-eu"): three names, then a
 * button that opens them all, as plain text.
 */
export function NameList({ names, noun }: { names: readonly string[]; noun?: string }) {
  const spaces = useMemo(() => names.map((name, i) => ({ spaceId: `${i}:${name}`, name })), [names]);
  return <SpaceNameList spaces={spaces} plain noun={noun} />;
}
