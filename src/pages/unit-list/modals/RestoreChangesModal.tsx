// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { HoverCard } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { RESTORE_MODE, RESTORE_TYPE, useChangeSets } from '@/hooks/useChangeSets';
import {
  type ChangeSetRead,
  useBulkPatchUnitsMutation,
} from '@confighub/rtk-query';
import type { UnitRead } from '@confighub/rtk-query';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface IRestoreChangesModalProps {
  isRestoreChangesModalOpen: boolean;
  onRestoreChangesModalClosed: () => void;
  changeSet: ChangeSetRead;
  changeSets: ChangeSetRead[];
  units: UnitRead[];
  setErrorMessage: (message: string[]) => void;
  onRefresh?: () => void;
}

export const RestoreChangesModal = ({
  isRestoreChangesModalOpen,
  onRestoreChangesModalClosed,
  changeSet,
  changeSets,
  units,
  setErrorMessage,
  onRefresh,
}: IRestoreChangesModalProps) => {
  const spaceID = changeSet?.SpaceID || '';
  const id = changeSet?.ChangeSetID || '';

  const {
    changesetTags,
    isRestoring,
    setIsRestoring,
    restoreMode,
    setRestoreMode,
    restoreTarget,
    setRestoreTarget,
    selectedTag,
    setSelectedTag,
    rebaseFromChangeset,
    setRebaseFromChangeset,
    rebaseToChangeset,
    setRebaseToChangeset,
  } = useChangeSets({
    spaceID,
    id,
    setErrorMessage,
  });

  const [bulkPatchUnits, { error, isSuccess, data }] = useBulkPatchUnitsMutation();
  useBulkApiErrorMessage(error, isSuccess, data, setErrorMessage);

  // Filter out start and end tags from the tag dropdown
  const filteredTags = useMemo(() => {
    const startEndTagIds = new Set(
      changeSets.flatMap((cs) => [cs.StartTagID, cs.EndTagID].filter(Boolean)),
    );
    return changesetTags.filter((tag) => tag?.TagID && !startEndTagIds.has(tag.TagID));
  }, [changesetTags, changeSets]);

  // Changesets available for selective rebase (all changesets sorted by creation time)
  const availableChangesetsForRebase = useMemo(() => {
    return [...changeSets]
      .filter((cs) => cs?.ChangeSetID !== id) // Exclude current changeset
      .sort((a, b) => {
        const timeA = a?.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
        const timeB = b?.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
        return timeA - timeB;
      });
  }, [changeSets, id]);

  const handleRevert = async () => {
    // Validate based on restore target
    const isValid = units.length > 0 && (restoreTarget === 'changeset' ? !!id : !!selectedTag);

    if (!spaceID || !isValid) return;

    try {
      setIsRestoring(true);

      const unitIds = units.map((u) => `'${u?.UnitID}'`).join(',');

      // Build restore string based on target type
      const buildRestoreString = (useBeforePrefix: boolean) => {
        const prefix = useBeforePrefix ? 'Before:' : '';
        if (restoreTarget === RESTORE_TYPE.TAG) {
          return `${prefix}Tag:${selectedTag}`;
        }
        return `${prefix}ChangeSet:${id}`;
      };

      // For tag restore, always do simple restore (no rebase options)
      if (restoreTarget === RESTORE_TYPE.TAG || restoreMode === RESTORE_MODE.SIMPLE) {
        // Simple revert: restore to before the changeset/tag
        await bulkPatchUnits({
          where: `UnitID IN (${unitIds}) AND SpaceID = '${spaceID}'`,
          include: 'UnitEventID,TargetID,UpstreamUnitID,SpaceID',
          restore: buildRestoreString(true), // Before:ChangeSet:id or Before:Tag:id
          changeSetId: id,
          // @ts-expect-error TODO:
          body: JSON.stringify({}),
        });
      } else if (restoreMode === RESTORE_MODE.REBASE) {
        // Rebase mode: restore to before changeset/tag, then reapply subsequent changes
        await bulkPatchUnits({
          where: `UnitID IN (${unitIds}) AND SpaceID = '${spaceID}'`,
          include: 'UnitEventID,TargetID,UpstreamUnitID,SpaceID',
          mergeSource: 'Self',
          changeSetId: id,
          mergeBase: buildRestoreString(true), // Before:ChangeSet:id or Before:Tag:id
          mergeEnd: buildRestoreString(false), // ChangeSet:id or Tag:id
          // @ts-expect-error TODO:
          body: JSON.stringify({}),
        });
      } else {
        // Step 2b: Selectively rebase from specified changeset to specified end
        const mergeBaseSpec = rebaseFromChangeset
          ? `ChangeSet:${rebaseFromChangeset}`
          : buildRestoreString(true);
        const mergeEndSpec =
          rebaseToChangeset === 'HEAD' ? 'HeadRevisionNum' : `ChangeSet:${rebaseToChangeset}`;

        await bulkPatchUnits({
          where: `UnitID IN (${unitIds}) AND SpaceID = '${spaceID}'`,
          include: 'UnitEventID,TargetID,UpstreamUnitID,SpaceID',
          mergeSource: 'Self',
          changeSetId: id,
          mergeBase: mergeBaseSpec,
          mergeEnd: mergeEndSpec,
          // @ts-expect-error TODO:
          body: JSON.stringify({}),
        });
      }

      // Trigger refresh if callback is provided
      onRefresh?.();

      onRestoreChangesModalClosed();
      setRestoreMode(RESTORE_MODE.SIMPLE);
      setRestoreTarget(RESTORE_TYPE.CHANGESET);
      setSelectedTag('');
      setRebaseFromChangeset('');
      setRebaseToChangeset('HEAD');
    } catch (error) {
      console.error('Failed to revert changeset:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Dialog
      open={isRestoreChangesModalOpen}
      onClose={() => !isRestoring && onRestoreChangesModalClosed()}
      maxWidth='sm'
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
      <DialogTitle
        sx={{
          pb: 1,
          pt: 3,
          px: 3,
        }}
      >
        <Typography variant='h6' fontWeight={600}>
          Restore Strategy
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 1 }}>
        {/* Restore target selection (ChangeSet or Tag) */}
        <Box>
          <RadioGroup
            row
            value={restoreTarget}
            onChange={(e) => setRestoreTarget(e.target.value as 'changeset' | 'tag')}
          >
            <FormControlLabel
              value='changeset'
              control={<Radio size='small' />}
              label='Change Set'
              disabled={isRestoring}
              sx={{ mr: 3 }}
            />
            <FormControlLabel
              value='tag'
              control={<Radio size='small' />}
              label={`Tag${filteredTags.length > 0 ? ` (${filteredTags.length})` : ''}`}
              disabled={isRestoring || filteredTags.length === 0}
            />
          </RadioGroup>

          {restoreTarget === 'tag' && filteredTags.length > 0 && (
            <Autocomplete
              size='small'
              options={filteredTags}
              getOptionLabel={(option) => option?.DisplayName || option?.Slug || ''}
              value={filteredTags.find((tag) => tag?.TagID === selectedTag) || null}
              onChange={(_, value) => setSelectedTag(value?.TagID || '')}
              renderInput={(params) => (
                <TextField {...params} label='Select Tag' placeholder='Choose a tag...' />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option?.TagID}>
                  <Stack spacing={0.5}>
                    <Typography variant='body2'>
                      {option?.DisplayName || option?.Slug}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {option?.Slug}
                    </Typography>
                  </Stack>
                </li>
              )}
              disabled={isRestoring}
            />
          )}

          {restoreTarget === 'tag' && filteredTags.length === 0 && (
            <Typography variant='caption' color='text.secondary'>
              No tags are associated with this changeset.
            </Typography>
          )}
        </Box>

        {/* Revert mode selection - only show for changeset restore */}
        {restoreTarget === 'changeset' && (
          <Box sx={{ mb: 1, mt: 1 }}>
            <RadioGroup
              value={restoreMode}
              onChange={(e) => setRestoreMode(e.target.value as 'simple' | 'rebase')}
            >
              <HoverCard
                variant='outlined'
                onClick={() => !isRestoring && setRestoreMode('simple')}
                $enableHover
              >
                <FormControlLabel
                  value='simple'
                  control={<Radio size='small' sx={{ p: 0, mr: 1.5 }} />}
                  label={
                    <Box>
                      <Typography variant='body2' fontWeight={600} gutterBottom>
                        Simple Restore
                      </Typography>
                      <Typography variant='caption' color='text.secondary' display='block'>
                        Restore units to before this {restoreTarget}. Subsequent changes will
                        be discarded.
                      </Typography>
                    </Box>
                  }
                  disabled={isRestoring}
                  sx={{ width: '100%', m: 0 }}
                />
              </HoverCard>

              <HoverCard
                variant='outlined'
                onClick={() => !isRestoring && setRestoreMode('rebase')}
                $enableHover
              >
                <FormControlLabel
                  value='rebase'
                  control={<Radio size='small' sx={{ p: 0, mr: 1.5 }} />}
                  label={
                    <Box>
                      <Stack direction='row' spacing={1} alignItems='center' mb={0.5}>
                        <Typography variant='body2' fontWeight={600}>
                          Restore and Rebase
                        </Typography>
                      </Stack>
                      <Typography variant='caption' color='text.secondary' display='block'>
                        Restore to before this {restoreTarget}, then reapply later changes.
                        Preserves subsequent modifications.
                      </Typography>
                    </Box>
                  }
                  disabled={isRestoring}
                  sx={{ width: '100%', m: 0 }}
                />
              </HoverCard>

              <HoverCard
                variant='outlined'
                onClick={() => !isRestoring && setRestoreMode('selective')}
                $enableHover
              >
                <FormControlLabel
                  value='selective'
                  control={<Radio size='small' sx={{ p: 0, mr: 1.5 }} />}
                  label={
                    <Box>
                      <Stack direction='row' spacing={1} alignItems='center' mb={0.5}>
                        <Typography variant='body2' fontWeight={600}>
                          Selective Rebase
                        </Typography>
                        <Chip
                          label='Advanced'
                          size='small'
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 600,
                            backgroundColor: 'info.main',
                            color: 'white',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                      </Stack>
                      <Typography variant='caption' color='text.secondary' display='block'>
                        Choose exactly which changesets to reapply after reverting. Cherry-pick
                        specific changes.
                      </Typography>
                    </Box>
                  }
                  disabled={isRestoring}
                  sx={{ width: '100%', m: 0 }}
                />
              </HoverCard>
            </RadioGroup>
          </Box>
        )}

        {/* Selective rebase options */}
        {restoreTarget === 'changeset' && restoreMode === 'selective' && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant='caption'
              fontWeight={600}
              textTransform='uppercase'
              color='text.secondary'
              sx={{ mb: 1.5, display: 'block', letterSpacing: 0.5 }}
            >
              Rebase Range
            </Typography>
            <Stack spacing={2}>
              <Autocomplete
                size='small'
                options={availableChangesetsForRebase}
                getOptionLabel={(option) => option?.DisplayName || option?.Slug || ''}
                value={
                  availableChangesetsForRebase.find(
                    (cs) => cs?.ChangeSetID === rebaseFromChangeset,
                  ) || null
                }
                onChange={(_, value) => {
                  setRebaseFromChangeset(value?.ChangeSetID || '');
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder='Start from changeset (optional)'
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 1.5,
                      },
                    }}
                  />
                )}
                disabled={isRestoring}
              />
              <Autocomplete
                size='small'
                options={[
                  {
                    ChangeSetID: 'HEAD',
                    DisplayName: 'HEAD (Current)',
                    Slug: 'HEAD',
                  },
                  ...availableChangesetsForRebase,
                ]}
                getOptionLabel={(option) => option?.DisplayName || option?.Slug || ''}
                value={
                  rebaseToChangeset === 'HEAD'
                    ? {
                        ChangeSetID: 'HEAD',
                        DisplayName: 'HEAD (Current)',
                        Slug: 'HEAD',
                      }
                    : availableChangesetsForRebase.find(
                        (cs) => cs?.ChangeSetID === rebaseToChangeset,
                      ) || null
                }
                onChange={(_, value) => {
                  setRebaseToChangeset(value?.ChangeSetID || 'HEAD');
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder='Reapply up to changeset'
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 1.5,
                      },
                    }}
                  />
                )}
                disabled={isRestoring}
              />
            </Stack>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ mt: 1, display: 'block' }}
            >
              Leave "Start from" empty to start from the restored point. Use HEAD to reapply
              all subsequent changes.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
        }}
      >
        <Button
          onClick={() => {
            onRestoreChangesModalClosed();
            setRestoreMode('simple');
            setRestoreTarget('changeset');
            setSelectedTag('');
            setRebaseFromChangeset('');
            setRebaseToChangeset('HEAD');
          }}
          disabled={isRestoring}
          variant='outlined'
        >
          Cancel
        </Button>
        <Button onClick={handleRevert} variant='contained'>
          {isRestoring
            ? restoreTarget === 'tag'
              ? 'Restoring to Tag...'
              : restoreMode === 'selective'
                ? 'Selective Rebasing...'
                : restoreMode === 'rebase'
                  ? 'Reverting & Rebasing...'
                  : 'Reverting...'
            : restoreTarget === 'tag'
              ? 'Restore to Tag'
              : restoreMode === 'selective'
                ? 'Selective Rebase'
                : restoreMode === 'rebase'
                  ? 'Revert & Rebase'
                  : 'Revert Changeset'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
