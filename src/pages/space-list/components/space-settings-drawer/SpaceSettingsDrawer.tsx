// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { FullDetailsLink, SettingsDrawer } from '@/components/settings-drawer/SettingsDrawer';
import {
  SPACE_SETTINGS_INCLUDE,
  SpaceSettingsForm,
} from '@/pages/space-detail/components/space-settings/SpaceSettingsForm';
import { useGetSpaceQuery } from '@confighub/rtk-query';
import Typography from '@mui/material/Typography';

export interface SpaceSettingsDrawerProps {
  /** The Space to edit; the drawer is closed without one */
  spaceId: string | null;
  onClose: () => void;
}

/** Edits a Space's settings from the Space list, with a link to the Space's page. */
export const SpaceSettingsDrawer = ({ spaceId, onClose }: SpaceSettingsDrawerProps) => {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const { data, isFetching } = useGetSpaceQuery(
    { spaceId: spaceId || '', include: SPACE_SETTINGS_INCLUDE },
    { skip: !spaceId },
  );
  const space = data?.Space;

  const handleClose = () => {
    setServerError('');
    onClose();
  };

  return (
    <SettingsDrawer
      isOpen={!!spaceId}
      onClose={handleClose}
      backLabel='Back to Spaces'
      title={space?.Slug || 'Space'}
      entityId={spaceId || undefined}
      serverError={serverError}
      onServerErrorClosed={() => setServerError('')}
      isLoading={isFetching && data?.Space?.SpaceID !== spaceId}
      testId='space-settings-drawer'
    >
      {data && space?.SpaceID === spaceId ? (
        <SpaceSettingsForm
          extendedSpace={data}
          setServerError={setServerError}
          onSpaceUpdated={handleClose}
          onShowAppliedTriggers={() => navigate(`/spaces/${spaceId}?tab=1&triggers=applied`)}
          actions={<FullDetailsLink to={`/spaces/${spaceId}`} />}
        />
      ) : (
        <Typography color='text.secondary'>The Space was not found.</Typography>
      )}
    </SettingsDrawer>
  );
};
