// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { useAppDispatch } from '@/hooks/useApp';
import { useEditableUnitData, useUploadUnitData } from '@/hooks/useUnitData';
import { setAlert } from '@/state/slices/alert';
import { getApiErrorMessage } from '@/utility/error-functions';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import Editor from '@monaco-editor/react';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';

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
  const unitId = unit?.Unit?.UnitID || '';

  // The configuration comes from the Unit's data endpoint, not the Unit.
  const {
    data: originalData,
    etag,
    isLoaded,
  } = useEditableUnitData(unit?.Unit?.SpaceID, unit?.Unit?.UnitID);

  // The configuration arrives after the Unit does, so the editor's buffer is seeded from
  // it rather than initialised with it: undefined means "not edited yet" and reads through
  // to whatever the endpoint served. The edit records which Unit it is of, so one made on
  // this Unit is not shown, or saved, as another's when the editor moves on.
  const [edit, setEdit] = useState<{ unitId: string; data: string } | undefined>(undefined);
  const editedData = edit?.unitId === unitId ? edit.data : undefined;
  const displayedData = editedData ?? originalData;

  // Check if there are unsaved changes
  const hasChanges = isLoaded && editedData !== undefined && editedData !== originalData;

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setEdit({ unitId, data: value || '' });
    },
    [unitId],
  );

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    try {
      // Configuration is written through the Unit's data endpoint. The Unit body has
      // nowhere to put one, so a metadata update cannot carry it. If-Match names the
      // configuration the edit started from, so the write is refused rather than landing
      // on anything else.
      await uploadUnitData({
        spaceId: unit?.Unit?.SpaceID || '',
        unitId,
        body: displayedData,
        'If-Match': etag || undefined,
      }).unwrap();
      setEdit(undefined);
    } catch (error) {
      dispatch(
        setAlert({
          type: 'error',
          message: getApiErrorMessage(error) || 'Failed to update unit',
          isOpen: true,
        }),
      );
    }
  }, [dispatch, displayedData, etag, hasChanges, unit?.Unit?.SpaceID, unitId, uploadUnitData]);

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
        {/* Mounted once this Unit's configuration has arrived: Monaco settles a model's line
            endings when it creates it, and one created empty saves CRLF. Keyed by the Unit so
            moving to another one starts a new model rather than editing this one's. */}
        {!isLoaded ? (
          <Typography sx={{ p: 2, color: theme.palette.grey[400] }} variant='body2'>
            Loading configuration…
          </Typography>
        ) : (
          <Editor
            key={unitId}
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
        )}
      </EditorContainer>
    </Box>
  );
};
