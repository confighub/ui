// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useId, useMemo, useRef, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { alpha, styled } from '@mui/material/styles';

import { useContainerWidth } from '../../../../hooks/useContainerWidth';
import { componentTheme } from '../componentTheme';
import type { ComponentDeployment } from '../componentTypes';
import { type SearchHit, matchRange, searchDeployments } from './fold/canvasSearch';
import { GROUP_OFF } from './fold/foldConstants';
import {
  type FoldModel,
  buildFoldModel,
  countDrawnValues,
  countStacks,
} from './fold/foldModel';
import { type GroupByOption, drawnCountsText, groupByButtonLabel } from './fold/groupBy';
import { SEARCH_FULL_WIDTH, SEARCH_ICON_WIDTH, TOOLBAR_GAP, fitToolbar } from './toolbarFit';

const RESULTS_WIDTH = 360;
/** Below the toolbar row: where a search field folded to its icon opens. */
const BELOW_ROW = 38;

/**
 * Takes the room its parent row gives it, not the room its content asks
 * for. The row stops short of the Graph / Dashboard toggle, so its measured
 * width is the room left beside that toggle.
 */
const Bar = styled(Box)({
  display: 'flex',
  alignItems: 'flex-start',
  gap: TOOLBAR_GAP,
  flex: '1 1 0',
  minWidth: 0,
  fontFamily: componentTheme.fontSans,
  // The empty room right of the tools is canvas, not toolbar.
  pointerEvents: 'none',
  '& > *': { pointerEvents: 'auto' },
});

const SearchBox = styled(Box, {
  shouldForwardProp: (p) => p !== '$width',
})<{ $width: number }>(({ $width }) => ({
  position: 'relative',
  flex: 'none',
  width: $width,
}));

const noForward = (p: PropertyKey) => p !== '$collapsed' && p !== '$open';

const SearchField = styled(InputBase, { shouldForwardProp: noForward })<{
  $collapsed: boolean;
  $open: boolean;
}>(({ $collapsed, $open }) => ({
  boxSizing: 'border-box',
  width: '100%',
  height: 32,
  paddingLeft: 30,
  paddingRight: 8,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: componentTheme.radiusMd,
  background: componentTheme.bgDefault,
  boxShadow: componentTheme.shadowSm,
  fontFamily: componentTheme.fontSans,
  fontSize: 12.5,
  color: componentTheme.fgDefault,
  transition: 'border-color 0.15s',
  '&.Mui-focused': {
    borderColor: componentTheme.accent,
    outline: `2px solid ${componentTheme.accentFocusRing}`,
    outlineOffset: 1,
  },
  '& input': { padding: 0 },
  '& input::placeholder': { color: componentTheme.fgMuted, opacity: 1 },
  // Folded to its icon: a 32 px square the click focuses, which opens the
  // field below the row, where it has room.
  ...($collapsed &&
    !$open && { paddingLeft: SEARCH_ICON_WIDTH - 2, paddingRight: 0, cursor: 'pointer' }),
  ...($collapsed &&
    $open && {
      position: 'absolute',
      top: BELOW_ROW,
      left: 0,
      width: SEARCH_FULL_WIDTH,
      paddingLeft: 10,
      zIndex: 11,
    }),
}));

// Above the field: the field's own opaque background would hide it.
const SearchGlyph = styled(SearchIcon, {
  shouldForwardProp: (p) => p !== '$collapsed',
})<{ $collapsed: boolean }>(({ $collapsed }) => ({
  position: 'absolute',
  left: $collapsed ? (SEARCH_ICON_WIDTH - 16) / 2 : 9,
  top: 8,
  zIndex: 1,
  fontSize: 16,
  color: componentTheme.fgSubtle,
  pointerEvents: 'none',
}));

const Results = styled('ul', {
  shouldForwardProp: (p) => p !== '$below',
})<{ $below: boolean }>(({ $below }) => ({
  position: 'absolute',
  top: $below ? 2 * BELOW_ROW : BELOW_ROW,
  left: 0,
  width: RESULTS_WIDTH,
  maxWidth: 'calc(100vw - 32px)',
  padding: 6,
  margin: 0,
  listStyle: 'none',
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: componentTheme.radiusMd,
  boxShadow: componentTheme.shadowMd,
  zIndex: 10,
}));

const ResultRow = styled('li', {
  shouldForwardProp: (p) => p !== '$active',
})<{ $active: boolean }>(({ $active }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '7px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  background: $active ? componentTheme.bgInset : 'transparent',
  '&:hover': { background: componentTheme.bgInset },
}));

const ResultName = styled('span')({
  fontSize: 12.5,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  overflowWrap: 'anywhere',
  '& mark': {
    background: alpha(componentTheme.accent, 0.14),
    color: 'inherit',
    borderRadius: 2,
  },
});

