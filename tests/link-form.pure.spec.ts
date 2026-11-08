// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

import type { LinkRead } from '@confighub/rtk-query';

import {
  defaultLinkFormInput,
  formInputToLink,
  type LinkFormInput,
  linkToFormInput,
  linkTypeFields,
  referencedParameters,
} from '../src/pages/unit-detail/components/link-drawer/linkForm';
import { guardsNotCleared } from '../src/utility/clearance-functions';

const stored = (overrides: Partial<LinkRead>): LinkRead => ({
  LinkID: 'link-1',
  SpaceID: 'space-1',
  Slug: 'app-to-ns',
  DisplayName: 'app-to-ns',
  FromUnitID: 'unit-from',
  ToUnitID: 'unit-to',
  ToSpaceID: 'space-2',
  UpdateType: 'NeedsProvides',
  AutoUpdate: true,
  Version: 4,
  Stale: false,
  Hash: 'h',
  ...overrides,
} as LinkRead);

/** The form for a stored Link, with some values changed as a person would change them. */
const edited = (link: LinkRead, change: (input: LinkFormInput) => void): LinkFormInput => {
  const input = linkToFormInput(link);
  change(input);
  return input;
};

test('an edit adds guards and clearance and keeps what the form does not show', () => {
  const link = stored({
    UpdateType: 'TransformPaths',
    UpstreamLastMergedRevisionNum: 7,
    UpstreamGetters: [{ Name: 'tag', FunctionInvocation: { FunctionName: 'get-image-tag' } }],
    DownstreamPaths: [
      {
        Key: 'image',
        Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: 'default/app', ResourceNameWithoutScope: 'app' },
        Path: 'spec.template.spec.containers.?name=app.image',
        Expression: 'ghcr.io/x/app:{{.Params.tag}}',
        Evaluator: 'template',
        DataType: 'string',
        Parameters: ['tag'],
      },
    ],
  });

  const body = formInputToLink(
    edited(link, (input) => {
      input.Guards = [{ key: 'owner', value: 'transform-link' }];
      input.Clearance = [{ Key: 'owner', Operator: 'In', Values: 'transform-link, release' }];
    }),
    link,
  );

  expect(body.Guards).toEqual({ owner: 'transform-link' });
  expect(body.Clearance).toEqual([{ Key: 'owner', Operator: 'In', Values: ['transform-link', 'release'] }]);
  // Read from the stored Link rather than the form: the merge pointer, the getter, the Version.
  expect(body.UpstreamLastMergedRevisionNum).toBe(7);
  expect(body.UpstreamGetters).toEqual(link.UpstreamGetters);
  expect(body.Version).toBe(4);
  // The resource the row still names keeps the fields the form does not show.
  expect(body.DownstreamPaths?.[0].Resource?.ResourceNameWithoutScope).toBe('app');
  expect(body.DownstreamPaths?.[0].Parameters).toEqual(['tag']);
});

test('clearing a field in the form clears it on the Link', () => {
  const link = stored({
    Guards: { owner: 'platform' },
    Clearance: [{ Key: 'owner', Operator: 'Exists' }],
    WhereResource: "ConfigHub.ResourceType = 'v1/Namespace'",
  });
  const body = formInputToLink(
    edited(link, (input) => {
      input.Guards = [];
      input.Clearance = [];
      input.WhereResource = '  ';
    }),
    link,
  );
  expect(body.Guards).toBeUndefined();
  expect(body.Clearance).toBeUndefined();
  expect(body.WhereResource).toBeUndefined();
});

test('a create leaves off the fields the form hides for its type', () => {
  // A merge Link is not given Protect or Guards (a merge carries only inherited guards), and a
  // non-merge is not given Squash or WhereMutation, even when the form held them before its type
  // was changed.
  const merge = formInputToLink(
    {
      ...defaultLinkFormInput(),
      UpdateType: 'UpgradeUnit',
      Protect: true,
      Guards: [{ key: 'owner', value: 'x' }],
      Squash: true,
      WhereResource: 'x',
      Clearance: [{ Key: 'owner', Operator: 'Exists', Values: '' }],
    },
    { Slug: '', FromUnitID: 'a', ToUnitID: 'b', ToSpaceID: 's' },
  );
  expect(merge.Protect).toBeFalsy();
  expect(merge.Guards).toBeUndefined();
  expect(merge.Squash).toBe(true);
  // UpgradeUnit tracks the whole upstream Unit; WhereResource is MergeUnits'.
  expect(merge.WhereResource).toBeUndefined();
  expect(merge.Clearance).toEqual([{ Key: 'owner', Operator: 'Exists' }]);

  const none = formInputToLink(
    { ...defaultLinkFormInput(), UpdateType: 'None', AutoUpdate: true, Clearance: [{ Key: 'k', Operator: 'Exists', Values: '' }] },
    { Slug: '', FromUnitID: 'a', ToUnitID: 'b', ToSpaceID: 's' },
  );
  expect(none.AutoUpdate).toBe(false);
  expect(none.Clearance).toBeUndefined();

  expect(linkTypeFields('NeedsProvides').merge).toBe(false);
  expect(linkTypeFields('MergeUnits').whereResource).toBe(true);
  expect(linkTypeFields('Insert').oneNeededBinding).toBe(true);
});

