// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { FixedSubmitContainer } from '@/components/styled';
import { type BulkItemResult, runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { getApiErrorMessage } from '@/utility/error-functions';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
  BulkMetadataCard,
  type BulkMetadataChange,
  type BulkMetadataEntity,
} from './BulkMetadataCard';
import {
  type BulkMetadataPatch,
  bulkMetadataPatch,
  isBulkMetadataEditEmpty,
} from './bulkMetadataEdit';

const NO_CHANGE: BulkMetadataChange = { edit: {}, valid: true };

export interface BulkMetadataDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Refetches the list after a write. */
  refresh?: () => void;
  /** The entities' type, plural, as "Spaces". */
  entityName: string;
  /** The `where` column of the entities' IDs, as "SpaceID". */
  idColumn: string;
  /** The selected entities, with their IDs. */
  entities: ReadonlyArray<BulkMetadataEntity & { id: string }>;
  /** Sends one bulk patch of the entities `where` selects. */
  patch: (
    where: string,
    body: BulkMetadataPatch,
  ) => Promise<readonly BulkItemResult[] | undefined>;
}

/** Adds, changes and removes the labels and delete gates of the selected entities. */
export const BulkMetadataDrawer = ({
  isOpen,
  onClose,
  refresh,
  entityName,
  idColumn,
  entities,
  patch,
}: BulkMetadataDrawerProps) => {
  const [change, setChange] = useState(NO_CHANGE);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setChange(NO_CHANGE);
    setErrorMessages([]);
    onClose();
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const body = bulkMetadataPatch(change.edit);
      // A selection can be every entity in the organization, so it is patched in chunks.
      const failures = await runChunkedBulkWrite(
        idColumn,
        entities.map((entity) => entity.id),
        (where) => patch(where, body),
        (error) => getApiErrorMessage(error, `The ${entityName} could not be updated.`),
      );
      refresh?.();
      if (failures.length > 0) {
        setErrorMessages(failures);
      } else {
        handleClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor='right'
      open={isOpen}
      onClose={handleClose}
      sx={{ '& .MuiDrawer-paper': { width: { xs: 1000 } } }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction='row'>
            <Button
              startIcon={<ArrowBack />}
              onClick={handleClose}
              sx={{ color: 'text.secondary' }}
            >
              Back to {entityName}
            </Button>
          </Stack>
          <Stack spacing={1}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 600 }}>
              Update {entityName}
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              Labels and delete gates of {entities.length} selected {entityName}
            </Typography>
          </Stack>
        </Box>
        <Box
          sx={{ flex: 1, p: 3, backgroundColor: 'rgb(249, 250, 251)', paddingBottom: '100px' }}
        >
          <ErrorList errors={errorMessages} onClose={() => setErrorMessages([])} />
          <BulkMetadataCard entities={entities} onChange={setChange} />
        </Box>
        <FixedSubmitContainer>
          <Button
            variant='contained'
            fullWidth
            disabled={
              !change.valid ||
              isBulkMetadataEditEmpty(change.edit) ||
              isSubmitting ||
              entities.length === 0
            }
            onClick={submit}
            sx={{ flexGrow: 1 }}
          >
            {isSubmitting ? `Updating ${entityName}...` : `Update ${entityName}`}
          </Button>
        </FixedSubmitContainer>
      </Box>
    </Drawer>
  );
};
