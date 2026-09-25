// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { AccordionHeader, Aside } from '@/components/styled';
import { type RevisionRow } from '@/types';
import TableChartIcon from '@mui/icons-material/TableChart';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useRevisionDataMap } from '@/hooks/useUnitData';

export const Container = styled(Box)`
  display: flex;
  flex-direction: row;
`;

export const Main = styled(Box)`
  width: 75%;
`;

const RevisionPanel = styled(Box)`
  border: 1px solid rgba(224, 224, 224, 1);
  background-color: white;
  border-radius: 8px;
  margin-bottom: 15px;
  width: 100%;
`;

const RevisionHeader = styled(Box)`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  min-height: 48px;
`;

const RevisionContent = styled(Box)`
  display: flex;
  justify-content: space-between;
  padding: 0;
`;

export interface IRevisionsTreeViewProps {
  revisionsRows: Array<RevisionRow>;
  toolchainType?: string;
  onViewToggle: () => void;
}

export const sectionOffset = 260;

// TODO: Not quite ready yet but a good poc for other places...
export const RevisionsTreeView = ({
  revisionsRows,
  toolchainType,
  onViewToggle,
}: IRevisionsTreeViewProps) => {
  const [selectedRevisionId, setSelectedRevisionId] = useState(revisionsRows[0]?.Revision?.RevisionID);
  // Every Revision the tree can show is fetched in one request.
  const { dataFor } = useRevisionDataMap(revisionsRows.map((r) => r.Revision?.RevisionID));
  const currentData = dataFor(selectedRevisionId);
  const [editorHeight, setEditorHeight] = useState(window.innerHeight - sectionOffset);

  const updateEditorHeight = () => {
    const remainingHeight = window.innerHeight - sectionOffset;
    setEditorHeight(remainingHeight);
  };

  useEffect(() => {
    updateEditorHeight();
    window.addEventListener('resize', updateEditorHeight);
    return () => {
      window.removeEventListener('resize', updateEditorHeight);
    };
  }, []);

  return (
    <Container>
      <RevisionPanel>
        <RevisionHeader>
          <AccordionHeader
            sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
          >
            <Typography variant='h6'>Revisions</Typography>
            <Button variant='text' color='secondary' onClick={onViewToggle}>
              <TableChartIcon />
            </Button>
          </AccordionHeader>
        </RevisionHeader>
        <Divider />
        <RevisionContent>
          <Aside sx={{ p: 2, backgroundColor: 'hsla(215, 15%, 97%, 0.5)' }}>
            <SimpleTreeView defaultExpandedItems={['revisions']}>
              <TreeItem itemId='revisions' label='Revisions' color='text.primary'>
                {revisionsRows?.map((revision) => (
                  <TreeItem
                    key={revision.id}
                    itemId={revision?.id || ''}
                    label={revision.Revision?.Description || 'Revision'}
                    color='text.secondary'
                    onClick={() => {
                      setSelectedRevisionId(revision.Revision?.RevisionID);
                    }}
                  />
                ))}
              </TreeItem>
            </SimpleTreeView>
          </Aside>
          <Main>
            <CodeEditor
              value={currentData}
              toolchainType={toolchainType}
              height={editorHeight}
            />
          </Main>
        </RevisionContent>
      </RevisionPanel>
    </Container>
  );
};
