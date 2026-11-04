// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { useDownloadRevisionDataQuery, useListAllRevisionsQuery } from '@confighub/rtk-query';
import { skipToken } from '@reduxjs/toolkit/query';
import { parseAllDocuments } from 'yaml';

import type { GateField } from './gateModel';
import { releasedYaml } from './gateWrites';

/** The value at a dot path of one document; a numeric segment indexes a list. */
const valueAtPath = (doc: unknown, path: string): unknown => {
  let node: unknown = doc;
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node)
      ? node[Number(segment)]
      : (node as Record<string, unknown>)[segment];
  }
  return node;
};

/** The document of the resource the finding names, by its type and name, never by position. */
const resourceDocument = (data: string, field: GateField): unknown => {
  const docs = parseAllDocuments(data).map((d) => d.toJS() as Record<string, unknown> | null);
  const kind = field.resourceType?.split('/').pop();
  const name = field.resourceNameWithoutScope;
  return (
    docs.find((doc) => {
      const metadata = doc?.metadata as { name?: string } | undefined;
      return doc?.kind === kind && metadata?.name === name;
    }) ?? (docs.length === 1 ? docs[0] : undefined)
  );
};

/**
 * The value of a field in the Unit's last released Revision, as YAML text: what "Restore released
 * value" writes back. Undefined while it is read, or when the Unit has no released Revision.
 */
export const useReleasedValue = (
  field: GateField,
  releasedRevisionNum: number | undefined,
  enabled: boolean,
): { value?: string; isLoading: boolean } => {
  const want = enabled && releasedRevisionNum !== undefined && releasedRevisionNum > 0;
  const revisions = useListAllRevisionsQuery(
    want
      ? { where: `UnitID = '${field.unitId}' AND RevisionNum = ${releasedRevisionNum}` }
      : skipToken,
  );
  const revisionId = revisions.data?.[0]?.Revision?.RevisionID;
  const data = useDownloadRevisionDataQuery(
    want && revisionId
      ? { spaceId: field.spaceId, unitId: field.unitId, revisionId }
      : skipToken,
  );
  const value = useMemo(() => {
    if (!data.data) return undefined;
    try {
      const found = valueAtPath(resourceDocument(data.data, field), field.path);
      return found === undefined ? undefined : releasedYaml(found);
    } catch {
      return undefined;
    }
  }, [data.data, field]);
  return { value, isLoading: revisions.isLoading || data.isLoading };
};
