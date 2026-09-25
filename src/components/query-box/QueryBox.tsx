// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FocusEvent, useEffect, useState } from 'react';

import SearchIcon from '@mui/icons-material/Search';
import { TextField } from '@mui/material';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid2';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

const Container = styled('div')``;

export interface IQueryBoxProps {
  onQueryApplied: (query: string) => void;
  onChange?: (query: string) => void;
  quickFilters?: React.ReactElement;
  query?: string;
  placeholder?: string;
}

export const QueryBox = ({
  onQueryApplied,
  onChange,
  quickFilters,
  placeholder = `Labels.foo ='bar' AND CreatedAt > '2025-02-18T23:16:34'`,
  query = '',
}: IQueryBoxProps) => {
  const [currentQuery, setCurrentQuery] = useState<string>('');

  useEffect(() => {
    if (query) {
      setCurrentQuery(query);
    }
  }, [query]);

  return (
    <Grid container sx={{ marginBottom: '10px' }}>
      <Grid size={{ xs: 12 }}>
        <Container>
          <FormControl
            sx={() => ({
              '& .MuiInputBase-root': {
                height: '36px',
                // width: '50%',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                // backgroundColor: 'rgba(0, 0, 0, 0.08)',
              },
            })}
            size='small'
            fullWidth
          >
            <TextField
              data-testid='query-box'
              variant='outlined'
              size='small'
              placeholder={placeholder}
              value={currentQuery}
              onChange={(event) => {
                setCurrentQuery(event.target.value);
                onChange?.(event.target.value);
              }}
              onBlur={(event: FocusEvent<HTMLInputElement>) => {
                onQueryApplied(event.target.value);
              }}
              onKeyUp={(event) => {
                if (event.key === 'Enter') {
                  onQueryApplied(currentQuery);
                }
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position='start'>
                    <Divider sx={{ height: 28, m: 0.5 }} orientation='vertical' />
                    <SearchIcon
                      sx={{ cursor: 'pointer' }}
                      onClick={() => {
                        onQueryApplied(currentQuery);
                      }}
                    />
                  </InputAdornment>
                ),
              }}
              fullWidth
            />
          </FormControl>
        </Container>
      </Grid>
      {quickFilters && (
        <Tooltip title='Query unit details.' placement='top' arrow>
          {quickFilters}
        </Tooltip>
      )}
    </Grid>
  );
};
