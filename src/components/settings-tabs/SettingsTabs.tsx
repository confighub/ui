// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { SyntheticEvent, useEffect, useState } from 'react';

import { CmpProps } from '@/types';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

export interface ISettingsTabProps extends CmpProps {
  defaultValue?: number;
  tabs: Array<string | React.ReactNode>;
  /**
   * The value of each tab, which `defaultValue` and `onTabSelected` speak in. Absent, a tab's
   * value is its position; a page that inserts a tab between others gives the values so that a
   * tab keeps the value saved links use.
   */
  tabValues?: readonly number[];
  onTabSelected?: (newValue: number) => void;
}

export const SettingsTabs = ({
  onTabSelected,
  tabs,
  tabValues,
  defaultValue = 0,
  className,
}: ISettingsTabProps) => {
  const [value, setValue] = useState(defaultValue);

  const handleTabSelected = (_: SyntheticEvent, newValue: number) => {
    setValue(newValue);
    onTabSelected?.(newValue);
  };

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Box className={className} sx={{ bgcolor: 'background.paper', marginBottom: '10px' }}>
      <Tabs
        sx={{
          height: 45,
          minHeight: 45,
          p: 0,
          '& .MuiTab-root': {
            padding: '8px 16px',
          },
        }}
        value={value}
        onChange={handleTabSelected}
      >
        {tabs.map((tab, index) => (
          <Tab key={tabValues?.[index] ?? index} label={tab} value={tabValues?.[index] ?? index} />
        ))}
      </Tabs>
    </Box>
  );
};
