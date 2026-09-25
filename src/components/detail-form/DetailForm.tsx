// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import CancelIcon from '@mui/icons-material/Cancel';
import EditIcon from '@mui/icons-material/Edit';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import { styled } from '@mui/material/styles';

import { AccordionHeader, BorderedAccordion, fadeIn } from '../../components/styled';
import { CmpProps } from '../../types';

const Container = styled('div')<{ $display: boolean }>`
  visibility: ${({ $display }) => ($display ? 'visible' : 'hidden')};
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  animation: ${fadeIn} 0.3s ease-in;
`;

const Form = styled('form')<{ $height: number }>`
  height: ${({ $height }) => $height}px;
  flex-grow: 1;
`;

const Footer = styled('div')<{ $visible: boolean }>`
  margin-top: auto;
  padding: 10px;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
`;

export interface IDetailFormProps extends CmpProps {
  display?: boolean;
  header?: string | React.ReactNode;
  onSubmit: () => void;
  disableSubmit?: boolean;
  setEditMode: (value: boolean) => void;
  editMode?: boolean;
  heightOffset?: number;
}

// TODO: Rework this or create a new one altogether.
export const DetailForm = ({
  className,
  children,
  display = true,
  header,
  onSubmit,
  disableSubmit = false,
  setEditMode,
  editMode = false,
  heightOffset = 278,
}: IDetailFormProps) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorHeight, setEditorHeight] = useState(window.innerHeight - heightOffset);
  const formRef = useRef<HTMLFormElement>(null);

  const updateEditorHeight = () => {
    const remainingHeight = window.innerHeight - heightOffset;
    setEditorHeight(remainingHeight);
  };

  useEffect(() => {
    setIsEditMode(editMode);
  }, [editMode]);

  useEffect(() => {
    updateEditorHeight();
    window.addEventListener('resize', updateEditorHeight);
    return () => {
      window.removeEventListener('resize', updateEditorHeight);
    };
  }, [heightOffset]);

  return (
    <Container className={className} $display={display}>
      <BorderedAccordion sx={{ marginBottom: '15px' }} className={className} expanded>
        <AccordionSummary
          sx={{
            '& .MuiAccordionSummary-root': {
              margin: 0,
            },

            '& .MuiAccordionSummary-content': {
              margin: 0,
            },

            '& .MuiAccordionSummary-content.Mui-expanded': {
              margin: 0,
            },
          }}
        >
          <AccordionHeader sx={{ display: 'flex', justifyContent: 'space-between' }}>
            {header}

            <Button
              startIcon={isEditMode ? <CancelIcon /> : <EditIcon />}
              variant='text'
              color='secondary'
              onClick={() => {
                setIsEditMode(!isEditMode);
                setEditMode(!isEditMode);
              }}
            >
              {isEditMode ? 'Cancel' : 'Edit'}
            </Button>
          </AccordionHeader>
        </AccordionSummary>
        <Divider />
        <AccordionDetails
          sx={{
            padding: '30px',
            overflow: 'auto',
          }}
        >
          <Form $height={editorHeight} onSubmit={onSubmit} ref={formRef}>
            {children}
          </Form>
        </AccordionDetails>
        <Divider />
        <Footer $visible={isEditMode}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Button
                variant='text'
                fullWidth
                onClick={() => {
                  setIsEditMode(false);
                  setEditMode(false);
                }}
                color='primary'
              >
                Cancel
              </Button>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Button
                disabled={disableSubmit}
                variant='contained'
                fullWidth
                onClick={() =>
                  formRef.current?.dispatchEvent(
                    new Event('submit', { cancelable: true, bubbles: true }),
                  )
                }
              >
                Save
              </Button>
            </Grid>
          </Grid>
        </Footer>
      </BorderedAccordion>
    </Container>
  );
};
