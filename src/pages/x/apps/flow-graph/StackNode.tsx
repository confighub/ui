// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeProps } from 'reactflow';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import type { StackNodeData } from './fold/foldNodes';
import { markStyle, stackToggleLabel, stripSummary } from './fold/markStyle';
import {
  NAMES_SEPARATOR,
  fitNamesPreview,
  moreFitsOnLine,
  moreLabel,
} from './fold/namePreview';

/**
 * The names line is 13.75 px so it is still 11 px on screen at the 80% zoom
 * floor, the smallest size that stays readable for names.
 */
const NAMES_FONT_SIZE = 13.75;
const NAMES_FONT = `500 ${NAMES_FONT_SIZE}px ${componentTheme.fontSans}`;
/** Card border (2 + 2) and padding (12 + 12), and a little room for the bolder "+N". */
const NAMES_INSET = 4 + 24 + 4;
/** The strip's width budget: marks grow to fill it, from 3 to 9 px each. */
const STRIP_BUDGET = 150;
const MARK_GAP = 2;
/** A pointer that moves further than this between press and release panned the canvas. */
const CLICK_SLOP = 4;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** The rendered width of `text` in the names font; an estimate where canvas is missing. */
function measureName(text: string): number {
  if (measureContext === undefined) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  if (!measureContext) return text.length * NAMES_FONT_SIZE * 0.55;
  measureContext.font = NAMES_FONT;
  return measureContext.measureText(text).width;
}

/**
 * Changes once the web fonts have loaded, so a preview measured with the
 * fallback font is measured again with Manrope, whose widths differ.
 */
function useFontsLoaded(): boolean {
  const [loaded, setLoaded] = useState(() => document.fonts?.status === 'loaded');
  useEffect(() => {
    if (loaded || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [loaded]);
  return loaded;
}

const markWidth = (count: number): number =>
  Math.max(
    3,
    Math.min(9, Math.floor((STRIP_BUDGET - (count - 1) * MARK_GAP) / Math.max(1, count))),
  );

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Root = styled(Box)({
  position: 'relative',
  fontFamily: componentTheme.fontSans,
});

/** A sheet under the card, so a stack reads as a pile of cards. */
const Sheet = styled(Box)({
  position: 'absolute',
  inset: 0,
  borderRadius: componentTheme.radiusMd,
  background: componentTheme.bgDefault,
  border: `1.5px solid ${componentTheme.borderDefault}`,
  pointerEvents: 'none',
});

const Card = styled(Box, {
  shouldForwardProp: (p) => p !== '$expanded',
})<{ $expanded: boolean }>(({ $expanded }) => ({
  position: 'relative',
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  padding: '8px 12px',
  borderRadius: componentTheme.radiusMd,
  border: `2px solid ${$expanded ? componentTheme.borderDefault : componentTheme.borderSubtle}`,
  background: $expanded ? componentTheme.bgSubtle : componentTheme.bgDefault,
  boxShadow: $expanded ? 'none' : componentTheme.shadowSm,
  cursor: 'pointer',
  transition: 'border-color 0.15s, box-shadow 0.2s',
  '&:hover': {
    borderColor: componentTheme.borderMuted,
    boxShadow: componentTheme.shadowMd,
  },
}));

const Head = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 20,
});

const Label = styled('span')({
  flex: 1,
  minWidth: 0,
  // About 11 px on screen at the 80% fit floor.
  fontSize: 14,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const CountBadge = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  padding: '0 8px',
  borderRadius: 999,
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  background: componentTheme.bgSubtle,
  border: `1px solid ${componentTheme.borderDefault}`,
  flexShrink: 0,
});

export const CaretButton = styled('button')({
  width: 22,
  height: 22,
  marginRight: -6,
  padding: 0,
  border: 0,
  borderRadius: 6,
  background: 'transparent',
  color: componentTheme.fgMuted,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 0.15s',
  '&:hover': { background: componentTheme.bgInset, color: componentTheme.fgDefault },
  '&:focus-visible': {
    outline: `2px solid ${componentTheme.accentFocusRing}`,
    outlineOffset: 1,
  },
  '& svg': { fontSize: 18 },
});

const StripRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 9,
  marginTop: 5,
});

const Strip = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: MARK_GAP,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
});

/** "+N more" when the names line has no room left for the count. */
const StripNote = styled('span')({
  fontFamily: componentTheme.fontMono,
  fontSize: 11,
  lineHeight: '9px',
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
});

const Mark = styled('i')({
  display: 'block',
  height: 8,
  borderRadius: 1.5,
  flex: '0 0 auto',
});

const Names = styled(Box)({
  marginTop: 5,
  height: 20,
  lineHeight: '20px',
  fontSize: NAMES_FONT_SIZE,
  fontWeight: 500,
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});

const More = styled('span')({
  color: componentTheme.fgSubtle,
  fontWeight: 600,
});

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * The quiet Deployments of one label value under one Base, as one card: the
 * value, how many, one strip mark per member, and as many whole names as fit.
 * A click anywhere on it opens it in place; the caret is the same action as a
 * real button, for the keyboard.
 */
export const StackNode = memo(({ data }: NodeProps<StackNodeData>) => {
  const {
    groupId,
    label,
    count,
    marks,
    previewNames,
    expanded,
    componentName,
    onToggle,
    width,
    height,
  } = data;
  const fontsLoaded = useFontsLoaded();
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const namesKey = previewNames.join('\u0000');
  const { preview, moreOnLine } = useMemo(
    () => {
      const maxWidth = width - NAMES_INSET;
      const p = fitNamesPreview(previewNames, maxWidth, measureName);
      return { preview: p, moreOnLine: moreFitsOnLine(p, maxWidth, measureName) };
    },
    // previewNames is rebuilt on every status poll; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namesKey, width, fontsLoaded],
  );
  const sheets = expanded ? 0 : count >= 6 ? 2 : count >= 2 ? 1 : 0;
  const mw = markWidth(marks.length);

  const handleClick = (e: React.MouseEvent) => {
    const down = pressedAt.current;
    pressedAt.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
    onToggle(groupId);
  };

  return (
    <Root sx={{ width, height }} data-testid={`flow-stack-${groupId}`}>
      {sheets >= 2 && <Sheet sx={{ transform: 'translateY(6px) scaleX(0.93)' }} />}
      {sheets >= 1 && <Sheet sx={{ transform: 'translateY(3px) scaleX(0.965)' }} />}
      <Card
        $expanded={expanded}
        onPointerDown={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={handleClick}
      >
        <Head>
          <Label title={label}>{label}</Label>
          <CountBadge>{count}</CountBadge>
          <CaretButton
            type='button'
            className='nodrag nopan'
            aria-label={stackToggleLabel(expanded, label, count, componentName)}
            aria-expanded={expanded}
            title={expanded ? 'Collapse' : 'Expand in place'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(groupId);
            }}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </CaretButton>
        </Head>
        <StripRow>
          <Strip role='img' aria-label={stripSummary(marks)}>
            {marks.map((kind, i) => (
              <Mark key={i} style={{ width: mw, ...markStyle(kind) }} />
            ))}
          </Strip>
          {!moreOnLine && <StripNote>+{preview.more} more</StripNote>}
        </StripRow>
        <Names title={previewNames.join(NAMES_SEPARATOR)}>
          {preview.shown.join(NAMES_SEPARATOR)}
          {preview.more > 0 && moreOnLine && <More>{moreLabel(preview.more)}</More>}
        </Names>
      </Card>
    </Root>
  );
});

StackNode.displayName = 'StackNode';
