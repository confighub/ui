// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { CenteredTableCell } from '@/components/styled';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  GridColumnMenu,
  GridColumnMenuProps,
  GridValidRowModel,
} from '@mui/x-data-grid';
import { useMemo, useSyncExternalStore } from 'react';
import { IDateTimeCellProps } from '@/types';
import { dayjs } from '@/utility/dayjs-setup';
import { useHighlightedText } from './useHighlightedText';

const DATETIME_FORMAT_KEY = 'dateTimeShowAbsolute';

let globalShowAbsolute = localStorage.getItem(DATETIME_FORMAT_KEY) === 'true';
const subscribers = new Set<() => void>();

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return globalShowAbsolute;
}

function toggleDateTimeFormat() {
  globalShowAbsolute = !globalShowAbsolute;
  localStorage.setItem(DATETIME_FORMAT_KEY, String(globalShowAbsolute));
  subscribers.forEach((callback) => callback());
}

function useDateTimeFormat() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function DateTimeToggleMenuItem(props: { onClick: (event: React.MouseEvent<HTMLLIElement>) => void }) {
  const showAbsolute = useDateTimeFormat();

  return (
    <MenuItem onClick={props.onClick}>
      <ListItemIcon>
        {showAbsolute ? <AccessTimeIcon fontSize="small" /> : <CalendarMonthIcon fontSize="small" />}
      </ListItemIcon>
      <ListItemText>
        {showAbsolute ? 'Show relative time' : 'Show absolute datetime'}
      </ListItemText>
    </MenuItem>
  );
}

export function DateTimeColumnMenu(props: GridColumnMenuProps) {
  const isDateTimeColumn = props.colDef?.type === 'dateTime';

  const handleToggle = (event: React.MouseEvent<HTMLLIElement>) => {
    toggleDateTimeFormat();
    props.hideMenu?.(event);
  };

  if (!isDateTimeColumn) {
    return <GridColumnMenu {...props} />;
  }

  return (
    <>
      <DateTimeToggleMenuItem onClick={handleToggle} />
      <Divider />
      <GridColumnMenu {...props} />
    </>
  );
}

export function DateTimeCell<TRow extends GridValidRowModel = GridValidRowModel>({ params }: IDateTimeCellProps<TRow>) {
  const dateValue = params.value as Date | string | null | undefined;
  const showAbsolute = useDateTimeFormat();

  const { primary, tooltip } = useMemo(() => {
    if (!dateValue) return { primary: null, tooltip: '' };
    const date = dayjs(dateValue);
    if (!date.isValid()) return { primary: null, tooltip: '' };
    const absolute = date.format('YYYY-MM-DD HH:mm:ss');
    const relative = date.fromNow();
    return {
      primary: showAbsolute ? absolute : relative,
      tooltip: showAbsolute ? relative : absolute,
    };
  }, [dateValue, showAbsolute]);

  const highlightedContent = useHighlightedText(primary);

  if (!primary) {
    return <CenteredTableCell />;
  }

  return (
    <CenteredTableCell>
      <Tooltip title={tooltip} arrow>
        <Typography variant="body1">{highlightedContent}</Typography>
      </Tooltip>
    </CenteredTableCell>
  );
}
