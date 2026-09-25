// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React from 'react';

export type WizardContextType = {
  activeStep: number;
  completed?: boolean;
};

export const WizardContext = React.createContext<WizardContextType | Record<string, unknown>>(
  {},
);

if (process.env.NODE_ENV !== 'production') {
  WizardContext.displayName = 'WizardContext';
}

export function useWizardContext(): WizardContextType | Record<string, unknown> {
  return React.useContext(WizardContext);
}
