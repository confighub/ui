// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The fields of one attestation prerequisite, opened under its row in the
 * Prerequisites column the way a custom prerequisite's expression is.
 *
 * It reads in the order the requirement is evaluated: what is required (Type and
 * Count), of whom (Users, Groups, and whether one from each Group), with which
 * exceptions (authors, age, a Fail), and what it is for. Every field left blank
 * is the server's default, and the summary line above the editor says what that
 * default amounts to, so a reader never has to know the defaults to read the
 * requirement.
 */

import { Fragment, useEffect, useMemo, useRef } from 'react';

import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { useListGroupsQuery, useListUsersQuery } from '@confighub/rtk-query';

import { MAX_ATTESTATION_COUNT } from '../api/limits';
import { andJoin, isUuid, isValidAttestationType, isValidMaxAge, releasedBy, usedBy } from '../model';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';
import type { AttestationPrerequisite } from '../types';

/** What a User is called in a picker: their display name, else their username, else their slug. */
function userLabel(user: { DisplayName?: string; Username?: string; Slug: string }): string {
  return user.DisplayName?.trim() || user.Username?.trim() || user.Slug;
}

/**
 * The eligible Users, picked from the organisation's. A User already named but no
 * longer listed -- deactivated, say -- stays on the requirement and shows as the
 * start of its ID, since the server still counts it.
 */
