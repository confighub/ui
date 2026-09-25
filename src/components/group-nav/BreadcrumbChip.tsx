// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useRef, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { alpha, styled } from '@mui/material/styles';

import { getChipIcon } from './field-icon';
import { FieldPickerDropdown } from './FieldPickerDropdown';
import type { GroupableCategory } from './groupable-fields';

const ChipRoot = styled('span', {
  shouldForwardProp: (prop) => prop !== '$bloom' && prop !== '$active',
})<{ $bloom: boolean; $active: boolean }>(({ theme, $bloom, $active }) => ({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'stretch',
  height: 30,
  border: `1px solid ${$bloom ? theme.palette.primary.main : 'transparent'}`,
  borderRadius: 8,
  background: $active
    ? alpha(theme.palette.primary.main, 0.04)
    : theme.palette.background.paper,
  boxShadow: $bloom ? '0 1px 2px rgba(20,24,32,0.06)' : 'none',
  cursor: 'pointer',
  overflow: 'visible',
  transition: 'border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
}));

const ChipLabelButton = styled('button', {
  shouldForwardProp: (prop) => prop !== '$bloom' && prop !== '$active',
})<{ $bloom: boolean; $active: boolean }>(({ theme, $bloom, $active }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 5px',
  fontSize: '0.875rem',
  fontWeight: 500,
  letterSpacing: 'normal',
  color: $active
    ? theme.palette.primary.main
    : $bloom
      ? theme.palette.text.primary
      : theme.palette.text.secondary,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
  textDecoration: $bloom ? 'none' : 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: theme.palette.text.secondary,
  textUnderlineOffset: '3px',
  // At rest the caret is invisible but still occupies 12px (11px width + 1px
  // marginLeft). Shift content right by half that so the label reads as
  // horizontally centred. On hover the shift reverses, sliding the label left
  // to make room for the caret as it fades in.
  transform: $bloom ? 'translateX(0)' : 'translateX(6px)',
  transition: 'color 120ms ease, transform 140ms ease',
}));

const FieldSvgIcon = styled('span', {
  shouldForwardProp: (prop) => prop !== '$bloom',
})<{ $bloom: boolean }>(({ theme, $bloom }) => ({
  display: 'inline-flex',
  width: 13,
  height: 13,
  opacity: 1,
  flexShrink: 0,
  overflow: 'hidden',
  color: $bloom ? theme.palette.primary.main : theme.palette.text.secondary,
  transition: 'color 120ms ease',
  fontSize: 13,
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': {
    fontSize: 13,
  },
}));

const ChipCaret = styled(KeyboardArrowDownIcon, {
  shouldForwardProp: (prop) => prop !== '$bloom' && prop !== '$active',
})<{ $bloom: boolean; $active: boolean }>(({ theme, $bloom, $active }) => ({
  width: 11,
  height: 11,
  flexShrink: 0,
  opacity: $bloom ? 1 : 0,
  color: $bloom ? theme.palette.primary.main : theme.palette.text.disabled,
  marginLeft: 1,
  transform: $active ? 'rotate(180deg)' : 'none',
  transition: 'opacity 140ms ease, transform 120ms ease, color 120ms ease',
}));

const ChipRemoveButton = styled('button', {
  shouldForwardProp: (prop) => prop !== '$bloom',
})<{ $bloom: boolean }>(({ theme, $bloom }) => ({
  position: 'absolute',
  top: -6,
  right: -6,
  width: 16,
  height: 16,
  borderRadius: '50%',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.background.paper,
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  opacity: $bloom ? 1 : 0,
  pointerEvents: $bloom ? 'auto' : 'none',
  transition: 'opacity 140ms ease, background 120ms ease, color 120ms ease, border-color 120ms ease',
  '&:hover': {
    background: theme.palette.error.main,
    color: theme.palette.common.white,
    borderColor: theme.palette.error.main,
  },
}));

interface BreadcrumbChipProps {
  field: string;
  /** Prefix-stripped label; chip uppercases via CSS. */
  label: string;
  categories: GroupableCategory[];
  usedFields: string[];
  onChangeField: (field: string) => void;
  onRemove: () => void;
  /** When true (drag in progress), hover effects are suppressed on all chips. */
  isDragActive?: boolean;
}

/**
 * Single chip in the GroupNavBreadcrumb. At rest it renders as plain uppercase
 * text with a dotted underline; on hover/focus it "blooms" into a full chip
 * (primary border, field icon, caret, remove button) with 140 ms transitions.
 */
export function BreadcrumbChip({
  field,
  label,
  categories,
  usedFields,
  onChangeField,
  onRemove,
  isDragActive = false,
}: BreadcrumbChipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isBloom = (isHovered || dropdownOpen) && !isDragActive;
  const isActive = dropdownOpen;

  const handleLabelClick = () => {
    setDropdownOpen((prev) => !prev);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  const handleSelect = (newField: string) => {
    onChangeField(newField);
    setDropdownOpen(false);
  };

  return (
    <>
      <ChipRoot
        data-testid="breadcrumb-chip-root"
        $bloom={isBloom}
        $active={isActive}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <ChipLabelButton
          ref={buttonRef}
          $bloom={isBloom}
          $active={isActive}
          aria-label={`Change ${label} grouping`}
          onClick={handleLabelClick}
          type="button"
        >
          <FieldSvgIcon $bloom={isBloom}>{getChipIcon(field)}</FieldSvgIcon>
          {label}
          <ChipCaret $bloom={isBloom} $active={isActive} />
        </ChipLabelButton>
        <ChipRemoveButton
          $bloom={isBloom}
          aria-label={`Remove ${label} grouping`}
          onClick={handleRemove}
          type="button"
        >
          <CloseIcon sx={{ fontSize: 9 }} />
        </ChipRemoveButton>
      </ChipRoot>

      {dropdownOpen && (
        <FieldPickerDropdown
          anchorEl={buttonRef.current}
          open={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          categories={categories}
          usedFields={usedFields}
          currentField={field}
          onSelect={handleSelect}
        />
      )}
    </>
  );
}
