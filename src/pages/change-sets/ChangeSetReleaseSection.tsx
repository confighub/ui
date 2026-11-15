// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSet page's Validation and Release sections, and the dialog that
 * confirms a Release (`changeSetRelease.ts` says what releasing a ChangeSet is).
 *
 * Validation is shown for every ChangeSet: a Release is refused while what it would
 * bundle has ValidationErrors, with a ChangeWorkflow or without one. Release is
 * shown only when a Space the ChangeSet changed has a release Target.
 *
 * A ChangeSet can span many Units and Spaces, so no list here is drawn in full: rows
 * show the first few and a button for the rest, and the Spaces of an outcome that
 * needs nothing are a short list of names behind "+M more". Only a refusal is a row
 * of its own, since its reason is what the reader acts on.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import {
  changeOrderInk,
  changeOrderStatus,
  changeOrderType,
} from '../change-orders/changeOrdersTokens';
import { MoreRowsButton, SpaceNameList } from '../change-orders/components/SpaceListing';
import { ValidationFailureLinks } from '../change-orders/components/ValidationNote';
import { useCappedRows } from '../change-orders/components/useCappedRows';
import {
  type ChangeSetRelease,
  type ChangeSetValidation,
  type ReleaseGroupKind,
  type ReleaseSpace,
  releaseGroups,
} from './changeSetRelease';

const bodySx = { fontSize: changeOrderType.size.body } as const;

const listed = (spaces: readonly ReleaseSpace[]) =>
  spaces.map((space) => ({ spaceId: space.spaceId, name: space.spaceSlug }));

/** The body of the Validation section. */
export function ChangeSetValidationSection({
  validation,
  open,
}: {
  validation: ChangeSetValidation;
  open: boolean;
}) {
  const what = open
    ? 'The head of each Unit the ChangeSet is open on, which is what closing it would leave each Unit at.'
    : 'The Revision of each Unit the ChangeSet ended on, which is what a Release of it bundles.';
  return (
    <Box data-testid='change-set-validation'>
      <Box sx={{ ...bodySx, color: changeOrderInk.muted, marginBottom: '10px' }}>
        {what} A Release is refused while any of them has ValidationErrors.
      </Box>
      <ValidationBody validation={validation} />
    </Box>
  );
}

function ValidationBody({ validation }: { validation: ChangeSetValidation }) {
  if (validation.status === 'loading')
    return <Box sx={{ ...bodySx, color: changeOrderInk.muted }}>Checking…</Box>;
  if (validation.status === 'failed') {
    return (
      <Box role='alert' sx={{ ...bodySx, color: changeOrderStatus.warn }}>
        The ValidationErrors could not be read.
      </Box>
    );
  }
  if (validation.unitCount === 0)
    return <Box sx={{ ...bodySx, color: changeOrderInk.muted }}>No Unit to validate yet.</Box>;
  if (validation.failures.length === 0) {
    return (
      <Box
        data-testid='change-set-validation-ok'
        sx={{ ...bodySx, color: changeOrderStatus.success }}
      >
        None of its {validation.unitCount === 1 ? 'Unit' : `${validation.unitCount} Units`} has
        ValidationErrors.
      </Box>
    );
  }
  return <FailureRows failures={validation.failures} />;
}

function FailureRows({
  failures,
}: {
  failures: Extract<ChangeSetValidation, { status: 'read' }>['failures'];
}) {
  const rows = useCappedRows(failures);
  return (
    <>
      <Box component='ul' sx={{ margin: 0, paddingLeft: '18px', ...bodySx }}>
        {rows.visible.map((failure) => (
          <li
            key={failure.unitId}
            data-testid={`change-set-validation-failure-${failure.slug}`}
          >
            <ValidationFailureLinks failure={failure} />
          </li>
        ))}
      </Box>
      <MoreRowsButton
        total={failures.length}
        more={rows.more}
        noun='Unit'
        onShow={rows.showAll}
      />
    </>
  );
}

const GROUP_TEXT: Record<Exclude<ReleaseGroupKind, 'refused'>, string> = {
  released: 'Released in',
  ready: 'Ready to release in',
  checking: 'Checking',
  noPermission: 'You may not publish a Release in',
};

