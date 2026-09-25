// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type Dispatch, type SetStateAction, useState } from 'react';

import { useAdvancedSearchQueryParams } from '@/hooks/useAdvancedSearchQueryParams';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  type ChangeSetRead,
  type ExtendedUnitRead,
  useListAllChangeSetsQuery,
  usePatchChangeSetMutation,
} from '@confighub/rtk-query';
import { FILTER_URL_PARAMS, VIEW_URL_PARAMS } from '@/utility/constants/url-params';

export interface IUseChangeSetWorkflowResult {
  // Data
  selectedChangeset: ChangeSetRead | null;
  openChangeSets: ChangeSetRead[];

  // State
  isCreateChangesetMode: boolean;
  setIsCreateChangesetMode: Dispatch<SetStateAction<boolean>>;

  isChangesetWorkflowMode: boolean;
  setIsChangesetWorkflowMode: Dispatch<SetStateAction<boolean>>;

  selectedChangesetId: string | null;
  setSelectedChangesetId: Dispatch<SetStateAction<string | null>>;

  selectedWorkflowTab: number;
  setSelectedWorkflowTab: Dispatch<SetStateAction<number>>;

  isChangesetEditMode: boolean;
  setIsChangesetEditMode: Dispatch<SetStateAction<boolean>>;

  editedChangesetSlug: string;
  setEditedChangesetSlug: Dispatch<SetStateAction<string>>;

  editedChangesetDescription: string;
  setEditedChangesetDescription: Dispatch<SetStateAction<string>>;

  changeSetError: Array<string>;
  setChangeSetError: Dispatch<SetStateAction<Array<string>>>;

  refetchChangeSets: () => void;
  handleToggleChangesetEditMode: () => void;

  onChangeSetSelected: (changeset: ChangeSetRead | null) => void;
  handleConfirmSaveChangeset: () => Promise<void>;

  refreshChangesets: boolean,
  setRefreshChangesets: Dispatch<SetStateAction<boolean>>;

  errorFormatter: (errorMessage: string) => void;
}

export interface IUseChangeSetWorkflowProps {
  setSelectedUnits: Dispatch<SetStateAction<string[]>>;
  setDefaultRowSelection: Dispatch<SetStateAction<number>>;
  units: ExtendedUnitRead[];
  setErrorMessage: Dispatch<SetStateAction<string[]>>;
}

