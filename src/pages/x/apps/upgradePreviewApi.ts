// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The upgrade merge preview: a dry-run `PATCH /unit?upgrade=true`.
 *
 * The generated `bulkPatchUnits` invalidates Unit, Revision, Mutation and
 * ChangeSet (see `invalidationMap.ts`), and a dry run through it does too,
 * although it writes nothing. On a Component with a hundred Deployments that
 * refetched every Unit and their data (several MB) on each click of a card
 * with changes to preview. This endpoint sends the same request and
 * invalidates nothing.
 *
 * The Content-Type is set here, not left to the shared `prepareHeaders`: that
 * sets merge-patch+json only for endpoint names with a patch prefix, and the
 * server rejects a PATCH /unit of any other type with HTTP 400.
 */
import {
  type BulkPatchUnitsApiArg,
  type BulkPatchUnitsApiResponse,
  confighubApi,
} from '@confighub/rtk-query';

type UpgradePreviewArg = Pick<BulkPatchUnitsApiArg, 'where' | 'include' | 'body'>;

const upgradePreviewApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    previewUnitUpgrade: build.mutation<BulkPatchUnitsApiResponse, UpgradePreviewArg>({
      query: (queryArg) => ({
        url: `/unit`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: queryArg.body,
        params: {
          where: queryArg.where,
          include: queryArg.include,
          upgrade: true,
          dry_run: true,
        },
      }),
    }),
  }),
  overrideExisting: false,
});

export const { usePreviewUnitUpgradeMutation } = upgradePreviewApi;
