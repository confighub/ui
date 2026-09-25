// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactElement, type ReactNode, useState } from 'react';
import { useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Popper, { type PopperPlacementType } from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

// ============================================================================
// STYLED COMPONENTS — shared hover card styles
// ============================================================================

export const HoverCardContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
  padding: theme.spacing(1.5),
  minWidth: 280,
  maxWidth: 400,
  zIndex: theme.zIndex.tooltip,
}));

export const HoverCardHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.spacing(1),
  marginBottom: theme.spacing(1),
  paddingBottom: theme.spacing(1),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const HoverCardBadge = styled(Box)(({ theme }) => ({
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: theme.spacing(0.25, 0.75),
  borderRadius: 4,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}));

export const HoverCardMetadataRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: theme.spacing(0.375, 0),
  gap: theme.spacing(2),
}));

export const HoverCardMetadataLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  fontWeight: 500,
  color: theme.palette.text.secondary,
  letterSpacing: '0.02em',
  flexShrink: 0,
}));

export const HoverCardMetadataValue = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.primary,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

export const HoverCardMetadataValueWithTooltip = ({ children }: { children: string }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
    }
  }, [children]);

  return (
    <Tooltip title={isTruncated ? children : ''} arrow disableHoverListener={!isTruncated}>
      <HoverCardMetadataValue ref={textRef}>{children}</HoverCardMetadataValue>
    </Tooltip>
  );
};

export const HoverCardSection = styled(Box)<{ $border?: boolean }>(({ theme, $border }) => ({
  marginTop: theme.spacing(1),
  paddingTop: theme.spacing(1),
  borderTop: $border === false ? 'none' : `1px solid ${theme.palette.divider}`,
}));

export const HoverCardTitle = styled(Typography)({
  fontSize: '0.8125rem',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const HoverCardSubtitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  color: theme.palette.text.secondary,
}));

// ============================================================================
// TYPES
// ============================================================================

interface HoverCardProps {
  /** The trigger element that activates the hover card */
  children: ReactElement;
  /** Content rendered inside the hover card container */
  content: ReactNode;
  /** Popper placement relative to the trigger */
  placement?: PopperPlacementType;
  /** Popper offset [skidding, distance] */
  offset?: [number, number];
  /** Whether the hover card should open (allows parent to gate on data readiness) */
  enabled?: boolean;
  /** Additional sx for the trigger wrapper */
  triggerSx?: Record<string, unknown>;
}

export const ParamItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: theme.spacing(0.25, 0),
  gap: theme.spacing(1.5),
}));

export const ParamName = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  color: theme.palette.text.secondary,
  flexShrink: 0,
}));

export const ParamType = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  color: theme.palette.text.primary,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 180,
}));

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Reusable hover card wrapper that handles hover state, anchoring, and
 * Popper/Fade transitions. Consumers provide the card content via the
 * `content` prop and use the exported styled primitives for layout.
 */
export const HoverCard = ({
  children,
  content,
  placement = 'left-start',
  offset = [0, 12],
  enabled = true,
  triggerSx,
}: HoverCardProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const [isHoveringCard, setIsHoveringCard] = useState(false);

  const handleTriggerMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setIsHoveringTrigger(true);
  };

  const handleTriggerMouseLeave = () => {
    setIsHoveringTrigger(false);
  };

  const handleCardMouseEnter = () => {
    setIsHoveringCard(true);
  };

  const handleCardMouseLeave = () => {
    setIsHoveringCard(false);
  };

  const open = enabled && (isHoveringTrigger || isHoveringCard) && Boolean(anchorEl);

  return (
    <>
      <Box
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        component='span'
        sx={{ display: 'inline-flex', width: '100%', ...triggerSx }}
      >
        {children}
      </Box>
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement={placement}
        transition
        modifiers={[
          {
            name: 'offset',
            options: { offset },
          },
          {
            name: 'preventOverflow',
            options: { padding: 8 },
          },
        ]}
        sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={150}>
            <HoverCardContainer
              onMouseEnter={handleCardMouseEnter}
              onMouseLeave={handleCardMouseLeave}
            >
              {content}
            </HoverCardContainer>
          </Fade>
        )}
      </Popper>
    </>
  );
};
