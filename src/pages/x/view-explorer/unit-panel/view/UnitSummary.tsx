// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

import { ACTIONS_SECTION, DETAILS } from '../copy';
import { ActionList } from './ActionList';
import { GroupContextSection } from './GroupContextSection';
import { Section } from './parts';
import { PrimaryRow } from './PrimaryRow';
import { runnableActions, type UnitPanelModel } from './types';
import { LineList, VerdictBox } from './VerdictBox';

/**
 * The read of the Unit's own details, while it is on its way or when it
 * failed. The causes the row shows stay above it; what only the read can tell
 * (conflicts, a failed action, needs) is not known yet. A Unit read without
 * its Space's Component says so too, since Release cannot open without it.
 */
function DetailsState({ details }: { details: UnitPanelModel['details'] }) {
  const partial = details.status === 'ready' && details.componentError;
  if (details.status === 'ready' && !partial) return null;
  const loading = details.status === 'loading';
  return (
    <Box
      data-testid='vx-unit-details'
      data-state={partial ? 'partial' : details.status}
      aria-busy={loading || undefined}
      role={loading ? undefined : 'alert'}
      sx={{
        mt: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 34,
        px: 1.25,
        borderRadius: 'var(--r-sm)',
        border: 1,
        borderStyle: loading ? 'dashed' : 'solid',
        borderColor: 'grey.200',
        fontSize: 12.5,
        color: 'text.secondary',
      }}
    >
      {loading && <CircularProgress size={12} thickness={5} sx={{ color: 'text.disabled' }} aria-hidden />}
      <span>{loading ? DETAILS.loading : details.gone ? DETAILS.gone : partial ? DETAILS.componentError : DETAILS.error}</span>
      {!loading && !details.gone && (
        <Button size='small' onClick={details.retry} aria-label={DETAILS.retryName} sx={{ ml: 'auto', minWidth: 0, fontSize: 12, py: 0 }}>
          {DETAILS.retry}
        </Button>
      )}
    </Box>
  );
}

/**
 * The Summary tab of a Unit: the verdict with its causes and the primary
 * action, the other actions, and the Unit's group. A healthy Unit shows its
 * group before its actions, since the way on is the next Unit that needs
 * attention.
 */
export function UnitSummary({ model }: { model: UnitPanelModel }) {
  const { verdict, actions, links } = model;
  const primary = verdict.primary;
  // Going to the next problem belongs with the group; every other primary with the verdict.
  const primaryHere = primary && primary.id !== 'next-problem' ? primary : null;
  const primaryShown = !!primary && (primary.id === null || !!actions[primary.id]);
  const others = runnableActions(verdict.secondary, actions);
  const healthy = verdict.causes.length === 0;
  // Causes come in the order the headline picks from, so the first is the one it names.
  const lead = verdict.causes[0];

  const verdictSection = (
    // The first section is ranked in a problem state, primary or not; a healthy Unit's way on is its group's.
    <Section title={verdict.section} ranked={!healthy} testId='vx-unit-status'>
      <VerdictBox verdict={verdict} />
      <LineList
        lines={[...verdict.causes, ...verdict.facts]}
        actions={actions}
        links={links}
        lead={lead ? { key: lead.key, tone: verdict.tone } : undefined}
        testId='vx-unit-causes'
      />
      <DetailsState details={model.details} />
      {primaryHere && <PrimaryRow primary={primaryHere} actions={actions} links={links} />}
    </Section>
  );
  const group = model.group && (
    <GroupContextSection
      group={model.group}
      status={model.status}
      needsAttention={model.needsAttention}
      nextProblem={model.nextProblem}
      onGoTo={model.onGoTo}
      primary={primary}
      actions={actions}
      links={links}
    />
  );
  const actionSection = others.length > 0 && (
    <Section title={primaryShown ? ACTIONS_SECTION.withPrimary : ACTIONS_SECTION.alone} testId='vx-unit-other-actions'>
      <ActionList list={others} actions={actions} links={links} />
    </Section>
  );

  return (
    <Box data-testid='vx-unit-summary'>
      {verdictSection}
      {healthy ? group : actionSection}
      {healthy ? actionSection : group}
    </Box>
  );
}
