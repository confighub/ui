// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Suspense, lazy, useState } from 'react';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { Section } from '@/components/styled';
import { BorderedAccordion, fadeIn } from '@/components/styled';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useUnitData, useUploadUnitData } from '@/hooks/useUnitData';
import { UnitRead } from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import CancelIcon from '@mui/icons-material/Cancel';
import EditIcon from '@mui/icons-material/Edit';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { LastChangeDescriptionModal } from '../components/last-change-description-modal/LastChangeDescriptionModal';

// Monaco (plus monaco-yaml and its workers) is the heaviest dependency on this
// page. Loading it dynamically keeps it out of the initial chunk; it's fetched
// the first time someone opens the Config tab.
const CodeEditor = lazy(() =>
  import('@/components/code-editor/CodeEditor').then((m) => ({ default: m.CodeEditor })),
);

const Container = styled('div')`
  width: 100%;
  height: 100%;
  animation: ${fadeIn} 0.3s ease-in;
`;

const Header = styled('div')`
  margin-left: 10px;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const YamlEditor = styled(CodeEditor)`
  width: 100%;
  height: 100%;
`;

const Footer = styled('div')<{ $isVisible: boolean }>`
  margin-top: auto;
  padding: 10px;
  visibility: ${({ $isVisible }) => ($isVisible ? 'visible' : 'hidden')};
`;

const ContentContainer = styled(AccordionDetails)`
  padding: 0;
  background-color: white;
  overflow: auto;
  height: calc(100vh - 312px);
`;

export interface ConfigEditorTabProps {
  unit: UnitRead;
  onConfigUpdated: () => void;
  selectedTab: number;
}

export const CONFIG_TAB_ID = 1;

/**
 * ConfigTab component provides a code editor interface for editing configuration data
 */
export const ConfigTab = ({ unit, onConfigUpdated, selectedTab }: ConfigEditorTabProps) => {
  // State
  const [isEditMode, setIsEditMode] = useState(false);
  const [isShowLastChangeDescriptionModalOpen, setIsShowLastChangeDescriptionModalOpen] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [configData, setConfigData] = useState<string>('');

  // Unit data can run to megabytes; decode only when it actually changes.
  const { data: decodedData } = useUnitData(unit.SpaceID, unit.UnitID);

  // API Hooks
  const [uploadUnitData, { error, isSuccess }] = useUploadUnitData();

  // Error Handling
  useApiErrorMessage(error, isSuccess, setErrorMessage, {
    onSuccess: () => {
      onConfigUpdated();
      setIsEditMode(false);
    },
  });

  // Event Handlers
  const handleLastChangedDescription = async (lastChangeDescription: string) => {
    setIsShowLastChangeDescriptionModalOpen(false);

    // The configuration goes to the data endpoint; the change description is metadata.
    await uploadUnitData({
      spaceId: unit.SpaceID!,
      unitId: unit.UnitID!,
      body: configData,
      lastChangeDescription,
    }).unwrap();
  };

  const onToggleEditMode = (toggleEdit: boolean) => {
    setIsEditMode(toggleEdit);
  };

  return (
    <Section $display={selectedTab === CONFIG_TAB_ID} $direction={Direction.FadeIn}>
      {selectedTab === CONFIG_TAB_ID && (
        <>
          <ErrorBox sx={{ mb: 1 }} error={errorMessage} onClose={() => setErrorMessage('')} />

          <Container>
            <BorderedAccordion sx={{ marginBottom: '15px' }} expanded>
              {/* Header Section */}
              <AccordionSummary>
                <Header>
                  <Typography variant='h6'>{unit.ToolchainType} Configuration</Typography>
                  <Stack direction='row' spacing={1}>
                    {/* Edit Mode Toggle Button */}
                    <Button
                      startIcon={isEditMode ? <CancelIcon /> : <EditIcon />}
                      variant='text'
                      color='secondary'
                      onClick={() => onToggleEditMode(!isEditMode)}
                    >
                      {isEditMode ? 'Cancel' : 'Edit'}
                    </Button>
                  </Stack>
                </Header>
              </AccordionSummary>
              <Divider />
              {/* Main Content Area */}
              <ContentContainer>
                {/* Raw YAML editing  */}
                <Suspense
                  fallback={
                    <Typography sx={{ p: 2 }} variant='body2' color='text.secondary'>
                      Loading editor…
                    </Typography>
                  }
                >
                  <YamlEditor
                    value={decodedData}
                    toolchainType={unit.ToolchainType ?? undefined}
                    onCodeChanged={(value) => {
                      setConfigData(value);
                    }}
                    canEdit={isEditMode}
                  />
                </Suspense>
              </ContentContainer>

              <Divider />

              {/* Footer with Save/Cancel Buttons */}
              <Footer $isVisible={isEditMode}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Button
                      variant='text'
                      fullWidth
                      onClick={() => onToggleEditMode(!isEditMode)}
                      color='primary'
                      size='small'
                    >
                      Cancel
                    </Button>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Button
                      variant='contained'
                      fullWidth
                      onClick={() => {
                        // Show change description modal
                        setIsShowLastChangeDescriptionModalOpen(true);
                      }}
                    >
                      Save
                    </Button>
                  </Grid>
                </Grid>
              </Footer>
            </BorderedAccordion>

            {/* Last Change Description Modal */}
            <LastChangeDescriptionModal
              isOpen={isShowLastChangeDescriptionModalOpen}
              onClose={() => setIsShowLastChangeDescriptionModalOpen(false)}
              onSubmit={handleLastChangedDescription}
            />
          </Container>
        </>
      )}
    </Section>
  );
};