const ResultWhere = styled('span')({
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  '& b': { fontWeight: 600 },
});

const ResultNote = styled('li')({
  padding: '6px 8px 2px',
  fontSize: 11.5,
  color: componentTheme.fgMuted,
});

const GroupButton = styled(ButtonBase)({
  flex: 'none',
  height: 32,
  padding: '0 10px',
  gap: 6,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: componentTheme.radiusMd,
  background: componentTheme.bgDefault,
  boxShadow: componentTheme.shadowSm,
  fontFamily: componentTheme.fontSans,
  fontSize: 12.5,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  whiteSpace: 'nowrap',
  transition: 'background-color 0.15s',
  '&:hover': { background: componentTheme.bgSubtle },
  '&.Mui-focusVisible': {
    outline: `2px solid ${componentTheme.accentFocusRing}`,
    outlineOffset: 2,
  },
  '& svg': { fontSize: 16, color: componentTheme.fgSubtle },
  '& .group-key': { fontWeight: 500, color: componentTheme.fgMuted },
});

const OptionItem = styled(MenuItem)({
  display: 'grid',
  gridTemplateColumns: '18px 1fr',
  columnGap: 8,
  alignItems: 'start',
  padding: 8,
  borderRadius: 6,
  whiteSpace: 'normal',
  fontFamily: componentTheme.fontSans,
  '&:hover, &.Mui-focusVisible': { background: componentTheme.bgInset },
  '&.Mui-selected, &.Mui-selected:hover': { background: componentTheme.bgInset },
  '& .check': { fontSize: 15, marginTop: 1, color: componentTheme.accent },
  '& .name': { fontSize: 12.5, fontWeight: 600, color: componentTheme.fgDefault },
  '& .default': { fontWeight: 500, color: componentTheme.fgMuted },
  '& .counts': {
    display: 'block',
    marginTop: 2,
    fontSize: 11,
    color: componentTheme.fgMuted,
  },
});

const MenuNote = styled('li')({
  padding: '4px 8px 4px 34px',
  fontSize: 11,
  color: componentTheme.fgMuted,
  listStyle: 'none',
});

/** "Base › stack", with the Base part bold so the eye finds the Base first. */
function WhereText({ where }: { where: string }) {
  const cut = where.indexOf(' › ');
  if (cut < 0) return <ResultWhere>{where}</ResultWhere>;
  return (
    <ResultWhere>
      <b>{where.slice(0, cut)}</b>
      {where.slice(cut)}
    </ResultWhere>
  );
}

function MarkedName({ name, query }: { name: string; query: string }) {
  const range = matchRange(name, query);
  if (!range) return <ResultName>{name}</ResultName>;
  const [start, end] = range;
  return (
    <ResultName>
      {name.slice(0, start)}
      <mark>{name.slice(start, end)}</mark>
      {name.slice(end)}
    </ResultName>
  );
}

export interface FlowCanvasToolbarProps {
  componentName: string;
  deployments: readonly ComponentDeployment[];
  /** The fold model on screen; null when the graph does not fold. */
  model: FoldModel | null;
  folding: boolean;
  groupKey: string | null;
  groupOptions: readonly GroupByOption[];
  /** A label key to fold by, or `off` for the unfolded layout. */
  onGroupChange: (key: string) => void;
  /** Jump to a Deployment: open its stack in place, select it, pan to it. */
  onReveal: (deploymentId: string) => void;
}

/**
 * The Auto graph's own tools: find a Deployment, and turn the fold on or off
 * or pick the label it groups its quiet Deployments by. There is deliberately no global "/"
 * shortcut: the page already has text fields, and a key that steals focus
 * from them costs more than it saves.
 */
