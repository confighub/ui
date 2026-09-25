// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import FunctionsIcon from '@mui/icons-material/Functions';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import Storage from '@mui/icons-material/Storage';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { alpha, styled, useTheme } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export interface IGettingStartedProps {
  onAddButtonClicked: () => void;
}

// ============================================================================
// STYLED
// ============================================================================

const HeroCard = styled(Paper)(({ theme }) => ({
  position: 'relative',
  overflow: 'hidden',
  padding: theme.spacing(4, 4, 3.5),
  borderRadius: 16,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
  background:
    theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 60%)`
      : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${theme.palette.background.paper} 60%)`,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
    borderRadius: '16px 16px 0 0',
  },
}));

const ConceptCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  borderRadius: 12,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.3),
    boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.08)}`,
    transform: 'translateY(-2px)',
  },
}));

// ============================================================================
// HELPERS
// ============================================================================

interface IIconBubbleProps {
  color: string;
  children: React.ReactNode;
}

const IconBubble = ({ color, children }: IIconBubbleProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
      borderRadius: '10px',
      backgroundColor: alpha(color, 0.12),
      color,
      flexShrink: 0,
      '& svg': { fontSize: 20 },
    }}
  >
    {children}
  </Box>
);

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface IConceptCardItemProps {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  href: string;
}

const ConceptCardItem = ({ icon, color, title, description, href }: IConceptCardItemProps) => (
  <ConceptCard>
    <IconBubble color={color}>{icon}</IconBubble>
    <Box>
      <Typography variant='body2' fontWeight={600} sx={{ mb: 0.25 }}>
        {title}
      </Typography>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ lineHeight: 1.4, display: 'block' }}
      >
        {description}
      </Typography>
    </Box>
    <Link
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      underline='hover'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 'auto',
        fontSize: '0.72rem',
        fontWeight: 600,
        color,
      }}
    >
      Learn more <ArrowForwardIcon sx={{ fontSize: 12 }} />
    </Link>
  </ConceptCard>
);

// ============================================================================
// COMPONENT
// ============================================================================

export const GettingStarted = ({ onAddButtonClicked }: IGettingStartedProps) => {
  const theme = useTheme();

  const concepts: IConceptCardItemProps[] = [
    {
      icon: <FolderCopyIcon />,
      color: theme.palette.primary.main,
      title: 'Spaces',
      description:
        'Organizational namespaces that group related configuration units together.',
      href: 'https://docs.confighub.com/background/entities/space/',
    },
    {
      icon: <DataObjectIcon />,
      color: theme.palette.secondary.main,
      title: 'Units',
      description:
        'Deployable configuration artifacts that hold rendered config for a specific environment and target.',
      href: 'https://docs.confighub.com/background/entities/unit/',
    },
    {
      icon: <Storage />,
      color: theme.palette.success.main,
      title: 'Targets',
      description:
        'Destination clusters or environments where configuration is applied and managed.',
      href: 'https://docs.confighub.com/background/entities/target/',
    },
    {
      icon: <PrecisionManufacturingIcon />,
      color: theme.palette.warning.main,
      title: 'Workers',
      description:
        'Bridge agents that connect ConfigHub to your clusters and apply configuration changes.',
      href: 'https://docs.confighub.com/background/entities/worker/',
    },
    {
      icon: <FunctionsIcon />,
      color: theme.palette.info.main,
      title: 'Functions',
      description:
        'Transformation pipelines that render, template, and validate configuration data.',
      href: 'https://docs.confighub.com/background/entities/function/',
    },
  ];

  return (
    <Container maxWidth='md' sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* ── Hero ── */}
        <HeroCard>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Chip
              icon={<RocketLaunchIcon sx={{ fontSize: '14px !important' }} />}
              label='GitOps Configuration Management'
              size='small'
              sx={{
                alignSelf: 'flex-start',
                fontWeight: 600,
                fontSize: '0.7rem',
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            <Box>
              <Typography
                variant='h4'
                fontWeight={700}
                sx={{ letterSpacing: '-0.02em', mb: 1 }}
              >
                Welcome to ConfigHub
              </Typography>
              <Typography
                variant='body1'
                color='text.secondary'
                sx={{ maxWidth: 560, lineHeight: 1.6 }}
              >
                See what will happen before it happens — ConfigHub is your single source of
                truth for service configuration. Validate before deployment, roll back
                instantly during incidents, and enforce consistency across every environment
                with automated checks.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant='contained'
                size='medium'
                startIcon={<AddCircleOutlineIcon />}
                onClick={onAddButtonClicked}
                sx={{ borderRadius: 2, fontWeight: 600 }}
              >
                Create your first Unit
              </Button>
              <Button
                variant='outlined'
                size='medium'
                endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
                href='https://docs.confighub.com/get-started/setup/'
                target='_blank'
                rel='noopener noreferrer'
                sx={{ borderRadius: 2 }}
              >
                Read the docs
              </Button>
            </Box>
          </Box>
        </HeroCard>
        <Divider />
        {/* ── Core Concepts ── */}
        <Box>
          <Typography
            variant='overline'
            color='text.secondary'
            fontWeight={700}
            sx={{ letterSpacing: '0.08em', mb: 1.5, display: 'block' }}
          >
            Core Concepts
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr 1fr',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(5, 1fr)',
              },
              gap: 1.5,
            }}
          >
            {concepts.map((c) => (
              <ConceptCardItem key={c.title} {...c} />
            ))}
          </Box>
        </Box>
      </Box>
    </Container>
  );
};
