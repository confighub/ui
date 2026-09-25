// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';

import type { Invocation } from '@confighub/rtk-query';
import { invocationFunctions } from '@/utility/invocation-functions';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Link from '@mui/material/Link';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

/**
 * Styled container for the hover card with Linear/Attio-inspired design
 */
const HoverCardContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
  padding: theme.spacing(1.5),
  minWidth: 280,
  maxWidth: 360,
  zIndex: theme.zIndex.tooltip,
}));

/**
 * Header section with title and badge
 */
const CardHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.spacing(1),
  marginBottom: theme.spacing(1),
  paddingBottom: theme.spacing(1),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

/**
 * Metadata row for key-value pairs
 */
const MetadataRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: theme.spacing(0.375, 0),
  gap: theme.spacing(2),
}));

/**
 * Label for metadata
 */
const MetadataLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  fontWeight: 500,
  color: theme.palette.text.secondary,
  letterSpacing: '0.02em',
  flexShrink: 0,
}));

/**
 * Value for metadata
 */
const MetadataValue = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.primary,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}));

/**
 * Badge for toolchain type
 */
const ToolchainBadge = styled(Box)(({ theme }) => ({
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: theme.spacing(0.25, 0.75),
  borderRadius: 4,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}));

/**
 * Section for arguments
 */
const ArgumentsSection = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1),
  paddingTop: theme.spacing(1),
  borderTop: `1px solid ${theme.palette.divider}`,
}));

/**
 * Container for argument items
 */
const ArgumentItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: theme.spacing(0.25, 0),
  gap: theme.spacing(1.5),
}));

/**
 * Argument name
 */
const ArgumentName = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  color: theme.palette.text.secondary,
  flexShrink: 0,
}));

/**
 * Argument value
 */
const ArgumentValue = styled(Typography)(({ theme }) => ({
  fontSize: '0.6875rem',
  color: theme.palette.text.primary,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 180,
}));

/**
 * Footer section with action links
 */
const CardFooter = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1),
  paddingTop: theme.spacing(1),
  borderTop: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  justifyContent: 'flex-end',
}));

/** Renders a truncated value with a MUI Tooltip showing the full text on hover */
const TruncatedValue = ({
  value,
  Wrapper,
}: {
  value: string;
  Wrapper: React.ComponentType<React.ComponentProps<typeof Typography>>;
}) => {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  const handleMouseEnter = () => {
    if (ref.current && ref.current.scrollWidth > ref.current.clientWidth) {
      setOpen(true);
    }
  };

  return (
    <Tooltip
      title={value}
      open={open}
      onClose={() => setOpen(false)}
      placement='top'
      arrow
    >
      <Wrapper
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setOpen(false)}
        sx={{ cursor: open ? 'default' : undefined }}
      >
        {value}
      </Wrapper>
    </Tooltip>
  );
};

interface IFunctionInvocationHoverCardProps {
  invocation: Invocation;
  children: React.ReactElement;
  /** Callback when user clicks to edit and invoke the invocation */
  onEditInvocation?: (invocation: Invocation) => void;
}

/**
 * Hover card component that displays invocation details in a Linear/Attio-style popover.
 * Shows function name, toolchain, and arguments with high information density.
 */
export const FunctionInvocationHoverCard = ({
  invocation,
  children,
  onEditInvocation,
}: IFunctionInvocationHoverCardProps) => {
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

  const open = (isHoveringTrigger || isHoveringCard) && Boolean(anchorEl);

  const functions = invocationFunctions(invocation);

  return (
    <>
      <Box
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        component='span'
        sx={{ display: 'inline-flex', width: '100%' }}
      >
        {children}
      </Box>
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement='left-start'
        transition
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 12],
            },
          },
          {
            name: 'preventOverflow',
            options: {
              padding: 8,
            },
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
              <CardHeader>
                <Box sx={{ overflow: 'hidden' }}>
                  <Typography
                    variant='subtitle2'
                    sx={{
                      //fontWeight: 600,
                      fontSize: '0.8125rem',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {invocation.DisplayName || invocation.Slug}
                  </Typography>
                  {invocation.DisplayName && invocation.Slug && (
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.6875rem',
                      }}
                    >
                      {invocation.Slug}
                    </Typography>
                  )}
                </Box>
                <ToolchainBadge>{invocation.ToolchainType}</ToolchainBadge>
              </CardHeader>

              {/* One block per function, in the order the Invocation executes them. */}
              {functions.length === 0 && (
                <Box>
                  <MetadataRow>
                    <MetadataLabel>Function</MetadataLabel>
                    <TruncatedValue value='—' Wrapper={MetadataValue} />
                  </MetadataRow>
                </Box>
              )}
              {functions.map((fn, fnIndex) => (
                <Box key={`${fn.FunctionName ?? ''}-${fnIndex}`}>
                  <MetadataRow>
                    <MetadataLabel>
                      {functions.length > 1 ? `Function ${fnIndex + 1}` : 'Function'}
                    </MetadataLabel>
                    <TruncatedValue value={fn.FunctionName || '—'} Wrapper={MetadataValue} />
                  </MetadataRow>
                  {(fn.Arguments?.length ?? 0) > 0 && (
                    <ArgumentsSection>
                      <Typography
                        sx={{
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          color: 'text.secondary',
                          letterSpacing: '0.04em',
                          mb: 0.5,
                        }}
                      >
                        Arguments ({fn.Arguments?.length})
                      </Typography>
                      {fn.Arguments?.slice(0, 5).map((arg, index) => (
                        <ArgumentItem key={arg.ParameterName || index}>
                          <ArgumentName>{arg.ParameterName}</ArgumentName>
                          <TruncatedValue value={String(arg.Value ?? '—')} Wrapper={ArgumentValue} />
                        </ArgumentItem>
                      ))}
                      {fn.Arguments && fn.Arguments.length > 5 && (
                        <Typography
                          sx={{
                            fontSize: '0.625rem',
                            color: 'text.secondary',
                            fontStyle: 'italic',
                            mt: 0.5,
                          }}
                        >
                          +{fn.Arguments.length - 5} more arguments
                        </Typography>
                      )}
                    </ArgumentsSection>
                  )}
                </Box>
              ))}

              {onEditInvocation && (
                <CardFooter>
                  <Link
                    component='button'
                    variant='body2'
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEditInvocation(invocation);
                    }}
                    sx={{
                      fontSize: '0.6875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      cursor: 'pointer',
                      textDecoration: 'none',
                      '&:hover': {
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    <EditIcon sx={{ fontSize: '0.875rem' }} />
                    Edit & Invoke
                  </Link>
                </CardFooter>
              )}
            </HoverCardContainer>
          </Fade>
        )}
      </Popper>
    </>
  );
};