export function FlowCanvasToolbar({
  componentName,
  deployments,
  model,
  folding,
  groupKey,
  groupOptions,
  onGroupChange,
  onReveal,
}: FlowCanvasToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const resultsId = useId();
  const menuId = useId();
  const { containerRef, width: room } = useContainerWidth();

  const result = useMemo(
    () => searchDeployments(query, deployments, model),
    [query, deployments, model],
  );
  const showResults = focused && query.trim() !== '';
  const active = Math.min(activeIndex, Math.max(0, result.hits.length - 1));

  // The stack counts are the reason to open the menu, so they are counted
  // only then; each needs a whole fold model.
  const menuOpen = menuAnchor !== null;
  // Values are counted from the same model as the stacks, so the menu says
  // what the canvas would draw, not how many values the Deployments hold.
  const drawnCounts = useMemo(() => {
    const counts = new Map<string, { values: number; stacks: number }>();
    if (!menuOpen) return counts;
    for (const option of groupOptions) {
      const drawn = buildFoldModel({ deployments, groupKey: option.key });
      counts.set(option.key, { values: countDrawnValues(drawn), stacks: countStacks(drawn) });
    }
    return counts;
  }, [menuOpen, groupOptions, deployments]);

  const reveal = (hit: SearchHit) => {
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.blur();
    onReveal(hit.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(active + 1, Math.max(0, result.hits.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = result.hits[active];
      if (hit) reveal(hit);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.blur();
    }
  };

  const optionId = (index: number) => `${resultsId}-option-${index}`;
  const groupLabel = groupByButtonLabel(folding, groupKey);
  const fit = fitToolbar(room > 0 ? room : null, groupLabel);
  const collapsed = fit.search === 'icon';
  const groupTip = fit.groupCompact ? `Group by: ${groupLabel}` : '';
  const pick = (key: string, checked: boolean) => {
    setMenuAnchor(null);
    if (!checked) onGroupChange(key);
  };

  return (
    <Bar ref={containerRef} data-testid='flow-canvas-toolbar'>
      <SearchBox $width={collapsed ? SEARCH_ICON_WIDTH : (fit.search as number)}>
        <SearchGlyph aria-hidden $collapsed={collapsed} />
        <SearchField
          $collapsed={collapsed}
          $open={focused}
          inputRef={inputRef}
          value={query}
          placeholder='Find a Deployment'
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          inputProps={{
            'aria-label': 'Find a Deployment',
            role: 'combobox',
            'aria-autocomplete': 'list',
            'aria-expanded': showResults,
            'aria-controls': resultsId,
            'aria-activedescendant':
              showResults && result.hits.length > 0 ? optionId(active) : undefined,
            autoComplete: 'off',
            spellCheck: false,
            'data-testid': 'flow-search-input',
          }}
        />
        {showResults && (
          <Results
            $below={collapsed}
            id={resultsId}
            role='listbox'
            aria-label='Deployments found'
            data-testid='flow-search-results'
          >
            {result.hits.map((hit, index) => (
              <ResultRow
                key={hit.id}
                id={optionId(index)}
                role='option'
                aria-selected={index === active}
                $active={index === active}
                // Keep the focus in the field, so the click lands before the
                // field's blur closes the list.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => reveal(hit)}
                data-testid={`flow-search-hit-${hit.id}`}
              >
                <MarkedName name={hit.name} query={query} />
                <WhereText where={hit.where} />
              </ResultRow>
            ))}
            {result.total === 0 && (
              <ResultNote role='presentation'>
                No Deployment in {componentName} matches &quot;{query.trim()}&quot;.
              </ResultNote>
            )}
            {result.total > result.hits.length && (
              <ResultNote role='presentation'>
                {result.total - result.hits.length} more. Type more of the name.
              </ResultNote>
            )}
          </Results>
        )}
      </SearchBox>

      <Tooltip title={groupTip} placement='bottom-start'>
        <span>
          <GroupButton
            aria-label={fit.groupCompact ? `Group by: ${groupLabel}` : undefined}
            aria-haspopup='menu'
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            data-testid='flow-group-by-button'
          >
            <LayersOutlinedIcon aria-hidden />
            {fit.groupCompact ? null : (
              <>
                <span className='group-key'>Group by</span>
                <span>{groupLabel}</span>
              </>
            )}
            <KeyboardArrowDownIcon aria-hidden />
          </GroupButton>
        </span>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              width: 300,
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusMd}px`,
              boxShadow: componentTheme.shadowMd,
            },
          },
        }}
        MenuListProps={{ 'aria-label': 'Group quiet Deployments by', sx: { p: 0.75 } }}
      >
        <OptionItem
          role='menuitemradio'
          aria-checked={!folding}
          selected={!folding}
          onClick={() => pick(GROUP_OFF, !folding)}
          data-testid='flow-group-by-option-off'
        >
          {folding ? <span /> : <CheckIcon className='check' aria-hidden />}
          <span>
            <span className='name'>Off</span>
            <span className='counts'>Every Deployment as a card</span>
          </span>
        </OptionItem>
        {groupOptions.length === 0 && (
          <MenuNote role='presentation'>No Space label splits these Deployments.</MenuNote>
        )}
        {groupOptions.map((option) => {
          const checked = folding && option.key === groupKey;
          const drawn = drawnCounts.get(option.key);
          return (
            <OptionItem
              key={option.key}
              role='menuitemradio'
              aria-checked={checked}
              selected={checked}
              onClick={() => pick(option.key, checked)}
              data-testid={`flow-group-by-option-${option.key}`}
            >
              {checked ? <CheckIcon className='check' aria-hidden /> : <span />}
              <span>
                <span className='name'>
                  {option.label}
                  {option.isDefault && <span className='default'> (default)</span>}
                </span>
                <span className='counts'>
                  {drawn
                    ? drawnCountsText(drawn.values, drawn.stacks)
                    : `${option.valueCount} values`}
                </span>
              </span>
            </OptionItem>
          );
        })}
      </Menu>
    </Bar>
  );
}
