// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useGetSpaceQuery } from '@confighub/rtk-query';
import TextField from '@mui/material/TextField';

interface SpaceReleaseTargetFieldProps {
  spaceId?: string;
  /** The Unit is left out of its Space's Releases, so it has no release Target. */
  unreleasable?: boolean;
}

/**
 * A Unit's release Target, read-only. A Unit has no Target of its own: it is released to its
 * Space's release Target unless it is Unreleasable, so the Target is changed on the Space.
 */
export const SpaceReleaseTargetField = ({ spaceId, unreleasable = false }: SpaceReleaseTargetFieldProps) => {
  const { data, isFetching } = useGetSpaceQuery(
    { spaceId: spaceId ?? '', include: 'ReleaseTargetID' },
    { skip: !spaceId },
  );
  const releaseTarget = data?.ReleaseTarget;
  let value = '';
  if (!spaceId) value = 'Select a space first';
  else if (isFetching && !data) value = '';
  else if (unreleasable) value = 'None (Unreleasable)';
  else value = releaseTarget?.Slug ?? 'None (the space has no release Target)';

  return (
    <TextField
      fullWidth
      size='small'
      label='Release Target'
      value={value}
      helperText="Set on the space: units are released to their space's Target"
      slotProps={{ input: { readOnly: true } }}
      data-testid='unit-release-target'
    />
  );
};
