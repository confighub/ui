// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The change mark: a branch, as the design draws it on the button and in the panel head. */
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

export function ChangeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24" sx={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...props.sx }}>
      <path d="M6 3v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </SvgIcon>
  );
}
