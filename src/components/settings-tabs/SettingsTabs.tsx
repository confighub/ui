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
  onTabSelected?: (newValue: number) => void;
}

export const SettingsTabs = ({
  onTabSelected,
  tabs,
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
          <Tab key={index} label={tab} />
        ))}
      </Tabs>
    </Box>
  );
};
