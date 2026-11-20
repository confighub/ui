// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import type { NeedTone } from './fieldDiagnosis.types';

const TONE_COLOR: Record<NeedTone | 'pending', string> = {
  block: 'error.main',
  wait: 'warning.main',
  warn: 'warning.main',
  pending: 'secondary.main',
};

/** The icon of a need line (block, wait, warn) or of the unsaved edit (pending). */
export function ToneIcon({ tone }: { tone: NeedTone | 'pending' }) {
  const sx = { fontSize: 16, color: TONE_COLOR[tone], flexShrink: 0 };
  if (tone === 'block') return <ErrorOutlineIcon sx={sx} />;
  if (tone === 'pending') return <EditOutlinedIcon sx={sx} />;
  return <WarningAmberIcon sx={sx} />;
}
