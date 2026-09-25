// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import RefreshIcon from '@mui/icons-material/Cached';
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material';

export interface ProgressRefreshButtonProps {
    /** Callback function when refresh button is clicked */
    onRefresh: () => void;
    /** Whether the button should be disabled (e.g., during loading) */
    disabled?: boolean;
    /** Timestamp that changes on each poll - used to reset the progress ring */
    lastPollTimestamp?: number;
    /** Duration of the progress animation in milliseconds */
    pollIntervalMs?: number;
    /** Tooltip text to display on hover */
    tooltipText?: string;
}

/**
 * A refresh button with a circular progress indicator that shows time until next automatic refresh
 */
export const ProgressRefreshButton = ({
    onRefresh,
    disabled = false,
    lastPollTimestamp,
    pollIntervalMs = 5000,
    tooltipText = 'Auto-refreshing every 5 seconds',
}: ProgressRefreshButtonProps) => {
    const [progress, setProgress] = useState(0);
    const lastPollRef = useRef(lastPollTimestamp);

    // Track polling progress - updates every 100ms to show smooth progress ring
    useEffect(() => {
        // Reset progress when poll timestamp changes (new poll occurred)
        if (lastPollTimestamp !== lastPollRef.current) {
            lastPollRef.current = lastPollTimestamp;
            setProgress(0);
        }

        const updateInterval = 100; // Update every 100ms for smooth animation
        const totalUpdates = pollIntervalMs / updateInterval;
        const progressIncrement = 100 / totalUpdates;

        const interval = setInterval(() => {
            setProgress((prev) => {
                const newProgress = prev + progressIncrement;
                return newProgress >= 100 ? 100 : newProgress;
            });
        }, updateInterval);

        return () => clearInterval(interval);
    }, [lastPollTimestamp, pollIntervalMs]);

    const handleRefreshClick = useCallback(() => {
        onRefresh();
    }, [onRefresh]);

    return (
        <Tooltip arrow placement='bottom' title={tooltipText}>
            <Box
                sx={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {!disabled && (
                    <CircularProgress
                        variant='determinate'
                        value={progress}
                        size={36}
                        thickness={2}
                        sx={{
                            position: 'absolute',
                            color: 'primary.main',
                            opacity: 0.5,
                        }}
                    />
                )}
                <IconButton
                    data-testid='refresh-button'
                    size='small'
                    onClick={handleRefreshClick}
                    disabled={disabled}
                    sx={{
                        color: 'primary.main',
                        '&:hover': {
                            backgroundColor: 'action.hover',
                        },
                        '& .refresh-icon': {
                            transform: 'rotate(0deg)',
                            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        },
                        '&:hover .refresh-icon': {
                            transform: 'rotate(45deg)',
                            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        },
                    }}
                >
                    <RefreshIcon className='refresh-icon' />
                </IconButton>
            </Box>
        </Tooltip>
    );
};

