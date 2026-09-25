// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

interface ExpandedStates {
  isGeneralExpanded: boolean;
  isConfigureExpanded: boolean;
}

export const useExpandedStates = () => {
  const [expandedStates, setExpandedStates] = useState<ExpandedStates>({
    isGeneralExpanded: true,
    isConfigureExpanded: true,
  });

  const toggleExpanded = (key: keyof ExpandedStates) => {
    setExpandedStates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return { expandedStates, toggleExpanded };
};
