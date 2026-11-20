// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a mixed function run does (D38), said before and after it: how many Units run in your
 * change, which are left out and why, each change a link to its page.
 */
import { Fragment } from 'react';
import Box from '@mui/material/Box';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { PanelLink, PanelNotice } from './ChangeTrackParts';
import { monoSx } from './panelStyles';
import { plural, type ChangeName, type LeftOutUnit, type RunPlan } from './runPlan';

const linkSx = { '& a': { textDecoration: 'underline' } } as const;

function ChangeLink({ change, testId }: { change: ChangeName; testId: string }) {
  return (
    <PanelLink testId={testId} small wrap href={changeSetPath(change.space, change.slug)}>
      <Box component="span" sx={monoSx}>
        {change.slug}
      </Box>
    </PanelLink>
  );
}

/** "<SPACE/Unit> is in the change <Y>", for each left-out Unit, joined. */
function LeftList({ left, linkTestId }: { left: LeftOutUnit[]; linkTestId: string }) {
  return (
    <>
      {left.map((unit, i) => (
        <Fragment key={unit.unitId}>
          {i > 0 ? '; ' : ''}
          <Box component="span" sx={monoSx}>
            {unit.label}
          </Box>
          {unit.change ? (
            <>
              {' is in the ChangeSet '}
              <ChangeLink change={unit.change} testId={linkTestId} />
            </>
          ) : (
            ' is in another ChangeSet'
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Before the run, at the top of the function. */
export function RunPlanNote({ plan }: { plan: RunPlan }) {
  return (
    <PanelNotice severity="info" icon={false} data-testid="run-plan-note" sx={{ marginBottom: 2, color: tokens.t1, ...linkSx }}>
      <Box>
        {`${plan.run} of ${plural(plan.total, 'Unit')} run in your ChangeSet `}
        <ChangeLink change={plan.change} testId="run-plan-change-link" />.
      </Box>
      <Box>
        {`${plan.left.length} ${plan.left.length === 1 ? 'is' : 'are'} left out: `}
        <LeftList left={plan.left} linkTestId="run-plan-left-link" />, and one function run can write into only one ChangeSet.
      </Box>
    </PanelNotice>
  );
}

/** After the run, under its headline. */
export function RunLeftOut({ left }: { left: LeftOutUnit[] }) {
  return (
    <PanelNotice severity="warning" icon={false} data-testid="run-left-out" sx={{ marginTop: 1.5, color: tokens.t1, ...linkSx }}>
      <Box>
        <b>{`Left out (${left.length})`}</b>
        {': '}
        <LeftList left={left} linkTestId="run-left-link" />.
      </Box>
      <Box sx={{ color: tokens.t2, marginTop: '4px' }}>One function run can write into only one ChangeSet. Select that ChangeSet and run again to change it.</Box>
    </PanelNotice>
  );
}
