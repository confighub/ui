// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, memo, useEffect, useLayoutEffect, useState } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import type { WaveCondition } from './fold/deploymentCondition';
import { FOLD_HEAD_LINE_H, FOLD_HEAD_PAD_TOP, FOLD_HEAD_ROW_GAP } from './fold/foldConstants';
import { HEADER_SEPARATOR, LINE_END, fitHeaderValues } from './fold/foldHeader';
import type { FoldFrameNodeData } from './fold/foldNodes';
import { WAVE_CHIP } from './fold/markStyle';
import { runningWaveLabel, waveActionLabel } from './fold/waveActions';

const Panel = styled(Box)({
  position: 'relative',
  boxSizing: 'border-box',
  borderRadius: 12,
  // A faint wash, not a card: the frame groups the stacks without competing
  // with them for attention.
  background: 'rgba(17,18,20,0.026)',
  border: `1px solid ${componentTheme.borderDefault}`,
  fontFamily: componentTheme.fontSans,
});

const HEADER_FONT_SIZE = 13;

const Header = styled(Box)({
  boxSizing: 'border-box',
  display: 'flex',
  padding: `${FOLD_HEAD_PAD_TOP}px 10px 0 12px`,
  overflow: 'hidden',
  fontSize: HEADER_FONT_SIZE,
  color: componentTheme.fgMuted,
  whiteSpace: 'nowrap',
});

/** The values the fold holds, on as many lines as the layout keeps room for. */
const Values = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minWidth: 0,
  overflow: 'hidden',
  lineHeight: `${FOLD_HEAD_LINE_H}px`,
  color: componentTheme.fgDefault,
});

/** The full list, read by assistive technology in place of the fitted lines. */
const ScreenReaderText = styled('span')({
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

const Separator = styled('span')({ color: componentTheme.fgSubtle });

const More = styled('span')({ color: componentTheme.fgMuted });

const Chips = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: `${FOLD_HEAD_ROW_GAP}px 10px`,
});

/** A pill around the wave chip; the bulk action for the wave sits in it too. */
const WavePill = styled('span')({
  display: 'inline-flex',
  flexShrink: 0,
  alignItems: 'center',
  gap: 2,
  padding: 2,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: 999,
});

const WaveChip = styled('span', {
  shouldForwardProp: (p) => p !== '$color' && p !== '$tint' && p !== '$ring',
})<{ $color: string; $tint: string; $ring: boolean }>(({ $color, $tint, $ring }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 22,
  padding: '0 8px',
  borderRadius: 999,
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  fontWeight: 600,
  color: $color,
  background: $tint,
  // Gated is a ring here too, so a wave reads the same as its chip on a card.
  boxShadow: $ring ? `inset 0 0 0 1.5px ${$color}` : undefined,
  '& svg': { width: 11, height: 11 },
}));

/** A wave's bulk action: an action, so it is in the accent, never a status tone. */
const WaveAction = styled('button')({
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 9px',
  border: 0,
  borderRadius: 999,
  background: 'transparent',
  fontFamily: componentTheme.fontSans,
  fontSize: 12.5,
  fontWeight: 600,
  color: componentTheme.accent,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
  '&:hover': { background: componentTheme.accentMuted },
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: 2 },
  '&:disabled': {
    color: componentTheme.fgMuted,
    background: 'transparent',
    cursor: 'default',
  },
});

const OverCap = styled('span')({
  flexShrink: 0,
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  color: componentTheme.attention,
});

const ArrowUpIcon = () => (
  <svg
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='2.5'
    aria-hidden='true'
  >
    <path d='M8 12V4M4 8l4-4 4 4' />
  </svg>
);

const LockIcon = () => (
  <svg
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='2'
    aria-hidden='true'
  >
    <rect x='4' y='7' width='8' height='6' rx='1' />
    <path d='M6 7V5a2 2 0 014 0v2' />
  </svg>
);

const WAVE_ICON: Record<WaveCondition, (() => React.JSX.Element) | null> = {
  stale: ArrowUpIcon,
  unreleased: null,
  gated: LockIcon,
};

/** Room kept free on each line, so a rounding in the browser cannot push a value out. */
const FIT_SLACK = 2;

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Widths by text; the fit measures the same line starts many times. */
const measured = new Map<string, number>();

/** The width of a text in the header font, as the browser draws it. */
function measureHeaderText(text: string): number {
  const known = measured.get(text);
  if (known !== undefined) return known;
  if (measureContext === undefined) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  let width: number;
  if (measureContext) {
    measureContext.font = `${HEADER_FONT_SIZE}px ${componentTheme.fontSans}`;
    width = measureContext.measureText(text).width;
  } else {
    // With no canvas, a width per character wider than any Manrope glyph at 13 px.
    width = text.length * 9;
  }
  measured.set(text, width);
  return width;
}

