// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { EntityDocumentDialog } from '@/components/entity-document/EntityDocumentDialog';
import { type TriggerRead, useGetTriggerDocumentQuery, useUpdateTriggerDocumentMutation } from '@confighub/rtk-query';

/** The Trigger's document in an editor, as `cub trigger edit` opens it, for every field a write can set. */
export function TriggerDocumentDialog({
  trigger,
  onClose,
  onSaved,
}: {
  trigger: TriggerRead;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const ids = { spaceId: trigger.SpaceID ?? '', triggerId: trigger.TriggerID ?? '' };
  const documentQuery = useGetTriggerDocumentQuery(ids, { refetchOnMountOrArgChange: true });
  const [save, { isLoading }] = useUpdateTriggerDocumentMutation();
  return (
    <EntityDocumentDialog
      title={`Edit ${trigger.Slug} as YAML`}
      description={
        <>
          The same document <code>cub trigger edit</code> opens: every field a write can set, with the entities it refers
          to named rather than identified by ID.
        </>
      }
      document={documentQuery.data}
      readError={documentQuery.isError ? documentQuery.error : undefined}
      onSave={async (edit) => {
        await save({ ...ids, entityDocumentEdit: edit }).unwrap();
        onSaved?.();
      }}
      isSaving={isLoading}
      onClose={onClose}
      testId='trigger-document'
    />
  );
}