/** A refused Space, by name, with the server's reason. */
function RefusedRows({ spaces }: { spaces: readonly ReleaseSpace[] }) {
  const rows = useCappedRows(spaces);
  return (
    <>
      {rows.visible.map((space) => (
        <Box
          key={space.spaceId}
          data-testid={`change-set-release-space-${space.spaceSlug}`}
          sx={{ ...bodySx, marginBottom: '6px' }}
        >
          <SpaceNameList spaces={listed([space])} />{' '}
          <Box
            component='span'
            sx={{
              color:
                space.status.kind === 'unknown'
                  ? changeOrderStatus.warn
                  : changeOrderStatus.danger,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {space.status.kind === 'refused'
              ? space.status.message
              : space.status.kind === 'unknown'
                ? `Could not check: ${space.status.message}`
                : ''}
          </Box>
        </Box>
      ))}
      <MoreRowsButton
        total={spaces.length}
        more={rows.more}
        noun='Space'
        onShow={rows.showAll}
      />
    </>
  );
}

/** One outcome's Spaces as a short list of names; a single released Space says which Release. */
function GroupLine({
  kind,
  spaces,
}: {
  kind: Exclude<ReleaseGroupKind, 'refused'>;
  spaces: readonly ReleaseSpace[];
}) {
  const only = spaces.length === 1 ? spaces[0] : undefined;
  const releaseNum =
    only?.status.kind === 'released' || only?.status.kind === 'unchanged'
      ? only.status.releaseNum
      : undefined;
  const tone =
    kind === 'released'
      ? changeOrderStatus.success
      : kind === 'ready'
        ? changeOrderInk.default
        : changeOrderInk.muted;
  return (
    <Box
      data-testid={`change-set-release-${kind}`}
      sx={{ ...bodySx, color: tone, marginBottom: '6px' }}
    >
      {GROUP_TEXT[kind]} <SpaceNameList spaces={listed(spaces)} />
      {releaseNum !== undefined ? ` as release ${releaseNum}` : ''}
      {only?.status.kind === 'unchanged' ? ', which already bundles exactly this' : ''}.
    </Box>
  );
}

/** The body of the Release section, for a ChangeSet that changed a Space with a release Target. */
export function ChangeSetReleaseSection({ release }: { release: ChangeSetRelease }) {
  if (release.status === 'none') return null;
  return (
    <Box data-testid='change-set-release'>
      <Box sx={{ ...bodySx, color: changeOrderInk.muted, marginBottom: '10px' }}>
        Releasing it publishes a Release in each Space with a release Target, bundling each of
        its Units at the Revision the ChangeSet ended on.
        {release.status === 'open' ? ' It can be released once it is closed.' : ''}
      </Box>
      <ReleaseBody release={release} />
    </Box>
  );
}

function ReleaseBody({ release }: { release: Exclude<ChangeSetRelease, { status: 'none' }> }) {
  if (release.status === 'loading')
    return <Box sx={{ ...bodySx, color: changeOrderInk.muted }}>Checking…</Box>;
  if (release.status === 'failed') {
    return (
      <Box
        role='alert'
        data-testid='change-set-release-failed'
        sx={{ ...bodySx, color: changeOrderStatus.warn }}
      >
        Whether it can be released could not be checked.
      </Box>
    );
  }
  if (release.status === 'open') {
    return (
      <Box sx={{ ...bodySx, color: changeOrderInk.muted }}>
        Spaces with a release Target: <SpaceNameList spaces={listed(release.spaces)} />
      </Box>
    );
  }
  return (
    <>
      {releaseGroups(release.spaces).map((group) =>
        group.kind === 'refused' ? (
          <RefusedRows key={group.kind} spaces={group.spaces} />
        ) : (
          <GroupLine key={group.kind} kind={group.kind} spaces={group.spaces} />
        ),
      )}
    </>
  );
}

/** Confirms publishing a Release in the Spaces that are ready. */
export function ReleaseChangeSetDialog({
  slug,
  spaces,
  releasing,
  error,
  onCancel,
  onConfirm,
}: {
  slug: string;
  spaces: readonly ReleaseSpace[];
  releasing: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onClose={releasing ? undefined : onCancel}
      maxWidth='xs'
      fullWidth
      data-testid='change-set-release-dialog'
    >
      <DialogTitle sx={{ fontSize: 16 }}>Release ChangeSet {slug}?</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: changeOrderType.size.prose, marginBottom: '8px' }}>
          This publishes a Release in{' '}
          {spaces.length === 1 ? 'Space' : `${spaces.length} Spaces`}{' '}
          <SpaceNameList spaces={listed(spaces)} plain />, bundling each Unit at the Revision
          the ChangeSet ended on. What is deployed from{' '}
          {spaces.length === 1 ? 'its release Target' : 'their release Targets'} changes to it.
        </Box>
        {error !== undefined ? (
          <Box
            role='alert'
            sx={{
              marginTop: '10px',
              ...bodySx,
              color: changeOrderStatus.danger,
              overflowWrap: 'anywhere',
            }}
          >
            {error}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button size='small' variant='outlined' onClick={onCancel} disabled={releasing}>
          Cancel
        </Button>
        <Button
          size='small'
          variant='contained'
          disabled={releasing}
          onClick={onConfirm}
          data-testid='change-set-release-confirm'
        >
          {releasing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Release'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
