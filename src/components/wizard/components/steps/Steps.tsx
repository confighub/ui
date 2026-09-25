// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React from 'react';

import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import { styled } from '@mui/material/styles';

import { CmpProps } from '../../../../types';
import { useWizardContext } from '../context/WizardContext';

const StepperContainer = styled(Stepper)`
  min-width: 20%;
  height: 100%;
`;

export interface StepsType {
  label: string | React.ReactNode;
  description?: string | React.ReactNode;
}

export interface StepsProps extends CmpProps {
  steps: Array<StepsType>;
  orientation: 'vertical' | 'horizontal';
}

export const Steps = ({ steps, className, orientation }: StepsProps) => {
  const { activeStep } = useWizardContext();
  return (
    <StepperContainer
      className={className}
      activeStep={activeStep as number}
      orientation={orientation}
    >
      {steps.map((step, index) => (
        <Step key={index}>
          <StepLabel>{step.label}</StepLabel>
          <StepContent>{step.description}</StepContent>
        </Step>
      ))}
    </StepperContainer>
  );
};
