// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { Ellipses, SpaceSeparator } from '@/components/styled';
import { OUTPUT_TYPES } from '@/types';
import { FunctionResultItem } from '@/types';
import { EMPTY_OUTPUT } from '@/utility/constants';
import { getDiffStats } from '@/utility/diff-methods';
import { DiffEditor } from '@monaco-editor/react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { OutputType } from '../../types';
import { AttributeValueListTable } from '../attribute-value-table/AttributeValueListTable';
import { ResourceInfoListTable } from '../resource-info-list-table/ResourceInfoListTable';

export interface IResultEditorViewProps {
  item: FunctionResultItem;
  isMutating: boolean;
  outputType: OutputType;
  allTableData: unknown[];
  selectedIndex: number;
  height: number | string;
}

export const ResultEditorView = ({
  item,
  isMutating,
  outputType,
  allTableData,
  selectedIndex,
  height,
}: IResultEditorViewProps) => {
  const theme = useTheme();
  const stats = getDiffStats(item?.code || '', item?.diff || '');

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        backgroundColor: theme.palette.background.paper,
        p: 2,
        height,
        overflow: 'auto',
      }}
    >
      {/* Header with diff stats */}
      <Stack direction='row' spacing={1} alignItems='center' mb={2}>
        <Ellipses variant='subtitle1' fontWeight='medium' flex={1}>
          {item?.spaceName} <SpaceSeparator fontSize='medium' /> {item?.name}
        </Ellipses>

        {item.diff && (
          <Stack direction='row' spacing={1}>
            {stats.additions > 0 && (
              <Chip
                label={`+${stats.additions}`}
                size='small'
                color='success'
                variant='outlined'
              />
            )}
            {stats.deletions > 0 && (
              <Chip
                label={`-${stats.deletions}`}
                size='small'
                color='error'
                variant='outlined'
              />
            )}
            {stats.changes > 0 && (
              <Chip
                label={`~${stats.changes}`}
                size='small'
                color='warning'
                variant='outlined'
              />
            )}
          </Stack>
        )}
      </Stack>

      {/* Diff editor for mutations */}
      {isMutating && item?.diff && (
        <DiffEditor
          theme='vs-dark'
          original={item?.code || ''}
          modified={item.diff}
          language='yaml'
          options={{
            readOnly: true,
            renderSideBySide: true,
          }}
        />
      )}

      {/* YAML output type */}
      {outputType === 'YAML' && (
        <CodeEditor
          // @ts-expect-error - TODO: Fix typing
          value={allTableData?.[selectedIndex]?.Payload}
          language='yaml'
        />
      )}

      {/* Standard code editor */}
      {!isMutating && item?.code !== undefined && item.code !== EMPTY_OUTPUT && (
        <CodeEditor value={item.code || '# No output returned from function'} />
      )}
    </Box>
  );
};

export interface IResultTableViewProps {
  outputType: OutputType;
  data: unknown[];
}

export const ResultTableView = ({ outputType, data }: IResultTableViewProps) => {
  // Handle empty data - show message instead of trying to render table
  if (!data || data.length === 0) {
    return (
      <Container maxWidth='sm'>
        <Box
          display='flex'
          flexDirection='column'
          justifyContent='center'
          alignItems='center'
          minHeight='40vh'
          textAlign='center'
        >
          <Typography variant='h5' gutterBottom>
            No Results Available
          </Typography>
          <Typography variant='subtitle1' color='text.secondary' gutterBottom>
            In ConfigHub, configuration data is separate from the code that operates on it. A
            Function is a executable piece of code that operates on configuration data in
            Config Units that ConfigHub can invoke.
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
            <Link
              href='https://docs.confighub.com/background/entities/function/'
              target='_blank'
              rel='noopener noreferrer'
              underline='hover'
            >
              Read more about functions →
            </Link>
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Box>
      {outputType === OUTPUT_TYPES.ATTRIBUTE_VALUE_LIST && (
        <AttributeValueListTable data={data as never[]} />
      )}

      {(outputType === OUTPUT_TYPES.RESOURCE_INFO_LIST ||
        outputType === OUTPUT_TYPES.RESOURCE_LIST) && (
        <ResourceInfoListTable data={data as never[]} />
      )}
    </Box>
  );
};