function UserPicker({ value, nameOf, onChange }: {
  value: string[];
  nameOf: (userId: string) => string;
  onChange: (userIds: string[]) => void;
}) {
  const users = useListUsersQuery({});
  const { options, labels } = useMemo(() => {
    const labels = new Map<string, string>();
    for (const entry of users.data ?? []) {
      const user = entry.User;
      if (user?.UserID) labels.set(user.UserID, userLabel(user));
    }
    const options = [...labels.keys()].sort((a, b) => labels.get(a)!.localeCompare(labels.get(b)!));
    return { options, labels };
  }, [users.data]);

  return (
    <Autocomplete
      multiple
      size='small'
      options={options}
      value={value}
      loading={users.isLoading}
      getOptionLabel={(id) => labels.get(id) ?? nameOf(id)}
      onChange={(_, next) => onChange(next)}
      renderTags={(ids, getTagProps) =>
        ids.map((id, index) => (
          <Chip {...getTagProps({ index })} key={id} size='small' label={labels.get(id) ?? nameOf(id)} />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={value.length ? undefined : 'Anyone who may attest in the Space'}
          inputProps={{ ...params.inputProps, 'data-act': 'attusers' }}
        />
      )}
    />
  );
}

/**
 * The eligible Groups. The list offers the Groups the viewer belongs to, which are
 * the only ones the API lets them read by name; a Group they are not in is named
 * by pasting its ID, which is accepted as typed and shown as such.
 */
function GroupPicker({ value, onChange }: {
  value: string[];
  onChange: (groupIds: string[]) => void;
}) {
  const groups = useListGroupsQuery({});
  const { options, labels } = useMemo(() => {
    const labels = new Map<string, string>();
    for (const entry of groups.data ?? []) {
      const group = entry.Group;
      if (group?.GroupID) labels.set(group.GroupID, group.DisplayName?.trim() || group.Slug);
    }
    const options = [...labels.keys()].sort((a, b) => labels.get(a)!.localeCompare(labels.get(b)!));
    return { options, labels };
  }, [groups.data]);
  const labelOf = (id: string) => labels.get(id) ?? id;

  return (
    <Autocomplete
      multiple
      freeSolo
      size='small'
      options={options}
      value={value}
      loading={groups.isLoading}
      getOptionLabel={labelOf}
      onChange={(_, next) => onChange(next.map((v) => v.trim()).filter(Boolean))}
      renderTags={(ids, getTagProps) =>
        ids.map((id, index) => (
          <Chip
            {...getTagProps({ index })}
            key={id}
            size='small'
            color={isUuid(id) ? 'default' : 'error'}
            label={labelOf(id)}
            title={labels.has(id) ? id : undefined}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={value.length ? undefined : 'No Group: Users only, or anyone'}
          inputProps={{ ...params.inputProps, 'data-act': 'attgroups' }}
        />
      )}
    />
  );
}

function Check({ id, field, checked, disabled, onChange, children }: {
  id: string;
  field: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={`cpcheck${disabled ? ' off' : ''}`}>
      <input
        type='checkbox'
        data-act={`att-${field}`}
        data-id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function AttestationEditor({ api, a, nameOf }: {
  api: LoadedBuilderApi;
  a: AttestationPrerequisite;
  /** What a reader calls a User already named, read once for the whole column. */
  nameOf: (userId: string) => string;
}) {
  const wf = api.workflow;
  const used = [
    ...usedBy(wf, a.Name),
    ...releasedBy(wf, a.Name).map((stage) => `Releases in ${stage}`),
  ];
  const set = api.setAttestationField;
  const groups = a.FromGroupIDs ?? [];
  const type = a.Type ?? '';
  const badType = type.trim() !== '' && !isValidAttestationType(type.trim());
  const maxAge = a.MaxAge ?? '';
  const badMaxAge = maxAge.trim() !== '' && !isValidMaxAge(maxAge.trim());
  const count = a.Count ?? 0;
  const badCount = count < 0 || count > MAX_ATTESTATION_COUNT;

  const nameRef = useRef<HTMLInputElement | null>(null);
  const shouldFocus = api.focusCustomId === a.id;
  useEffect(() => {
    if (!shouldFocus) return;
    nameRef.current?.focus();
    nameRef.current?.select();
    api.clearFocusCustom();
  }, [shouldFocus, api]);

  return (
    <div className='cpedit' data-attestation-editor={a.id}>
      {used.length ? (
        <p className='cpglobal'>
          <span className='bang'>!</span>
          <span>
            {'Declared once, named wherever it applies: editing this changes it for '}
            {andJoin(used).map((u, i) =>
              u.sep !== undefined ? (
                <Fragment key={i}>{u.sep}</Fragment>
              ) : (
                <span className='mono' key={i}>
                  {u.item}
                </span>
              ),
            )}
            .
          </span>
        </p>
      ) : (
        <p className='cpglobal quiet'>
          <span className='bang'>i</span>
          <span>Named by nothing yet, so editing it changes nothing that runs.</span>
        </p>
      )}

      <label className='field'>
        <span className='flabel'>Name</span>
        <input
          className='input mono'
          ref={nameRef}
          data-act='attname'
          data-id={a.id}
          value={a.Name}
          onChange={(e) => api.setAttestationName(a.id, e.target.value)}
        />
        <span className='fhelp'>What a Stage, its Releases or Complete gates on.</span>
      </label>

      <div className='cppair'>
        <label className='field'>
          <span className='flabel'>Attestation type</span>
          <input
            className='input mono'
            data-act='atttype'
            data-id={a.id}
            value={type}
            placeholder='Approval'
            aria-invalid={badType || undefined}
            onChange={(e) => set(a.id, 'Type', e.target.value)}
          />
          {badType ? (
            <span className='ferr'>
              <span className='bang'>!</span>
              <span>Letters, digits, '-', '_' and '.', beginning and ending with a letter or digit.</span>
            </span>
          ) : (
            <span className='fhelp'>Which recorded Attestations count. Approval when blank.</span>
          )}
        </label>

        <label className='field'>
          <span className='flabel'>How many</span>
          <input
            className='input'
            type='number'
            min={1}
            max={MAX_ATTESTATION_COUNT}
            data-act='attcount'
            data-id={a.id}
            value={count > 0 ? count : ''}
            placeholder='1'
            disabled={Boolean(a.DistinctGroups && groups.length)}
            aria-invalid={badCount || undefined}
            onChange={(e) => set(a.id, 'Count', e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {badCount ? (
            <span className='ferr'>
              <span className='bang'>!</span>
              <span>Between 1 and {MAX_ATTESTATION_COUNT}.</span>
            </span>
          ) : (
            <span className='fhelp'>
              {a.DistinctGroups && groups.length
                ? 'One from each Group, so the count is the number of Groups.'
                : 'Distinct attesters with a Pass on each Revision.'}
            </span>
          )}
        </label>
      </div>

      <div className='field'>
        <span className='flabel'>From these Users</span>
        <UserPicker
          value={a.FromUserIDs ?? []}
          nameOf={nameOf}
          onChange={(ids) => set(a.id, 'FromUserIDs', ids)}
        />
      </div>

      <div className='field'>
        <span className='flabel'>Or members of these Groups</span>
        <GroupPicker value={groups} onChange={(ids) => set(a.id, 'FromGroupIDs', ids)} />
        <span className='fhelp'>
          The list offers your own Groups. Paste the ID of any other. Membership is read when the
          gate is evaluated, not when the Attestation was recorded.
        </span>
      </div>

      <Check
        id={a.id}
        field='distinct'
        checked={Boolean(a.DistinctGroups)}
        disabled={groups.length === 0}
        onChange={(on) => set(a.id, 'DistinctGroups', on || undefined)}
      >
        {'One attester from each of the Groups. '}
        <span className='fhelp' style={{ display: 'inline' }}>
          A User in several of them covers only one.
        </span>
      </Check>

      <Check
        id={a.id}
        field='authors'
        checked={Boolean(a.AllowAuthors)}
        onChange={(on) => set(a.id, 'AllowAuthors', on || undefined)}
      >
        {'Count an attester who wrote a Revision of the change. '}
        <span className='fhelp' style={{ display: 'inline' }}>
          Off by default: separation of duties is what approval exists to provide.
        </span>
      </Check>

      <Check
        id={a.id}
        field='ignorefail'
        checked={Boolean(a.IgnoreFail)}
        onChange={(on) => set(a.id, 'IgnoreFail', on || undefined)}
      >
        {'Count only passes. '}
        <span className='fhelp' style={{ display: 'inline' }}>
          Otherwise an unrevoked Fail from an eligible attester fails the requirement, however many
          passes there are.
        </span>
      </Check>

      <label className='field' style={{ marginTop: 10 }}>
        <span className='flabel'>No older than</span>
        <input
          className='input mono short'
          data-act='attmaxage'
          data-id={a.id}
          value={maxAge}
          placeholder='no limit'
          aria-invalid={badMaxAge || undefined}
          onChange={(e) => set(a.id, 'MaxAge', e.target.value)}
        />
        {badMaxAge ? (
          <span className='ferr'>
            <span className='bang'>!</span>
            <span>
              A positive duration such as <span className='mono'>72h</span> or{' '}
              <span className='mono'>1h30m</span>.
            </span>
          </span>
        ) : (
          <span className='fhelp'>
            An Attestation older than this does not count. A duration such as{' '}
            <span className='mono'>72h</span>.
          </span>
        )}
      </label>

      <label className='field'>
        <span className='flabel'>Description</span>
        <input
          className='input'
          data-act='attdesc'
          data-id={a.id}
          value={a.Description ?? ''}
          placeholder='What this requirement is for, in your words'
          onChange={(e) => set(a.id, 'Description', e.target.value)}
        />
        <span className='fhelp'>
          A promotion it holds up reports it by name, and a name is short enough to be cryptic. This
          is where the reason lives.
        </span>
      </label>

      <div className='cpfoot'>
        <button
          className='linkbtn'
          type='button'
          data-act='selcp'
          data-id=''
          onClick={() => api.toggleCustom('')}
        >
          Done
        </button>
        <button
          className='linkbtn'
          style={{ color: 'var(--bad)' }}
          type='button'
          data-act='rmattestation'
          data-id={a.id}
          onClick={() => api.removeAttestation(a.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