/**
 * The width the values get. It is measured, as the wave chips beside them
 * take what they need; until then the layout's estimate stands in.
 */
function useMeasuredWidth(element: HTMLElement | null, estimate: number): number {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return width ?? estimate;
}

/**
 * Fit again once the page's fonts have loaded: widths measured before then
 * are of a fallback font.
 */
function useRefitWhenFontsLoad(): void {
  const [, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      measured.clear();
      if (live) setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);
}

/**
 * The panel behind one Base's quiet Deployments. Its header lists the values
 * the stacks and loose cards hold, in their order, as many as fit on two
 * lines and then "+N more"; the tooltip has the full list. It names each wave
 * once ("Stale · 55"), so no card or strip has to repeat it. The one edge
 * from the Base lands on this panel instead of one edge per Deployment.
 */
export const FoldFrameNode = memo(({ data }: NodeProps<FoldFrameNodeData>) => {
  const {
    baseId,
    values,
    valuesTitle,
    valuesCountText,
    waves,
    overCapCount,
    onWaveAction,
    runningConditions,
    headerHeight,
    chipsBeside,
    valuesLines,
    valuesWidth,
    width,
    height,
  } = data;
  const [valuesElement, setValuesElement] = useState<HTMLDivElement | null>(null);
  const lineWidth = useMeasuredWidth(valuesElement, valuesWidth);
  useRefitWhenFontsLoad();
  const fit = fitHeaderValues(
    values,
    lineWidth - FIT_SLACK,
    measureHeaderText,
    valuesCountText,
    valuesLines,
  );
  const hasChips = waves.length > 0 || overCapCount > 0;
  return (
    <Panel sx={{ width, height }} data-testid={`flow-fold-${baseId}`}>
      <Handle
        type='target'
        position={Position.Left}
        isConnectable={false}
        // Where the fold edge lands: the header's middle, beside the values.
        style={{
          top: headerHeight / 2,
          left: 0,
          width: 1,
          height: 1,
          minWidth: 0,
          minHeight: 0,
          border: 0,
          background: 'transparent',
          opacity: 0,
        }}
      />
      <Header
        sx={{
          height: headerHeight,
          flexDirection: chipsBeside ? 'row' : 'column',
          alignItems: chipsBeside ? 'center' : 'stretch',
          gap: chipsBeside ? '10px' : `${FOLD_HEAD_ROW_GAP}px`,
        }}
      >
        <Values
          ref={setValuesElement}
          sx={{
            flex: chipsBeside ? '1 1 0' : 'none',
            height: valuesLines * FOLD_HEAD_LINE_H,
          }}
          title={valuesTitle || undefined}
          data-testid={`flow-fold-values-${baseId}`}
        >
          {valuesTitle && <ScreenReaderText>{valuesTitle}</ScreenReaderText>}
          {fit.lines.map((line, i) => {
            const lastLine = i === fit.lines.length - 1;
            return (
              <div key={i} aria-hidden='true' data-testid='flow-fold-header-line'>
                {line.items.map((item, j) => (
                  <Fragment key={j}>
                    {j > 0 && <Separator>{HEADER_SEPARATOR}</Separator>}
                    {fit.hidden > 0 && lastLine && j === line.items.length - 1 ? (
                      <More>{item}</More>
                    ) : (
                      item
                    )}
                  </Fragment>
                ))}
                {line.continues && <Separator>{LINE_END}</Separator>}
              </div>
            );
          })}
        </Values>
        {hasChips && (
          <Chips
            sx={{
              flex: 'none',
              flexWrap: chipsBeside ? 'nowrap' : 'wrap',
            }}
          >
            {waves.map(({ condition, count }) => {
              const chip = WAVE_CHIP[condition];
              const Icon = WAVE_ICON[condition];
              return (
                <WavePill key={condition} data-testid={`flow-fold-wave-${condition}`}>
                  <WaveChip $color={chip.color} $tint={chip.tint} $ring={chip.ring}>
                    {Icon && <Icon />}
                    {chip.label} · {count}
                  </WaveChip>
                  {onWaveAction && (
                    <WaveAction
                      type='button'
                      // A press on the button must not start a pan of the canvas.
                      className='nodrag nopan'
                      data-testid={`flow-fold-wave-action-${condition}`}
                      // A second run while one is in flight would publish or
                      // upgrade the same Spaces again.
                      disabled={runningConditions.includes(condition)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onWaveAction(baseId, condition);
                      }}
                    >
                      {runningConditions.includes(condition)
                        ? runningWaveLabel(condition)
                        : waveActionLabel(condition, count)}
                    </WaveAction>
                  )}
                </WavePill>
              );
            })}
            {overCapCount > 0 && (
              <OverCap>{overCapCount} over the card cap, marked in stacks</OverCap>
            )}
          </Chips>
        )}
      </Header>
    </Panel>
  );
});

FoldFrameNode.displayName = 'FoldFrameNode';