test('an edit writes back the fields the form hides for its type as the Link has them', () => {
  // The form's idea of which fields a type takes is a copy of the server's rule, so a field it
  // hides is not cleared on that copy's word: what the server accepted is written back.
  const link = stored({ UpdateType: 'MergeUnits', Protect: true, Guards: { owner: 'platform' } });
  const body = formInputToLink(
    edited(link, (input) => {
      input.Squash = true;
    }),
    link,
  );
  expect(body.Squash).toBe(true);
  expect(body.Protect).toBe(true);
  expect(body.Guards).toEqual({ owner: 'platform' });
});

test("an Insert Link's binding names only the place to insert at", () => {
  const body = formInputToLink(
    {
      ...defaultLinkFormInput(),
      UpdateType: 'Insert',
      ManualBindings: [
        {
          Key: '',
          AttributeName: '',
          DataType: 'YAML',
          NeededResourceType: 'v1/ConfigMap',
          NeededResourceName: 'default/policy',
          NeededPath: 'data.policy\\.json',
          // Left from before the type was chosen; an Insert binding has no provided place.
          ProvidedResourceType: 'v1/Namespace',
          ProvidedResourceName: '/x',
          ProvidedPath: 'metadata.name',
        },
      ],
    },
    { Slug: '', FromUnitID: 'a', ToUnitID: 'b', ToSpaceID: 's' },
  );
  expect(body.ManualBindings).toEqual([
    {
      DataType: 'YAML',
      NeededResource: { ResourceType: 'v1/ConfigMap', ResourceName: 'default/policy' },
      NeededPath: 'data.policy\\.json',
    },
  ]);
});

test('a row added and left blank writes nothing', () => {
  const body = formInputToLink(
    {
      ...defaultLinkFormInput(),
      UpdateType: 'TransformPaths',
      UpstreamPaths: [{ Name: '', ResourceType: '', ResourceName: '', Path: '' }],
      DownstreamPaths: [
        { Key: '', ResourceType: '', ResourceName: '', Path: '', Expression: '', Evaluator: 'cel', DataType: 'int' },
      ],
    },
    { Slug: '', FromUnitID: 'a', ToUnitID: 'b', ToSpaceID: 's' },
  );
  expect(body.UpstreamPaths).toBeUndefined();
  expect(body.DownstreamPaths).toBeUndefined();
});

test('a display name that is only the slug is not kept as one', () => {
  expect(linkToFormInput(stored({ Slug: 'a', DisplayName: 'a' })).DisplayName).toBe('');
  expect(linkToFormInput(stored({ Slug: 'a', DisplayName: 'Namespace for the app' })).DisplayName).toBe(
    'Namespace for the app',
  );
});

test('the parameters of an expression are the upstream values it names', () => {
  expect(referencedParameters('{{.Params.repo}}:{{.Params.tag}}')).toEqual(['repo', 'tag']);
  expect(referencedParameters("params.replicas * 2 + size(params.zones)")).toEqual(['replicas', 'zones']);
  expect(referencedParameters('{{.UnitSlug}}')).toEqual([]);
});

test('guards a clearance does not cover are found as the server finds them', () => {
  const guards = { owner: 'transform-link', 'policy-exception': 'host-network' };
  expect(guardsNotCleared(guards, [{ Key: 'owner', Operator: 'In', Values: ['transform-link'] }])).toEqual([
    { Key: 'policy-exception', Value: 'host-network' },
  ]);
  expect(
    guardsNotCleared(guards, [
      { Key: 'owner', Operator: 'Exists' },
      { Key: 'policy-exception', Operator: 'NotIn', Values: ['capacity'] },
    ]),
  ).toEqual([]);
  // DoesNotExist forbids the key whatever else clears it, and is listed first.
  expect(
    guardsNotCleared(guards, [
      { Key: 'policy-exception', Operator: 'Exists' },
      { Key: 'owner', Operator: 'Exists' },
      { Key: 'owner', Operator: 'DoesNotExist' },
    ]),
  ).toEqual([{ Key: 'owner', Value: 'transform-link', Precondition: true }]);
  expect(guardsNotCleared({}, [])).toEqual([]);
});
