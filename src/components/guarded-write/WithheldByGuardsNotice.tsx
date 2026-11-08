// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { NavLink } from '@/components/nav-link/NavLink';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

import { type GuardedChange, withheldSummary } from './guardedWrite';

/**
 * Says a write landed without some of its changes, because guards withheld them. A write that
 * did not all land must not read as one that did. The withheld changes stay on the Unit as
 * conflicts, which the Blame tab applies.
 */
export const WithheldByGuardsNotice = ({
  withheld,
  dryRun = false,
  blameHref,
  onClose,
}: {
  withheld: GuardedChange[];
  /** What a dry run found guards would withhold, which nothing has written yet. */
  dryRun?: boolean;
  /** The Blame tab of the Unit written, where the withheld changes can be applied. */
  blameHref?: string;
  onClose?: () => void;
}) => {
  if (withheld.length === 0) return null;
  const paths = [...new Set(withheld.map((change) => change.path || '(whole resource)'))];
  return (
    <Alert severity='warning' onClose={onClose} data-testid='withheld-by-guards'>
      <Typography variant='body2'>
        {`${withheldSummary(withheld, dryRun)}: ${paths.join(', ')}. `}
        {dryRun ? (
          'Running it for real asks whether to clear them'
        ) : blameHref ? (
          <NavLink to={blameHref} style={{ textDecoration: 'underline' }}>
            Apply them from the Blame tab
          </NavLink>
        ) : (
          'Apply them from the Blame tab of each Unit'
        )}
        .
      </Typography>
    </Alert>
  );
};
