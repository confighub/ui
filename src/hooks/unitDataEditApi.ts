// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reading a Unit's configuration to edit it, together with the ETag to write the edit back with.
 *
 * An editor has to know which configuration it edited, not only which Unit it is on: the two
 * come from different requests, and while the page moves from one Unit to the next they can
 * disagree -- which, unchecked, saves one Unit's configuration over another's. The data
 * endpoint serves the configuration's DataHash as its ETag, and the upload takes it back as
 * If-Match, refusing the write with 409 when the stored configuration is not the one the edit
 * started from. The generated download returns only the body, so this one reads the header too.
 */
import { confighubApi } from '@confighub/rtk-query';
import { type FetchBaseQueryMeta } from '@reduxjs/toolkit/query';

export interface EditableUnitData {
  /** The configuration, exactly as stored. */
  data: string;
  /** The ETag the configuration was served with: its DataHash, quoted. */
  etag: string;
}

const unitDataEditApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    downloadEditableUnitData: build.query<
      EditableUnitData,
      { spaceId: string; unitId: string }
    >({
      query: ({ spaceId, unitId }) => ({
        url: `/space/${spaceId}/unit/${unitId}/data`,
      }),
      // The shared base query reads the octet-stream body as text, and an error as JSON. It
      // is typed without meta, but passes fetchBaseQuery's through, response headers included.
      transformResponse: (body: unknown, meta) => ({
        data: typeof body === 'string' ? body : '',
        etag: (meta as FetchBaseQueryMeta | undefined)?.response?.headers.get('ETag') ?? '',
      }),
      providesTags: ['Unit'],
    }),
  }),
  overrideExisting: false,
});

export const { useDownloadEditableUnitDataQuery } = unitDataEditApi;
