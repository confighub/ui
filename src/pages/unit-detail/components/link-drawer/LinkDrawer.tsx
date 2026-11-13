// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// One Link's settings in a drawer: what it connects and how far it has merged, and the fields of
// its UpdateType to edit. The same form creates Links, from a Unit's Links tab or from the Unit
// list's Link action.
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { BackingUnitLink } from '@/components/backing-unit/BackingUnitLink';
import { clearanceToRows, rowsToClearance } from '@/components/clearance-field/clearanceRows';
import { DetailsFields } from '@/components/details-drawer/DetailsFields';
import { EntityDocumentDialog } from '@/components/entity-document/EntityDocumentDialog';
import { UnitRefSelect } from '@/components/entity-ref-select/UnitRefSelect';
import { rowsToMap } from '@/components/map-field-editor/map-rows';
import { NavLink } from '@/components/nav-link/NavLink';
import { SettingsDrawer } from '@/components/settings-drawer/SettingsDrawer';
import { SettingsFormFooter } from '@/components/settings-form-footer/SettingsFormFooter';
import { SectionCard } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAppDispatch } from '@/hooks/useApp';
import { setAlert } from '@/state/slices/alert';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import { clearanceCovering, guardText, guardsNotCleared } from '@/utility/clearance-functions';
import { isGoZeroTime } from '@/utility/datetime-utils';
import { getApiErrorMessage } from '@/utility/error-functions';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import {
  type ExtendedLinkRead,
  type ExtendedUnitRead,
  type Link,
  useCreateLinkMutation,
  useGetLinkDocumentQuery,
  useUpdateLinkDocumentMutation,
  useUpdateLinkMutation,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { unitConfigHref } from '../../unitDetailHrefs';
import {
  LINK_UPDATE_TYPES,
  type LinkEnd,
  type LinkFormInput,
  UPDATE_TYPE_DESCRIPTIONS,
  defaultLinkFormInput,
  formInputToLink,
  linkEnd,
  linkToFormInput,
  linkTypeFields,
} from './linkForm';
import {
  ManualBindingsCard,
  MergeCard,
  MetadataSections,
  ResolveCard,
  TransformPathsCard,
  WritesCard,
} from './LinkFormSections';
import { bindingRows } from './linkFormat';
import { ListTable } from './LinkTables';
import { MakeCurrentDialog } from './MakeCurrentDialog';


/**
 * What the drawer shows: a Link to edit, or the Links to create, one from each `from` Unit to each
 * `to` Unit. A create with no `to` picks the one upstream Unit in the drawer, and one with no
 * `from` the one downstream Unit.
 */
export type LinkDrawerSubject =
  | { mode: 'edit'; link: ExtendedLinkRead }
  | { mode: 'create'; from: LinkEnd[]; to?: LinkEnd[] };

export interface LinkDrawerProps {
  /** Nothing closes the drawer. */
  subject: LinkDrawerSubject | undefined;
  onClose: () => void;
  /** After the form created or saved the Links, which also closes the drawer. */
  onSaved?: () => void;
  /** After an edit that leaves the drawer open, such as one made as YAML. */
  onChanged?: () => void;
  backLabel?: string;
}

const endName = (end: LinkEnd) => (end.spaceSlug ? `${end.spaceSlug}/${end.unit.Slug}` : end.unit.Slug);

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const;

function UnitNavLink({ spaceId, unitId, name }: { spaceId?: string; unitId?: string; name: ReactNode }) {
  return spaceId && unitId ? (
    <NavLink to={unitConfigHref(spaceId, unitId)} style={linkStyle}>
      {name}
    </NavLink>
  ) : (
    <>{name}</>
  );
}

// A Unit the Links list could not include, such as one in a Space the user cannot read, is still
// linked to, but is not named by its ID.
const unitName = (spaceSlug: string | undefined, unitSlug: string | undefined): string =>
  unitSlug ? `${spaceSlug ? `${spaceSlug}/` : ''}${unitSlug}` : 'unknown Unit';

const formatTime = (value: string | undefined): string =>
  value && !isGoZeroTime(value) ? new Date(value).toLocaleString() : '';

const pairKey = (from: LinkEnd, to: LinkEnd) => `${from.unit.UnitID}>${to.unit.UnitID}`;

export const LinkDrawer = ({ subject, onClose, onSaved, onChanged, backLabel = 'Back to Links' }: LinkDrawerProps) => {
  const [serverError, setServerError] = useState('');
  const link = subject?.mode === 'edit' ? subject.link.Link : undefined;
  const creatingMany = subject?.mode === 'create' && subject.from.length * (subject.to?.length ?? 1) > 1;

  const close = () => {
    setServerError('');
    onClose();
  };

  return (
    <SettingsDrawer
      isOpen={subject !== undefined}
      onClose={close}
      backLabel={backLabel}
      title={link ? link.Slug || 'Link' : creatingMany ? 'New Links' : 'New Link'}
      entityId={link?.LinkID}
      serverError={serverError}
      onServerErrorClosed={() => setServerError('')}
      testId='link-drawer'
    >
      {subject && (
        <LinkForm
          // A different Link, or a different set to create, starts the form over.
          key={subject.mode === 'edit' ? subject.link.Link?.LinkID : 'create'}
          subject={subject}
          onError={setServerError}
          onSaved={() => {
            setServerError('');
            onSaved?.();
          }}
          onChanged={onChanged}
        />
      )}
    </SettingsDrawer>
  );
};

function LinkForm({
  subject,
  onError,
  onSaved,
  onChanged,
}: {
  subject: LinkDrawerSubject;
  onError: (message: string) => void;
  onSaved: () => void;
  onChanged?: () => void;
}) {
  const dispatch = useAppDispatch();
  const { trackEntityBulkCreated } = useAnalytics();
  const [updateLink] = useUpdateLinkMutation();
  const [createLink] = useCreateLinkMutation();
  const [editingDocument, setEditingDocument] = useState(false);
  const [makingCurrent, setMakingCurrent] = useState(false);
  const [pickedTo, setPickedTo] = useState<ExtendedUnitRead | null>(null);
  const [pickedFrom, setPickedFrom] = useState<ExtendedUnitRead | null>(null);
  // The pairs a create has already written, so trying again after some failed writes the rest.
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set());

  const extendedLink = subject.mode === 'edit' ? subject.link : undefined;
  const link = extendedLink?.Link;

  const { control, handleSubmit, reset, setValue, getValues, formState } = useForm<LinkFormInput>({
    defaultValues: link ? linkToFormInput(link) : defaultLinkFormInput(),
  });

  // The Links tab refetches its Links after a write, which returns new objects for unchanged
  // Links. Only another version of the Link replaces what the form shows, so an edit survives.
  const loadedVersion = useRef(link ? `${link.LinkID}:${link.Version}` : '');
  useEffect(() => {
    if (!link) return;
    const version = `${link.LinkID}:${link.Version}`;
    if (loadedVersion.current === version) return;
    loadedVersion.current = version;
    reset(linkToFormInput(link));
  }, [link, reset]);

  const updateType = useWatch({ control, name: 'UpdateType' });
  const guards = useWatch({ control, name: 'Guards' });
  const clearance = useWatch({ control, name: 'Clearance' });
  const takes = linkTypeFields(updateType);
  const notCleared = takes.protectAndGuards ? guardsNotCleared(rowsToMap(guards), rowsToClearance(clearance)) : [];

  const fromEnds = useMemo(() => {
    if (subject.mode !== 'create') return [];
    if (subject.from.length > 0) return subject.from;
    const end = pickedFrom ? linkEnd(pickedFrom) : undefined;
    return end ? [end] : [];
  }, [subject, pickedFrom]);
  const toEnds = useMemo(() => {
    if (subject.mode !== 'create') return [];
    if (subject.to) return subject.to;
    const end = pickedTo ? linkEnd(pickedTo) : undefined;
    return end ? [end] : [];
  }, [subject, pickedTo]);
  const pairs = fromEnds.flatMap((from) => toEnds.map((to) => ({ from, to })));

  // A transform Invocation runs on the upstream Unit, so it has to be of the upstream's toolchain.
  const upstreamToolchains = new Set(
    subject.mode === 'edit' ? [extendedLink?.ToUnit?.ToolchainType ?? ''] : toEnds.map((end) => end.unit.ToolchainType ?? ''),
  );
  const upstreamToolchain = upstreamToolchains.size === 1 ? [...upstreamToolchains][0] : '';

  const clearForGuards = () => {
    const forbidden = new Set(notCleared.filter((g) => g.Precondition).map((g) => g.Key));
    const kept = getValues('Clearance').filter((row) => !(row.Operator === 'DoesNotExist' && forbidden.has(row.Key.trim())));
    setValue('Clearance', [...kept, ...clearanceToRows(clearanceCovering(notCleared))], { shouldDirty: true });
  };

  // The guards the clearance does not cover are pointed out, with a fix, but not refused here: the
  // server decides, and its error names the guard and the clearance to add.
  const save = async (values: LinkFormInput) => {
    if (link) {
      try {
        await updateLink({ spaceId: link.SpaceID ?? '', linkId: link.LinkID ?? '', link: formInputToLink(values, link) }).unwrap();
        dispatch(setAlert({ message: `Saved Link ${values.Slug || link.Slug}.`, type: 'success', isOpen: true }));
        onSaved();
      } catch (e) {
        onError(`The Link was not saved. ${getApiErrorMessage(e, '')}`);
      }
      return;
    }

    if (pairs.length === 0) {
      onError(fromEnds.length === 0 ? 'Pick the downstream Unit to link from.' : 'Pick the upstream Unit to link to.');
      return;
    }
    const remaining = pairs.filter(({ from, to }) => !created.has(pairKey(from, to)));
    const results = await Promise.allSettled(
      remaining.map(({ from, to }) => {
        const base: Link = {
          Slug: '',
          FromUnitID: from.unit.UnitID ?? '',
          ToUnitID: to.unit.UnitID ?? '',
          ToSpaceID: to.unit.SpaceID ?? '',
        };
        const body = formInputToLink(values, base);
        // Several Links cannot share one name; each is named after its Units instead.
        if (pairs.length > 1) {
          body.Slug = '';
          body.DisplayName = undefined;
        }
        return createLink({ spaceId: from.unit.SpaceID ?? '', link: body }).unwrap();
      }),
    );
    const nowCreated = new Set(created);
    const failures: string[] = [];
    results.forEach((result, i) => {
      const { from, to } = remaining[i];
      if (result.status === 'fulfilled') nowCreated.add(pairKey(from, to));
      else failures.push(`${endName(from)} → ${endName(to)}: ${getApiErrorMessage(result.reason, 'unknown error')}`);
    });
    setCreated(nowCreated);
    const count = results.filter((r) => r.status === 'fulfilled').length;
    if (count > 0) trackEntityBulkCreated({ entity_type: ENTITY_TYPES.LINK, count });
    if (failures.length > 0) {
      onError(
        `${nowCreated.size} of ${pairs.length} Links were created. Not created:\n${failures.join('\n')}`,
      );
      return;
    }
    dispatch(
      setAlert({
        message: pairs.length === 1 ? 'Created the Link.' : `Created ${pairs.length} Links.`,
        type: 'success',
        isOpen: true,
      }),
    );
    onSaved();
  };

  const single = subject.mode === 'edit' || pairs.length <= 1;

  return (
    <Box component='form' onSubmit={handleSubmit(save)} data-testid='link-form'>
      <SectionCard title='Link'>
        <Stack spacing={2}>
          {extendedLink && link ? (
            <LinkFacts extendedLink={extendedLink} />
          ) : (
            <CreateEnds
              from={subject.mode === 'create' && subject.from.length > 0 ? subject.from : undefined}
              to={subject.mode === 'create' ? subject.to : undefined}
              pickedFrom={pickedFrom}
              onPickFrom={setPickedFrom}
              pickedTo={pickedTo}
              onPickTo={setPickedTo}
            />
          )}
          {subject.mode === 'create' && (
            <Controller
              name='UpdateType'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label='Update type'
                  size='small'
                  helperText={`${UPDATE_TYPE_DESCRIPTIONS[field.value]} It cannot be changed once the Link exists.`}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-update-type' } }}
                  sx={{ maxWidth: 420 }}
                >
                  {LINK_UPDATE_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}
          {single && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name='Slug'
                  control={control}
                  rules={{ pattern: { value: SLUG_PATTERN, message: SLUG_PATTERN_MESSAGE } }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label='Name'
                      size='small'
                      fullWidth
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message ?? 'Left blank, the Link is named after its Units.'}
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-slug' } }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller
                  name='DisplayName'
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label='Display name'
                      size='small'
                      fullWidth
                      helperText='Left blank, the name is shown.'
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                />
              </Grid>
            </Grid>
          )}
        </Stack>
      </SectionCard>

      <ResolveCard
        control={control}
        takes={takes}
        upstreamToolchain={upstreamToolchain}
        currentInvocationLabel={extendedLink?.TransformInvocation?.Slug}
      />
      <MergeCard control={control} takes={takes} />
      <ManualBindingsCard control={control} takes={takes} />
      <TransformPathsCard control={control} takes={takes} link={link} />
      <WritesCard control={control} takes={takes} notCleared={notCleared.map(guardText)} onClearGuards={clearForGuards} />
      {(link?.Bindings ?? []).length > 0 && (
        <SectionCard title='Bindings' badge={link?.Bindings?.length}>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
            What resolution matched: the needed paths of the downstream Unit, and the provided paths that set them.
          </Typography>
          <ListTable columns={['Attribute', 'Needed', 'Provided']} rows={bindingRows(link?.Bindings ?? [])} testId='link-bindings' />
        </SectionCard>
      )}
      <MetadataSections control={control} />

      <SettingsFormFooter
        actions={
          link && (
            <>
              {link.UpdateType !== 'None' && (
                <Tooltip
                  arrow
                  title={
                    formState.isDirty
                      ? 'Save or discard the edits first: making the Link current writes it.'
                      : 'Set the last merged revisions to the Units’ head revisions, without merging.'
                  }
                >
                  <span>
                    <Button
                      onClick={() => setMakingCurrent(true)}
                      disabled={formState.isDirty}
                      data-testid='link-make-current'
                    >
                      Make current
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Button onClick={() => setEditingDocument(true)} data-testid='link-edit-yaml'>
                Edit as YAML
              </Button>
            </>
          )
        }
      >
        <Button variant='contained' type='submit' disabled={formState.isSubmitting} data-testid='link-save'>
          {link ? 'Save' : single ? 'Create Link' : `Create ${pairs.length} Links`}
        </Button>
      </SettingsFormFooter>

      {makingCurrent && link && extendedLink && (
        <MakeCurrentDialog
          link={link}
          fromName={extendedLink.FromUnit?.Slug ?? 'the From unit'}
          toName={extendedLink.ToUnit?.Slug ?? 'the To unit'}
          onClose={() => setMakingCurrent(false)}
          onDone={() => {
            dispatch(setAlert({ message: `Made Link ${link.Slug} current.`, type: 'success', isOpen: true }));
            onChanged?.();
          }}
        />
      )}
      {editingDocument && link && (
        <LinkDocumentDialog
          link={link}
          onClose={() => setEditingDocument(false)}
          onSaved={() => onChanged?.()}
        />
      )}
    </Box>
  );
}

/** What an existing Link connects and where its merges have reached; none of it is edited here. */
function LinkFacts({ extendedLink }: { extendedLink: ExtendedLinkRead }) {
  const link = extendedLink.Link!;
  const from = extendedLink.FromUnit;
  const to = extendedLink.ToUnit;
  const fromSpace = extendedLink.Space?.Slug ?? link.SpaceSlug;
  const toSpace = extendedLink.ToSpace?.Slug;
  const merges = link.UpdateType !== 'None';
  return (
    <DetailsFields
      fields={[
        ['Update type', link.UpdateType],
        [
          'From unit',
          <UnitNavLink
            key='from'
            spaceId={from?.SpaceID ?? link.SpaceID}
            unitId={link.FromUnitID}
            name={unitName(fromSpace, from?.Slug)}
          />,
        ],
        [
          'To unit',
          <UnitNavLink
            key='to'
            spaceId={to?.SpaceID ?? link.ToSpaceID}
            unitId={link.ToUnitID}
            name={unitName(toSpace, to?.Slug)}
          />,
        ],
        ['Stale', link.Stale ? 'true — the upstream Unit has changes this Link has not taken' : ''],
        ['Upstream last merged revision', merges ? String(link.UpstreamLastMergedRevisionNum ?? 0) : ''],
        ['Downstream last merged revision', merges ? String(link.DownstreamLastMergedRevisionNum ?? 0) : ''],
        ['Hidden', link.HiddenReason],
        ['Backing Unit', link.BackingUnitID ? <BackingUnitLink key='backing' backingUnitId={link.BackingUnitID} /> : ''],
        ['Created', formatTime(link.CreatedAt)],
        ['Updated', formatTime(link.UpdatedAt)],
        ['Version', link.Version],
      ]}
    />
  );
}

/** The Units a create connects: given, or picked here. */
function CreateEnds({
  from,
  to,
  pickedFrom,
  onPickFrom,
  pickedTo,
  onPickTo,
}: {
  from?: LinkEnd[];
  to?: LinkEnd[];
  pickedFrom: ExtendedUnitRead | null;
  onPickFrom: (unit: ExtendedUnitRead | null) => void;
  pickedTo: ExtendedUnitRead | null;
  onPickTo: (unit: ExtendedUnitRead | null) => void;
}) {
  const names = (ends: LinkEnd[]) => ends.map(endName).join(', ');
  const given: Array<[string, ReactNode]> = [
    ...(from ? ([[from.length > 1 ? 'From units' : 'From unit', names(from)]] as Array<[string, ReactNode]>) : []),
    ...(to ? ([[to.length > 1 ? 'To units' : 'To unit', names(to)]] as Array<[string, ReactNode]>) : []),
  ];
  return (
    <Stack spacing={2}>
      {given.length > 0 && <DetailsFields fields={given} />}
      {!from && (
        <Box sx={{ maxWidth: 520 }}>
          <UnitRefSelect
            label='From unit'
            value={pickedFrom}
            onChange={onPickFrom}
            helperText='The downstream Unit, which the Link carries configuration to. The Link is created in its Space.'
            testId='link-from-unit'
          />
        </Box>
      )}
      {!to && (
        <Box sx={{ maxWidth: 520 }}>
          <UnitRefSelect
            label='To unit'
            value={pickedTo}
            onChange={onPickTo}
            helperText='The upstream Unit, whose configuration the Link carries to this one. It can be in any Space.'
            testId='link-to-unit'
          />
        </Box>
      )}
      <Typography variant='body2' color='text.secondary'>
        Configuration flows from the To unit (upstream) to the From unit (downstream). A Link is created in the From
        unit&apos;s Space.
      </Typography>
    </Stack>
  );
}

/** The Link's document in an editor, as `cub link edit` opens it, for the fields the form does not edit. */
function LinkDocumentDialog({ link, onClose, onSaved }: { link: Link; onClose: () => void; onSaved: () => void }) {
  const ids = { spaceId: link.SpaceID ?? '', linkId: link.LinkID ?? '' };
  const documentQuery = useGetLinkDocumentQuery(ids, { refetchOnMountOrArgChange: true });
  const [save, { isLoading }] = useUpdateLinkDocumentMutation();
  return (
    <EntityDocumentDialog
      title={`Edit ${link.Slug} as YAML`}
      description={
        <>
          The same document <code>cub link edit</code> opens: every field a write can set, with the Units it connects named
          rather than identified by ID.
        </>
      }
      document={documentQuery.data}
      readError={documentQuery.isError ? documentQuery.error : undefined}
      onSave={async (edit) => {
        await save({ ...ids, entityDocumentEdit: edit }).unwrap();
        onSaved();
      }}
      isSaving={isLoading}
      onClose={onClose}
      testId='link-document'
    />
  );
}
