// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { FC, useMemo } from 'react';

import styled from 'styled-components';

import { CmpPropsWithChildren } from '../../types/';
import { WizardContext } from './components/context/WizardContext';
import { Step } from './components/step/Step';
import { Steps } from './components/steps/Steps';

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  padding-top: 30px;
  width: 80%;
`;

export interface WizardProps
  extends CmpPropsWithChildren,
    React.HTMLAttributes<HTMLDivElement> {
  activeStep: number;
  completed?: boolean;
  totalSteps: number;
}

export interface WizardComponent extends FC<WizardProps> {
  Steps: typeof Steps;
  Step: typeof Step;
}

export const Wizard: WizardComponent = ({
  activeStep,
  className,
  completed,
  totalSteps,
  children,
  ...rest
}) => {
  const contextValue = useMemo(
    () => ({
      activeStep,
      completed,
      totalSteps,
    }),
    [activeStep, completed, totalSteps],
  );

  return (
    <WizardContext.Provider value={contextValue}>
      <Container className={className} {...rest}>
        {children}
      </Container>
    </WizardContext.Provider>
  );
};

Wizard.Steps = Steps;
Wizard.Step = Step;
