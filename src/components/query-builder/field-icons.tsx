// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import ChangeHistoryOutlined from '@mui/icons-material/ChangeHistoryOutlined';
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import ChatOutlined from '@mui/icons-material/ChatOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import FlashOnOutlined from '@mui/icons-material/FlashOnOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FunctionsOutlined from '@mui/icons-material/FunctionsOutlined';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import NumbersOutlined from '@mui/icons-material/NumbersOutlined';
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SignalCellularAltOutlined from '@mui/icons-material/SignalCellularAltOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import UpdateOutlined from '@mui/icons-material/UpdateOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined';

import type { FilterFieldType } from './types';

/**
 * Icon-only keys — not real filterable field types, so kept out of
 * `FilterFieldType` itself (which drives exhaustive `Record`s of actual
 * filter config, e.g. `FIELD_CONFIGS`/`FIELD_DESCRIPTIONS` in `operators.ts`,
 * that a non-filterable label key has nothing meaningful to fill in for).
 * Label keys the Components page singles out for their own icon
 * instead of the generic 'labels' one (`componentGroupFields.ts`'s
 * `SPECIAL_LABEL_ICONS`) — a later icon-selector UI replaces this fixed set.
 */
export type SpecialLabelIconKey = 'component' | 'owner' | 'stage' | 'region' | 'department';

/** Every key `FIELD_ICONS`/`getChipIcon`'s `iconMap` can resolve. */
export type FieldIconKey = FilterFieldType | SpecialLabelIconKey;

/**
 * Icons for each filter field type, plus the special Space label keys above.
 */
export const FIELD_ICONS: Record<FieldIconKey, React.ReactNode> = {
  // Common fields
  space: <FolderOutlined fontSize="small" />,
  slug: <LabelOutlined fontSize="small" />,
  createdAt: <CalendarTodayOutlined fontSize="small" />,
  updatedAt: <UpdateOutlined fontSize="small" />,
  labels: <LocalOfferOutlined fontSize="small" />,
  // Unit-specific fields
  toolchainType: <SettingsOutlined fontSize="small" />,
  target: <TrackChangesOutlined fontSize="small" />,
  unitId: <NumbersOutlined fontSize="small" />,
  headRevisionNum: <NumbersOutlined fontSize="small" />,
  lastReleasedRevisionNum: <NumbersOutlined fontSize="small" />,
  lastChangeDescription: <DescriptionOutlined fontSize="small" />,
  where: <CodeOutlined fontSize="small" />,
  whereData: <StorageOutlined fontSize="small" />,
  resourceType: <CategoryOutlined fontSize="small" />,
  // Computed Unit fields
  upgradeNeeded: <TrendingUpOutlined fontSize="small" />,
  unreleasedChanges: <ChangeHistoryOutlined fontSize="small" />,
  validationErrorsCount: <VerifiedUserOutlined fontSize="small" />,
  checkResult: <FactCheckOutlined fontSize="small" />,
  // BridgeWorker-specific fields
  condition: <SignalCellularAltOutlined fontSize="small" />,
  lastSeenAt: <VisibilityOutlined fontSize="small" />,
  bridgeWorkerId: <DnsOutlined fontSize="small" />,
  lastMessage: <ChatOutlined fontSize="small" />,
  ipAddress: <LanguageOutlined fontSize="small" />,
  // Target-specific fields
  targetId: <TrackChangesOutlined fontSize="small" />,
  // Trigger-specific fields
  event: <FlashOnOutlined fontSize="small" />,
  functionName: <FunctionsOutlined fontSize="small" />,
  disabled: <CheckBoxOutlined fontSize="small" />,
  validating: <CheckBoxOutlined fontSize="small" />,
  triggerId: <FlashOnOutlined fontSize="small" />,
  // Special Space label keys (Components page only)
  component: <WidgetsOutlined fontSize="small" />,
  owner: <PersonOutlineOutlined fontSize="small" />,
  stage: <LayersOutlined fontSize="small" />,
  region: <PublicOutlined fontSize="small" />,
  department: <BusinessOutlined fontSize="small" />,
  // Saved filter selection
};
