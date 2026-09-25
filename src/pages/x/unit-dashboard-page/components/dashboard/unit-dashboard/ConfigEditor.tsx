// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {useCallback, useState} from 'react';

import { useAppDispatch } from '@/hooks/useApp';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
import { getApiErrorMessage } from '@/utility/error-functions';
import Editor from '@monaco-editor/react';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';
import { useUnitData, useUploadUnitData } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

export interface IConfigEditorProps {
  unit: ExtendedUnitRead;
  /** Callback when close button is clicked */
  onClose: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const EditorHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1, 2),
  backgroundColor: theme.palette.grey[900],
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const EditorContainer = styled(Box)({
  height: 'calc(100vh - 52px)',
  display: 'flex',
  flexDirection: 'column',
});

// ============================================================================
// COMPONENT
// ============================================================================

export const ConfigEditor = ({ unit, onClose }: IConfigEditorProps) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [uploadUnitData] = useUploadUnitData();

  // The configuration comes from the Unit's data endpoint, not the Unit.
  const { data: originalData } = useUnitData(unit?.Unit?.SpaceID, unit?.Unit?.UnitID);

  // The configuration arrives after the Unit does, so the editor's buffer is seeded from
  // it rather than initialised with it: undefined means "not edited yet" and reads through
  // to whatever the endpoint served.
  const [editedData, setEditedData] = useState<string | undefined>(undefined);
  const displayedData = editedData ?? originalData;

  // Check if there are unsaved changes
  const hasChanges = editedData !== undefined && editedData !== originalData;

  const handleEditorChange = useCallback((value: string | undefined) => {
    setEditedData(value || '');
  }, []);

  const handleSave = useCallback(async () => {
    try {
      // Configuration is written through the Unit's data endpoint. The Unit body has
      // nowhere to put one, so a metadata update cannot carry it.
      await uploadUnitData({
        spaceId: unit?.Unit?.SpaceID || '',
        unitId: unit?.Unit?.UnitID || '',
        body: displayedData,
      }).unwrap();
      setEditedData(undefined);
    } catch (error) {
      dispatch(
        setAlert({
          type: 'error',
          message: getApiErrorMessage(error) || 'Failed to update unit',
          isOpen: true,
        }),
      );
    }
  }, [dispatch, displayedData, unit?.Unit?.SpaceID, unit?.Unit?.UnitID, uploadUnitData]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Editor Header */}
      <EditorHeader>
        <Stack direction='row' spacing={2} alignItems='center'>
          <Typography
            variant='subtitle2'
            sx={{ color: theme.palette.grey[300], fontWeight: 600 }}
          >
            Editing: {unit?.Unit?.Slug || 'Configuration'}
          </Typography>
          {hasChanges && (
            <Typography variant='caption' sx={{ color: theme.palette.warning.main }}>
              • Unsaved changes
            </Typography>
          )}
        </Stack>
        <Stack direction='row' spacing={1}>
          <Button
            size='small'
            variant='contained'
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges}
            color='primary'
          >
            Save
          </Button>
          <Button
            size='small'
            variant='text'
            startIcon={<CloseIcon />}
            onClick={onClose}
            sx={{
              color: theme.palette.grey[300],
              borderColor: theme.palette.grey[700],
              '&:hover': {
                borderColor: theme.palette.grey[500],
                backgroundColor: theme.palette.grey[800],
              },
            }}
          >
            Close
          </Button>
        </Stack>
      </EditorHeader>

      {/* Monaco Editor */}
      <EditorContainer>
        <Editor
          height='100%'
          language='yaml'
          value={displayedData}
          onChange={handleEditorChange}
          theme='vs-dark'
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 14,
            wordWrap: 'on',
          }}
        />
      </EditorContainer>
    </Box>
  );
};
