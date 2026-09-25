// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import Check from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

export interface IShareableUrlPreviewProps {
  /** The shareable URL */
  shareUrl: string;
  /** Whether to show the badge */
  show: boolean;
  /** Optional callback when copy button is clicked (before copying to clipboard) */
  onCopy?: () => void;
  type?: 'filter' | 'view';
  showText?: boolean;
}

/**
 * ActiveStateBadge Component
 *
 * Displays a badge showing the currently active filter or view with a URL preview and copy functionality.
 * Appears at the top of the filter/view panel when something is active.
 */
export const CopyLinkButton = ({
  shareUrl,
  show,
  onCopy,
  type = 'filter',
  showText = true,
}: IShareableUrlPreviewProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      // Call the onCopy callback first (if provided)
      onCopy?.();

      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

      // Clear existing timeout if any
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Keep check icon visible for 3 seconds before reverting
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [shareUrl, onCopy]);

  return showText ? (
    <Button
      variant='text'
      size='small'
      onClick={handleCopy}
      disabled={!show}
      startIcon={
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
          }}
        >
          <Fade in={!copied} timeout={300}>
            <Box sx={{ position: copied ? 'absolute' : 'relative', display: 'flex' }}>
              <ContentCopyIcon fontSize='small' />
            </Box>
          </Fade>
          <Fade in={copied} timeout={300}>
            <Box sx={{ position: !copied ? 'absolute' : 'relative', display: 'flex' }}>
              <Check fontSize='small' />
            </Box>
          </Fade>
        </Box>
      }
      sx={{
        textTransform: 'none',
        fontWeight: 'normal',
        color: copied ? 'success.main' : 'text.secondary',
        '& .MuiButton-startIcon': {
          marginRight: '4px',
        },
      }}
    >
      <Typography
        variant='caption'
        sx={{
          color: !show ? 'text.disabled' : 'text.secondary',
          alignItems: 'center',
        }}
      >
        Share {type === 'filter' ? 'filter' : 'view'}
      </Typography>
    </Button>
  ) : (
    <IconButton
      size='small'
      onClick={handleCopy}
      disabled={!show}
      sx={{
        color: copied ? 'secondary.main' : 'text.secondary',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
        }}
      >
        <Fade in={!copied} timeout={300}>
          <Box sx={{ position: copied ? 'absolute' : 'relative', display: 'flex' }}>
            <ContentCopyIcon fontSize='small' />
          </Box>
        </Fade>
        <Fade in={copied} timeout={300}>
          <Box sx={{ position: !copied ? 'absolute' : 'relative', display: 'flex' }}>
            <Check fontSize='small' />
          </Box>
        </Fade>
      </Box>
    </IconButton>
  );
};
