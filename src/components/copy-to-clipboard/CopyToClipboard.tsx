// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import Check from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import { SxProps, Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

export interface CopyToClipboardProps {
  text: string;
  /** Optional callback invoked before copying to clipboard */
  onClick?: () => void;
  /** Optional custom sx props for the IconButton */
  sx?: SxProps<Theme>;
  /** Optional custom title for the tooltip */
  title?: string;
  /** Optional size for the button (default: 'small') */
  size?: 'small' | 'medium' | 'large';
}

export const CopyToClipboard = ({ text, onClick, sx, title, size = 'small' }: CopyToClipboardProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      // Call the onCopy callback first (if provided)
      onClick?.();

      await navigator.clipboard.writeText(text);
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
  }, [text, onClick]);

  return (
    <Tooltip title={title ?? (copied ? 'Copied!' : 'Copy to clipboard')} arrow>
      <IconButton
        onClick={handleCopy}
        size={size}
        sx={{
          marginLeft: 1,
          color: copied ? 'success.main' : 'inherit',
          ...sx
        }}
      >
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    </Tooltip>
  );
};
