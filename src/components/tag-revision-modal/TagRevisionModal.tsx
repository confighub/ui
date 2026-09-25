// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  type TagRead,
  type UnitRead,
  useCreateTagMutation,
  useListTagsQuery,
  useUpdateUnitMutation,
} from '@confighub/rtk-query';
import type { RevisionRow } from '@/types';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface TagOption {
  TagID: string;
  DisplayName: string;
  Slug: string;
  isNew?: boolean;
}

export interface TagRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: UnitRead;
  selectedRevision: RevisionRow | null;
  setErrorMessage: (message: string) => void;
  onRefresh?: () => void;
  changeSetId?: string;
}

const filter = createFilterOptions<TagOption>();

/**
 * Modal for tagging the head revision of a unit.
 * Only the head revision can be tagged.
 */
export const TagRevisionModal = ({
  isOpen,
  onClose,
  unit,
  selectedRevision,
  setErrorMessage,
  onRefresh,
  changeSetId,
}: TagRevisionModalProps) => {
  const [selectedOption, setSelectedOption] = useState<TagOption | null>(null);
  const [isTagging, setIsTagging] = useState(false);

  const spaceID = unit?.SpaceID || '';
  const headRevisionNum = unit?.HeadRevisionNum;
  const isHeadRevision = selectedRevision?.RevisionNum === headRevisionNum;

  const { tags = [] } = useListTagsQuery(
    { spaceId: spaceID },
    {
      skip: !spaceID || !isOpen,
      selectFromResult: (result) => ({
        tags: result?.data
          ?.map((extendedTag) => extendedTag.Tag)
          .filter((tag): tag is TagRead => !!tag && !tag.ChangeSetID),
      }),
    },
  );

  const [createTag] = useCreateTagMutation();
  const [updateUnit, { error, isSuccess }] = useUpdateUnitMutation();

  useApiErrorMessage(error, isSuccess, setErrorMessage);

  const tagOptions: TagOption[] = useMemo(
    () =>
      tags.map((tag) => ({
        TagID: tag.TagID ?? '',
        DisplayName: tag.DisplayName || tag.Slug || '',
        Slug: tag.Slug,
      })),
    [tags],
  );

  const handleClose = () => {
    if (isTagging) return;
    setSelectedOption(null);
    onClose();
  };

  const handleApplyTag = async () => {
    const unitId = unit?.UnitID;
    if (!selectedOption || !spaceID || !unitId || !isHeadRevision) return;

    try {
      setIsTagging(true);

      let tagId = selectedOption.TagID;

      // Create a new tag if needed
      if (selectedOption.isNew) {
        const slug = selectedOption.DisplayName.toLowerCase().replace(/\s+/g, '-');
        const result = await createTag({
          spaceId: spaceID,
          tag: {
            Slug: slug,
            DisplayName: selectedOption.DisplayName.trim(),
          },
        });

        if ('data' in result && result.data?.TagID) {
          tagId = result.data.TagID;
        } else {
          return;
        }
      }

      const result = await updateUnit({
        spaceId: spaceID,
        unitId,
        tag: tagId,
        ...(changeSetId ? { changeSetId } : {}),
        unit,
      });

      if ('error' in result) {
        return;
      }

      onRefresh?.();
      setSelectedOption(null);
      onClose();
    } catch (err) {
      console.error('Failed to apply tag:', err);
    } finally {
      setIsTagging(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth='xs'
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, pt: 3, px: 3 }}>
        <Typography variant='h6' fontWeight={600}>
          Tag Revision
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2 }}>
        <Stack spacing={2}>
          {!isHeadRevision && (
            <Alert severity='info' icon={<InfoOutlinedIcon />}>
              Only the head revision (#{headRevisionNum}) can be tagged. You selected revision
              #{selectedRevision?.RevisionNum}.
            </Alert>
          )}
          {isHeadRevision && (
            <Typography variant='body2' color='text.secondary'>
              Tagging head revision #{headRevisionNum}
            </Typography>
          )}
          <Autocomplete
            sx={{ pt: 1 }}
            size='small'
            freeSolo
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
            options={tagOptions}
            value={selectedOption}
            onChange={(_, newValue) => {
              if (typeof newValue === 'string') {
                setSelectedOption({
                  TagID: '',
                  DisplayName: newValue,
                  Slug: '',
                  isNew: true,
                });
              } else if (newValue?.isNew) {
                setSelectedOption({
                  TagID: '',
                  DisplayName: newValue.DisplayName,
                  Slug: '',
                  isNew: true,
                });
              } else {
                setSelectedOption(newValue);
              }
            }}
            filterOptions={(options, params) => {
              const filtered = filter(options, params);

              const { inputValue } = params;
              const exists = options.some(
                (option) => inputValue.toLowerCase() === option.DisplayName.toLowerCase(),
              );

              if (inputValue !== '' && !exists) {
                filtered.push({
                  TagID: '',
                  DisplayName: inputValue,
                  Slug: '',
                  isNew: true,
                });
              }

              return filtered;
            }}
            getOptionLabel={(option) => {
              if (typeof option === 'string') return option;
              return option.DisplayName;
            }}
            renderOption={(props, option) => (
              <li {...props} key={option.isNew ? `new-${option.DisplayName}` : option.TagID}>
                {option.isNew ? (
                  <Typography variant='body2'>
                    Create &quot;{option.DisplayName}&quot;
                  </Typography>
                ) : (
                  <Stack spacing={0.5}>
                    <Typography variant='body2'>{option.DisplayName}</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {option.Slug}
                    </Typography>
                  </Stack>
                )}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label='Tag'
                placeholder='Search or create a tag...'
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                  },
                }}
              />
            )}
            disabled={isTagging || !isHeadRevision}
          />
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
        }}
      >
        <Button onClick={handleClose} disabled={isTagging} variant='outlined'>
          Cancel
        </Button>
        <Button
          onClick={handleApplyTag}
          variant='contained'
          disabled={!selectedOption || isTagging || !isHeadRevision}
        >
          {isTagging ? 'Applying...' : 'Apply Tag'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