export const useChangeSetWorkflow = ({
  setSelectedUnits,
  setDefaultRowSelection,
  units,
  setErrorMessage,
}: IUseChangeSetWorkflowProps): IUseChangeSetWorkflowResult => {
  // Changeset workflow state
  const [isCreateChangesetMode, setIsCreateChangesetMode] = useState(false);
  const [isChangesetWorkflowMode, setIsChangesetWorkflowMode] = useState(false);
  const [selectedChangesetId, setSelectedChangesetId] = useState<string | null>(null);
  const [selectedWorkflowTab, setSelectedWorkflowTab] = useState<number>(0);
  // The mode for editing the slug and description of a Change Set
  const [isChangesetEditMode, setIsChangesetEditMode] = useState(false);
  const [editedChangesetSlug, setEditedChangesetSlug] = useState('');
  const [editedChangesetDescription, setEditedChangesetDescription] = useState('');
  const [refreshChangesets, setRefreshChangesets] = useState(false);

  const [changeSetError, setChangeSetError] = useState<Array<string>>([]);

  const { clearSearchParams, updateSearchParams } = useAdvancedSearchQueryParams();

  const [patchChangeSet, { error: patchChangeSetError, isSuccess: isPatchChangeSetSuccess }] =
    usePatchChangeSetMutation();

  // Error handling for patch changeset mutations
  useApiErrorMessage(patchChangeSetError, isPatchChangeSetSuccess, (message: string) =>
    setChangeSetError([message]),
  );

  // Fetch open changesets
  const { data: openChangeSets = [], refetch: refetchChangeSets } = useListAllChangeSetsQuery(
    {
      // where: "State = 'Open'",
    },
    {
      selectFromResult: ({ data }) => ({
        data: data
          ?.map((cs) => cs.ChangeSet)
          .filter((cs): cs is NonNullable<typeof cs> => cs !== undefined),
      }),
      skip: !isChangesetWorkflowMode,
    },
  );

  const selectedChangeset =
    openChangeSets.find((cs) => cs.ChangeSetID === selectedChangesetId) || null;

  const errorFormatter = (errorMessage: string) => {
    if (isChangesetWorkflowMode) {
      if (Array.isArray(errorMessage)) {
        setChangeSetError(errorMessage);
      } else {
        setChangeSetError([errorMessage]);
      }
    } else {
      setErrorMessage([errorMessage]);
    }
  };

  const onChangeSetSelected = (changeset: ChangeSetRead | null) => {
    if (!changeset) {
      setSelectedWorkflowTab(0);
      setIsChangesetWorkflowMode(false);
      setSelectedChangesetId(null);
      setSelectedUnits([]);
      // Clear the changeset filter when exiting
      clearSearchParams();
      return;
    }

    setSelectedChangesetId(changeset.ChangeSetID || null);
    setIsChangesetWorkflowMode(true);

    // Apply filter to show only units in this changeset
    const changesetFilter = `ChangeSetID = '${changeset.ChangeSetID}'`;

    const urlParams: Record<string, string> = {
      [FILTER_URL_PARAMS.RESOURCE_TYPE]: '',
      [FILTER_URL_PARAMS.WHERE_DATA]: '',
      [FILTER_URL_PARAMS.WHERE]: changesetFilter || '',
      [FILTER_URL_PARAMS.SPACE_ID]: '',

      [VIEW_URL_PARAMS.VIEW_ID]: '',
      [VIEW_URL_PARAMS.GROUP_BY]: '',
      [VIEW_URL_PARAMS.ORDER_BY]: '',
      [VIEW_URL_PARAMS.ORDER_BY_DIRECTION]: '',
      [VIEW_URL_PARAMS.SPACE_ID]: '',
      [VIEW_URL_PARAMS.TYPE]: 'filter',
    };

    // Update URL params to filter by changeset ID
    updateSearchParams(urlParams);

    const selectedIds =
      units
        .filter((unit) => unit?.Unit?.ChangeSetID === changeset.ChangeSetID)
        ?.map((unit) => unit?.Unit?.UnitID || '') || [];

    setSelectedUnits(selectedIds);

    setDefaultRowSelection((prev) => prev + 1);

    // Switch to changeset details tab
    setSelectedWorkflowTab(0);
  };

  // Handler for toggling changeset edit mode
  const handleToggleChangesetEditMode = () => {
    if (isChangesetEditMode) {
      // Exiting edit mode - reset edited values
      setIsChangesetEditMode(false);
      setEditedChangesetSlug('');
      setEditedChangesetDescription('');
    } else {
      // Entering edit mode - initialize with current values
      setIsChangesetEditMode(true);
    }
  };

  // Handler for confirming save in modal
  const handleConfirmSaveChangeset = async () => {
    if (!selectedChangeset || !selectedChangeset.SpaceID || !selectedChangeset.ChangeSetID) {
      return;
    }

    try {
      await patchChangeSet({
        spaceId: selectedChangeset.SpaceID,
        changeSetId: selectedChangeset.ChangeSetID,
        // @ts-expect-error TODO:
        body: JSON.stringify({
          Slug: editedChangesetSlug.trim(),
          DisplayName: editedChangesetSlug.trim(),
          Description: editedChangesetDescription,
        }),
      });

      // Close modal and exit edit mode
      setIsChangesetEditMode(false);
      setEditedChangesetSlug('');
      setEditedChangesetDescription('');

      // Refetch changesets to show updated data
      refetchChangeSets();
    } catch (error) {
      console.error('Failed to update changeset:', error);
      errorFormatter('Failed to update changeset');
    }
  };

  return {
    // Data
    selectedChangeset,
    openChangeSets,

    // State
    isCreateChangesetMode,
    setIsCreateChangesetMode,
    isChangesetWorkflowMode,
    setIsChangesetWorkflowMode,
    selectedChangesetId,
    setSelectedChangesetId,
    selectedWorkflowTab,
    setSelectedWorkflowTab,
    isChangesetEditMode,
    setIsChangesetEditMode,
    editedChangesetSlug,
    setEditedChangesetSlug,
    editedChangesetDescription,
    setEditedChangesetDescription,
    changeSetError,
    setChangeSetError,
    refetchChangeSets,
    refreshChangesets,
    setRefreshChangesets,
    onChangeSetSelected,

    // Other Handlers
    handleToggleChangesetEditMode,
    handleConfirmSaveChangeset,
    errorFormatter,
  };
};
