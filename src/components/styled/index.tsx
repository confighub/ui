// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { useCallback, useRef, useState } from 'react';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Accordion from '@mui/material/Accordion';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import Grid from '@mui/material/Grid2';
import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, css, keyframes, styled } from '@mui/material/styles';
import { Stack } from '@mui/system';
import { DataGrid, gridClasses } from '@mui/x-data-grid';

import { Direction, TransitionMapType } from '../../types/enums';

export const slideLeft = keyframes`
  from {
    margin-left: 100%;
  }

  to {
    margin-left: 0%;
  }
`;

export const slideRight = keyframes`
  from {
    margin-left: -100%;
  }

  to {
    margin-left: 0%;
  }
`;

export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const TransitionMap: TransitionMapType = {
  [Direction.Left]: slideLeft,
  [Direction.Right]: slideRight,
  [Direction.Up]: slideLeft,
  [Direction.Down]: slideRight,
  [Direction.FadeIn]: fadeIn,
};

export const Aside = styled('aside')<{
  $showBorder?: boolean;
}>`
  display: flex;
  flex-direction: column;
  width: 25%;
  padding: 0 1rem;
  border-right: ${({ $showBorder }) =>
    $showBorder ? '1px solid rgba(224, 224, 224, 1)' : 'none'};

  border-top-left: ${({ $showBorder }) =>
    $showBorder ? '1px solid rgba(224, 224, 224, 1)' : 'none'};

  border-bottom-left: ${({ $showBorder }) =>
    $showBorder ? '1px solid rgba(224, 224, 224, 1)' : 'none'};

  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
  overflow-y: auto;

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 5px;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: white;
    border-radius: 10px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
`;

// TODO: Section component
export const Section = styled('div')<{
  $direction: Direction;
  $display: boolean;
  $width?: string;
}>`
  width: ${({ $width }) => $width || '100%'};
  display: ${({ $display }) => ($display ? 'block' : 'none')};
  ${(props) =>
    props.$direction &&
    css`
      animation: ${TransitionMap[props.$direction]} 0.5s;
    `};

  // @media (max-width: 1350px) {
  //   width: ${({ $width }) => $width || '100%'};
  // }
`;

export const FadeIn = styled(Grid)`
  opacity: 0;
  transform: translateY(-20px);
  animation: slideDownFadeIn 1s forwards;
  @keyframes slideDownFadeIn {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

export const FullScreenDialog = styled(Dialog)`
  .MuiDialog-paperFullScreen {
    width: 100%;
    height: 100%;
  }
`;

// NOTE: name is now historical — the outer border was dropped to match
// the data-grid panes. Kept under the same name so the many call sites
// don't churn; rename to something like `SurfaceAccordion` if/when we do
// a styling pass.
export const BorderedAccordion = styled(Accordion)<{
  variant?: 'filled' | 'standard' | 'outlined';
}>`
  border: 0;
  background-color: ${({ variant = '' }) =>
    variant === 'filled' ? 'rgba(0, 0, 0, 0.06)' : 'white'};

  &.MuiAccordion-root {
    border-radius: 0;
  }

  /* The accordions are used as static "always expanded" panes — kill the
     hover/focus tint that would otherwise suggest the summary is clickable.
     MUI default Mui-focusVisible paints palette.action.focus and the browser
     draws an outline; both are unwanted here. */
  & .MuiAccordionSummary-root:hover,
  & .MuiAccordionSummary-root.Mui-focusVisible,
  & .MuiAccordionSummary-root:focus-visible,
  & .MuiAccordionSummary-root:focus {
    background-color: transparent;
    outline: none;
  }
`;

export const AccordionHeader = styled('div')`
  margin-left: 10px;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

export const DetailsContainer = styled('div')`
  width: 100%;
  display: flex;
  flex-direction: column;
`;

