// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/**
 * Formats a timestamp into a human-readable string
 * Uses relative time for dates within the last 7 days
 * Uses absolute format for older dates
 */
export const formatInvocationTimestamp = (timestamp: number | string): string => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const daysDiff = now.diff(date, 'day');

  // Use relative time for dates within the last 7 days
  if (daysDiff < 7) {
    return date.fromNow(); // e.g., "2 hours ago", "3 days ago"
  }

  // Use absolute format for older dates
  return date.format('MMM D, YYYY [at] h:mm A'); // e.g., "Jan 15, 2025 at 2:30 PM"
};

/**
 * Gets a short relative time string (for compact display)
 */
export const formatShortTimestamp = (timestamp: number): string => {
  const date = dayjs(timestamp);
  const now = dayjs();

  const minutesDiff = now.diff(date, 'minute');
  const hoursDiff = now.diff(date, 'hour');
  const daysDiff = now.diff(date, 'day');

  if (minutesDiff < 1) return 'Just now';
  if (minutesDiff < 60) return `${minutesDiff}m ago`;
  if (hoursDiff < 24) return `${hoursDiff}h ago`;
  if (daysDiff < 7) return `${daysDiff}d ago`;

  return date.format('MMM D');
};

/**
 * Gets a full absolute timestamp
 */
export const formatAbsoluteTimestamp = (timestamp: number): string => {
  return dayjs(timestamp).format('MMM D, YYYY [at] h:mm A');
};
