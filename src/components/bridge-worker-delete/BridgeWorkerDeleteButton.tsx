// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useBulkDeleteBridgeWorkersMutation } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';

import { ConfirmationModal } from '../confirmation-modal/ConfirmationModal';
import { fadeIn } from '../styled';

interface BridgeWorkerDeleteButtonProps {
  selectedWorkers: Array<{
    bridgeWorkerId: string;
    spaceId: string;
  }>;
  onDeleteComplete?: () => void;
  disabled?: boolean;
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
  setErrorMessage: React.Dispatch<React.SetStateAction<string[]>>;
}

export const BridgeWorkerDeleteButton = ({
  selectedWorkers,
  onDeleteComplete,
  disabled = false,
  variant = 'contained',
  size = 'small',
  setErrorMessage,
}: BridgeWorkerDeleteButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [
    bulkDeleteBridgeWorkers,
    {
      isSuccess: isBulkDeleteSuccess,
      error: bulkDeleteError,
      data: bulkDeleteData,
      isLoading,
    },
  ] = useBulkDeleteBridgeWorkersMutation();

  useBulkApiErrorMessage(
    bulkDeleteError,
    isBulkDeleteSuccess,
    bulkDeleteData,
    setErrorMessage,
    {
      onSuccess: () => {
        setIsModalOpen(false);
        onDeleteComplete?.();
      },
      onError: () => {
        setIsModalOpen(false);
      },
    },
  );

  const handleDeleteConfirm = async () => {
    await bulkDeleteBridgeWorkers({
      where: `BridgeWorkerID IN (${selectedWorkers.map((worker) => `'${worker.bridgeWorkerId}'`).join(',')})`,
    });
  };

  const isDisabled = disabled || selectedWorkers.length === 0 || isLoading;
  const tooltipTitle =
    selectedWorkers.length === 0 ? 'Select at least one worker to delete.' : '';

  return (
    <>
      <Tooltip title={tooltipTitle} arrow>
        <Box>
          <Button
            disabled={isDisabled}
            variant={variant}
            size={size}
            color='primary'
            onClick={() => setIsModalOpen(true)}
            sx={{
              animation: `${fadeIn} 0.3s ease-in`,
            }}
          >
            Delete
          </Button>
        </Box>
      </Tooltip>

      <ConfirmationModal
        modalTitleText='Delete Bridge Workers'
        modalDescriptionText={`Are you sure you want to delete ${selectedWorkers.length} bridge worker(s)?`}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleDeleteConfirm}
      />
    </>
  );
};
