// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useDispatch } from 'react-redux';
import { useDeleteBridgeWorkerMutation } from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';

interface DeleteBridgeWorkerParams {
  bridgeWorkerId: string;
  spaceId: string;
}

export const useBridgeWorkerDelete = () => {
  const dispatch = useDispatch();
  const [deleteBridgeWorker, { isLoading }] = useDeleteBridgeWorkerMutation();

  const handleDelete = async (workers: DeleteBridgeWorkerParams[]) => {
    if (!workers.length) return;

    try {
      await Promise.all(
        workers.map(async ({ bridgeWorkerId, spaceId }) => {
          await deleteBridgeWorker({
            spaceId,
            bridgeWorkerId
          }).unwrap();
        })
      );

      dispatch(
        setAlert({
          type: 'success',
          message: `${workers.length} worker(s) deleted successfully!`,
          isOpen: true,
        })
      );

      return true; // Success
    } catch (error) {
      dispatch(
        setAlert({
          type: 'error',
          message: `Failed to delete workers: ${error}`,
          isOpen: true,
        })
      );
      return false; // Failure
    }
  };

  return {
    deleteWorkers: handleDelete,
    isDeleting: isLoading
  };
};