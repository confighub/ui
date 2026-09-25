// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import React, { useEffect, useRef, useState } from 'react';

import { Ellipses } from '@/components/styled';
import Box from '@mui/material/Box';
import Stack, { StackProps } from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography, { TypographyProps } from '@mui/material/Typography';
import { SxProps, Theme } from '@mui/material/styles';

export interface ILabelTextField {
  /**
   * The content for the label (typically a string, but can be any ReactNode).
   */
  label: React.ReactNode;
  /**
   * The content for the text displayed below the label.
   */
  text: React.ReactNode;
  /**
   * Optional content for appending additional text or icons at the end.
   */
  endAdornment?: React.ReactNode;
  /**
   * MUI Typography variant for the label.
   * @default 'caption'
   */
  labelVariant?: TypographyProps['variant'];
  /**
   * MUI Typography variant for the text.
   * @default 'body1'
   */
  textVariant?: TypographyProps['variant'];
  /**
   * MUI Typography color for the label.
   * Can be a theme color like 'text.primary', 'text.secondary', 'primary.main', etc., or a CSS color string.
   * @default 'text.secondary'
   */
  labelColor?: TypographyProps['color'];
  /**
   * MUI Typography color for the text.
   * Can be a theme color or a CSS color string.
   * @default 'text.primary'
   */
  textColor?: TypographyProps['color'];
  /**
   * Custom MUI `sx` prop to be applied to the label's Typography component.
   */
  labelSx?: SxProps<Theme>;
  /**
   * Custom MUI `sx` prop to be applied to the text's Typography component.
   */
  textSx?: SxProps<Theme>;
  /**
   * Custom MUI `sx` prop to be applied to the wrapping Stack container.
   */
  containerSx?: SxProps<Theme>;
  /**
   * The spacing between the label and the text (theme spacing units).
   * Passed to the `spacing` prop of the `Stack` component.
   * @default 0.5
   */
  spacing?: StackProps['spacing'];
  /**
   * Alignment of items in the stack.
   * @default 'flex-start'
   */
  alignItems?: StackProps['alignItems'];
}

export const LabelTextField = ({
  label,
  text,
  endAdornment,
  labelVariant = 'caption',
  textVariant = 'body1',
  labelColor = 'text.secondary',
  textColor = 'text.primary',
  labelSx,
  textSx,
  containerSx,
  spacing = 0,
  alignItems = 'flex-start',
}: ILabelTextField) => {
  const textRef = useRef<HTMLDivElement>(null); // Ref for the text element
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (textRef.current) {
      // Check if the text is overflowing
      setIsOverflowing(textRef.current.scrollWidth > textRef.current.offsetWidth);
    }
  }, [text]);

  return (
    <Stack spacing={spacing} sx={containerSx} alignItems={alignItems}>
      {label && (
        <Typography variant={labelVariant} color={labelColor} sx={labelSx}>
          {label}
        </Typography>
      )}
      {text && (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Tooltip
            title={isOverflowing && typeof text === 'string' ? text : ''}
            placement='top-start'
            arrow
          >
            <Ellipses
              ref={textRef}
              variant={textVariant}
              color={textColor}
              sx={{
                ...textSx,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {text}
            </Ellipses>
          </Tooltip>
          {endAdornment && endAdornment}
        </Box>
      )}
    </Stack>
  );
};
