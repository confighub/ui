// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box } from '@mui/material';
import React from 'react';

/**
 * Highlights matching text in a string based on a search query.
 * Case-insensitive matching.
 *
 * @param text - The text to search within
 * @param query - The search query to highlight
 * @returns JSX with highlighted portions
 */
export const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) {
    return text;
  }

  // Escape special regex characters in the query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Split the text by the query (case-insensitive)
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));

  return (
    <>
      {parts.map((part, index) => {
        // Check if this part matches the query (case-insensitive)
        const isMatch = part.toLowerCase() === query.toLowerCase();

        return isMatch ? (
          <Box
            key={index}
            component="span"
            sx={{
              backgroundColor: 'rgba(255, 235, 59, 0.5)', // Yellow highlight
              fontWeight: 600,
            }}
          >
            {part}
          </Box>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
};
