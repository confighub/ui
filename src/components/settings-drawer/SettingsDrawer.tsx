// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The drawer a list page opens to edit one of its entities in place, laid out like the Target
// and Trigger drawers: a header naming the entity, and its settings form below.

import type { ReactNode } from 'react';

import { Link as RouterLink } from 'react-router-dom';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { ErrorList } from '@/components/error-list/ErrorList';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The text of the button that closes the drawer, such as "Back to Spaces" */
  backLabel: string;
  title: string;
  entityId?: string;
  /** An error from saving, for a form that reports its errors here */
  serverError?: string;
  onServerErrorClosed?: () => void;
  /** Whether the entity is still loading, to show a placeholder instead of the form */
  isLoading?: boolean;
  testId?: string;
  children: ReactNode;
}

export const SettingsDrawer = ({
  isOpen,
  onClose,
  backLabel,
  title,
  entityId,
  serverError,
  onServerErrorClosed,
  isLoading = false,
  testId,
  children,
}: SettingsDrawerProps) => (
  <Drawer
    anchor='right'
    open={isOpen}
    onClose={onClose}
    sx={{ '& .MuiDrawer-paper': { width: { xs: 1000 } } }}
    data-testid={testId}
  >
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction='row' sx={{ justifyContent: 'space-between', mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={onClose} sx={{ color: 'text.secondary' }}>
          {backLabel}
        </Button>
      </Stack>
      <Stack spacing={1}>
        <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {entityId && (
          <Stack direction='row' spacing={1} alignItems='center'>
            <Typography variant='body1' color='text.secondary'>
              UUID: {entityId}
            </Typography>
            <CopyToClipboard text={entityId} />
          </Stack>
        )}
      </Stack>
    </Box>
    <Box sx={{ flex: 1, px: 3, pt: 3, backgroundColor: 'background.default' }}>
      {onServerErrorClosed && (
        <ErrorList errors={[serverError ?? '']} onClose={onServerErrorClosed} />
      )}
      {isLoading ? <Skeleton variant='rounded' height={240} /> : children}
    </Box>
  </Drawer>
);

/** A tab of the entity's page that a settings drawer links to directly. */
export interface DetailTabLink {
  label: string;
  to: string;
}

const footerLinkProps = { component: RouterLink, variant: 'body2', underline: 'hover' } as const;

/**
 * The links at the foot of a settings drawer to the entity's own page, and to those of its
 * tabs that `tabs` names.
 */
export const FullDetailsLink = ({ to, tabs = [] }: { to: string; tabs?: DetailTabLink[] }) => (
  <Stack direction='row' spacing={2} alignItems='baseline' flexWrap='wrap' useFlexGap>
    <Link {...footerLinkProps} to={to} data-testid='open-full-details-link'>
      Open full detail page
    </Link>
    {tabs.map((tab) => (
      <Link
        key={tab.label}
        {...footerLinkProps}
        to={tab.to}
        data-testid={`open-${tab.label.toLowerCase()}-tab-link`}
      >
        {tab.label}
      </Link>
    ))}
  </Stack>
);
