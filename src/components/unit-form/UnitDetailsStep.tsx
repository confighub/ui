// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FieldPath, UseFormReturn } from 'react-hook-form';

import { SlugNameField } from '@/components/form-fields';
import {
  IAddLabelInput,
  PropertyType,
} from '@/components/forms/add-label-modal/AddLabelModal';
import { LabelsAccordion } from '@/components/labels/LabelsAccordion';
import { SpaceRead, TargetRead, Unit } from '@confighub/rtk-query';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid2';
import { SelectChangeEvent } from '@mui/material/Select';

import { SpaceSelector } from './SpaceSelector';
import { TargetSelector } from './TargetSelector';
import { ToolchainSelector } from './ToolchainTypeSelector';

interface UnitDetailsStepProps {
  form: UseFormReturn<Unit>;
  spaces?: SpaceRead[];
  selectedSpaceID: string;
  selectedToolchainType: string;
  onSpaceSelected: (event: SelectChangeEvent<string>) => void;
  onToolchainTypeSelected: (event: SelectChangeEvent<string>) => void;
  targets: TargetRead[];
  onLabelDeleted: (label: IAddLabelInput, type?: PropertyType) => void;
  setLabelModalIsOpen: (open: boolean) => void;
  setIsAddAnnotationsModalOpen: (open: boolean) => void;
  disable?: boolean;
  onNext: () => void;
  showTargetRequired?: boolean;
  nameLabel?: string;
  showBasicDetailsHeader?: boolean;
}

export const UnitDetailsStep = ({
  form,
  spaces,
  selectedSpaceID,
  onSpaceSelected,
  onToolchainTypeSelected,
  selectedToolchainType,
  targets,
  onLabelDeleted,
  setLabelModalIsOpen,
  setIsAddAnnotationsModalOpen,
  disable,
  onNext,
  showTargetRequired = false,
  nameLabel = 'Unit Name',
}: UnitDetailsStepProps) => {
  const {
    control,
    formState: { errors },
    watch,
    setValue,
  } = form;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <SlugNameField
          control={control}
          errors={errors}
          fieldName={'Slug' as FieldPath<Unit>}
          label={nameLabel}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <SpaceSelector
          control={control}
          errors={errors}
          spaces={spaces}
          selectedSpaceID={selectedSpaceID}
          onSpaceSelected={onSpaceSelected}
          showInGrid={false}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <ToolchainSelector
          control={control}
          errors={errors}
          selectedToolchainType={selectedToolchainType}
          onToolchainTypeSelected={onToolchainTypeSelected}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <TargetSelector
          control={control}
          errors={errors}
          targets={targets}
          setValue={setValue}
          required={showTargetRequired}
          showHelpText={showTargetRequired}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <LabelsAccordion
          onLabelAddClicked={() => setLabelModalIsOpen(true)}
          onLabelDeleted={onLabelDeleted}
          labels={watch('Labels') || {}}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <LabelsAccordion
          onLabelAddClicked={() => setIsAddAnnotationsModalOpen(true)}
          onLabelDeleted={(value) => onLabelDeleted(value, 'Annotations')}
          type='Annotations'
          labels={watch('Annotations') || {}}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Button disabled={disable} variant='contained' onClick={onNext} fullWidth>
          Next
        </Button>
      </Grid>
    </Grid>
  );
};
