// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { BulkMetadataDrawer } from '@/components/bulk-edit/BulkMetadataDrawer';
import { SectionCard } from '@/components/styled';
import { type Link, useBulkPatchLinksMutation } from '@confighub/rtk-query';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

/** What to set AutoUpdate to on every selected Link; empty leaves each as it is */
type AutoUpdateChoice = '' | 'on' | 'off';

export interface BulkEditLinksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The selected Links */
  links: Link[];
  /** Refetches the Links after a write */
  refresh?: () => void;
}

/** Sets AutoUpdate, labels and delete gates on every selected Link, wherever it is listed. */
export const BulkEditLinksDrawer = ({ isOpen, onClose, links, refresh }: BulkEditLinksDrawerProps) => {
  const [bulkPatchLinks] = useBulkPatchLinksMutation();
  const [autoUpdate, setAutoUpdate] = useState<AutoUpdateChoice>('');
  const entities = useMemo(
    () => links.flatMap((link) => (link.LinkID ? [{ ...link, id: link.LinkID }] : [])),
    [links],
  );
  const on = links.filter((link) => link.AutoUpdate).length;
  const now = [on > 0 ? `${on} on` : '', links.length - on > 0 ? `${links.length - on} off` : '']
    .filter(Boolean)
    .join(', ');

  return (
    <BulkMetadataDrawer
      isOpen={isOpen}
      onClose={onClose}
      refresh={refresh}
      entityName='Links'
      idColumn='LinkID'
      entities={entities}
      updatesDescription='Auto update, labels and delete gates'
      extraPatch={autoUpdate ? { AutoUpdate: autoUpdate === 'on' } : {}}
      onResetExtra={() => setAutoUpdate('')}
      extraCard={
        <SectionCard title='Auto Update'>
          <ToggleButtonGroup
            exclusive
            size='small'
            color='primary'
            value={autoUpdate}
            onChange={(_, value: AutoUpdateChoice | null) => value !== null && setAutoUpdate(value)}
            data-testid='bulk-link-auto-update'
          >
            <ToggleButton value=''>Leave as is</ToggleButton>
            <ToggleButton value='on'>On</ToggleButton>
            <ToggleButton value='off'>Off</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
            Now: {now}. A Link with Auto Update updates its From unit whenever its To unit changes; one without it
            waits for an upgrade. A Link of update type None cannot have it.
          </Typography>
        </SectionCard>
      }
      // The selection names each Link by ID, so a hidden one shown in the list is written too.
      patch={(where, body) => bulkPatchLinks({ where, body, includeHidden: '*' }).unwrap()}
    />
  );
};