export const CenteredTableCell = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
`;

export const Ellipses = styled(Typography)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SpaceSeparator = styled(ChevronRightIcon)(({ theme }) => ({
  fontSize: 10,
  color: theme.palette.text.disabled,
  flexShrink: 0,
}));

// Styled Card Component
export const HoverCard = styled(Card, {
  shouldForwardProp: (prop) => prop !== '$enableHover',
})<{ $enableHover?: boolean }>(({ theme, $enableHover = false }) => ({
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  borderRadius: '8px',
  border: '1px solid',
  borderColor: theme.palette.divider,
  transition: $enableHover ? 'all 0.2s ease-in-out' : 'none',
  cursor: $enableHover ? 'pointer' : 'default',
  ...($enableHover && {
    '&:hover': {
      borderColor: theme.palette.primary.main,
      boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
      transform: 'translateY(-1px)',
    },
  }),
}));

// Section Card Component with Header
interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  badge?: string | number;
  action?: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  children,
  badge,
  action,
}) => {
  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
        overflow: 'hidden',
        mb: 1,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'grey.50',
        }}
      >
        <Stack direction='row' width='100%' alignItems='center' justifyContent='space-between'>
          <Typography variant='caption' fontWeight={600} color='text.secondary'>
            {title.toUpperCase()}
            {badge !== undefined && (
              <Chip
                label={badge}
                size='small'
                sx={{
                  ml: 1,
                  height: '16px',
                  fontSize: '0.65rem',
                  backgroundColor: 'grey.300',
                }}
              />
            )}
          </Typography>
          {action}
        </Stack>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
};

// Hairline-style StripedDataGrid — matches the canonical copy in
// `components/entity-data-grid/EntityDataGrid.tsx`. Keep both in sync until
// MutationTable, LinksTable, UnitEventsTable, UnitDownstreamTable, and
// FunctionsTable are migrated onto EntityDataGrid and this export can be removed.
export const StripedDataGrid = styled(DataGrid)(({ theme }) => ({
  borderRadius: 0,
  border: 0,
  '--DataGrid-containerBackground': theme.palette.background.paper,

  // ── Column headers — hairline: 10.5px uppercase, muted, thin underline ───
  [`& .${gridClasses.columnHeaders}`]: {
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  [`& .${gridClasses.columnHeader}`]: {
    backgroundColor: theme.palette.background.paper,
    '&:focus, &:focus-within': { outline: 'none' },
  },
  [`& .${gridClasses.columnHeaderTitle}`]: {
    fontSize: '10.5px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: theme.palette.text.disabled,
    lineHeight: 'normal',
  },
  [`& .${gridClasses.columnSeparator}`]: {
    color: theme.palette.divider,
    '&:hover': { color: theme.palette.text.disabled },
    '&.MuiDataGrid-columnSeparator--resizing': { color: theme.palette.text.secondary },
  },

  // ── Cells — near-invisible row divider ───────────────────────────────────
  [`& .${gridClasses.cell}`]: {
    borderColor: 'rgba(0,0,0,0.045)',
    '&:focus, &:focus-within': { outline: 'none' },
  },
  [`& .${gridClasses.cell} .MuiTypography-body1`]: {
    fontSize: '0.875rem',
    lineHeight: 1.43,
    letterSpacing: '0.01071em',
  },

  // ── Rows ─────────────────────────────────────────────────────────────────
  [`& .${gridClasses.row}`]: {
    backgroundColor: theme.palette.background.paper,
    '&:hover': {
      backgroundColor: 'rgba(0,0,0,0.018)',
      '@media (hover: none)': { backgroundColor: 'transparent' },
    },
    '&.Mui-selected': {
      backgroundColor: 'var(--rust-bg)',
      boxShadow: 'inset 3px 0 0 var(--rust)',
      '&:hover': {
        backgroundColor: 'var(--rust-bg)',
        '@media (hover: none)': { backgroundColor: 'var(--rust-bg)' },
      },
    },
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  [`& .${gridClasses.footerContainer}`]: {
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    minHeight: 40,
  },
}));

export const Form = styled('form')`
  width: 75%;
`;

export const CardGrid = styled('div')<{ $gridWidth: string }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, ${({ $gridWidth }) => $gridWidth});
  gap: 20px;
`;

export interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

export const ServerErrorBox = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'display',
})<{ $display: boolean }>(({ theme, $display }) => ({
  border: `1px solid ${theme.palette.error.main}`,
  backgroundColor: alpha(theme.palette.error.main, 0.1),
  borderRadius: '8px',
  padding: theme.spacing(0.4),
  color: theme.palette.error.dark,
  display: $display ? 'flex' : 'none',
  justifyContent: 'space-between',
  alignItems: 'center',
  animation: `${fadeIn} 0.3s ease-in`,
  /* Scrollbar styling */
  '::-webkit-scrollbar': {
    width: '5px',
  },
  '::-webkit-scrollbar-track': {
    background: alpha(theme.palette.error.main, 0.05),
    borderRadius: '8px',
  },
  '::-webkit-scrollbar-thumb': {
    background: alpha(theme.palette.error.main, 0.3),
    borderRadius: '8px',
  },
  '::-webkit-scrollbar-thumb:hover': {
    background: alpha(theme.palette.error.main, 0.5),
  },
}));

export const ExpandMore = styled((props: ExpandMoreProps) => {
  const { ...other } = props;
  return <IconButton {...other} />;
})(({ theme }) => ({
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
  variants: [
    {
      props: ({ expand }) => !expand,
      style: {
        transform: 'rotate(0deg)',
      },
    },
    {
      props: ({ expand }) => !!expand,
      style: {
        transform: 'rotate(180deg)',
      },
    },
  ],
}));

export const EmptyIconBubble = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 56,
  height: 56,
  borderRadius: '50%',
  backgroundColor: alpha(theme.palette.primary.main, 0.08),
  color: theme.palette.primary.main,
  marginBottom: theme.spacing(0.5),
}));

export const Main = styled('main')`
  background-color: rgb(249, 250, 251);
`;

// Fixed Submit Button Container
export const FixedSubmitContainer = styled(Box)<{ width?: number | string }>(
  ({ theme, width = 950 }) => ({
    position: 'fixed',
    bottom: 0,
    right: 0,
    borderTop: '1px solid transparent',
    padding: theme.spacing(2, 3),
    zIndex: theme.zIndex.appBar,
    transition: 'all 0.3s ease-in-out',
    transform: 'translateY(0)',
    width,
    opacity: 0.9,
    '&:hover': {
      opacity: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderTopColor: theme.palette.divider,
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
      transform: 'translateY(-2px)',
    },
  }),
);

interface ITruncatedTooltipProps {
  title: string;
  children: React.ReactElement;
}

/** Wraps a child element in a Tooltip that only activates when the text is actually truncated. */
export const TruncatedTooltip = ({ title, children }: ITruncatedTooltipProps) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  const measureRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
    if (node) {
      setIsTruncated(node.scrollWidth > node.clientWidth);
    }
  }, []);

  return (
    <Tooltip title={title} placement='top' disableHoverListener={!isTruncated}>
      {React.cloneElement(children, { ref: measureRef })}
    </Tooltip>
  );
};
