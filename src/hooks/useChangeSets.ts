// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import {
  type TagRead,
  useCreateTagMutation,
  useListTagsQuery,
} from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

export interface IUseChangeSetsProps {
  spaceID: string;
  id: string;
  setErrorMessage: (message: string[]) => void;
}

export interface IUseChangeSetResult {
  changesetTags: (TagRead | undefined)[];
  createTagError: FetchBaseQueryError | SerializedError | undefined;
  createTagSuccess: boolean;
  createTagAsync: (tagName: string) => Promise<TagRead>;

  isRestoring: boolean;
  selectedTag: string;
  restoreMode: RestoreMode;
  restoreTarget: RestoreType;
  rebaseFromChangeset: string;
  rebaseToChangeset: string;
  restoreTagName: string;

  setIsRestoring: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedTag: React.Dispatch<React.SetStateAction<string>>;
  setRestoreMode: React.Dispatch<React.SetStateAction<RestoreMode>>;
  setRestoreTarget: React.Dispatch<React.SetStateAction<RestoreType>>;
  setRebaseToChangeset: React.Dispatch<React.SetStateAction<string>>;
  setRebaseFromChangeset: React.Dispatch<React.SetStateAction<string>>;
  setRestoreTagName: React.Dispatch<React.SetStateAction<string>>;
}

export const RESTORE_MODE = {
  SIMPLE: 'simple',
  REBASE: 'rebase',
  SELECTIVE: 'selective',
} as const;

export type RestoreMode = (typeof RESTORE_MODE)[keyof typeof RESTORE_MODE];

export const RESTORE_TYPE = {
  CHANGESET: 'changeset',
  TAG: 'tag',
} as const;

export type RestoreType = (typeof RESTORE_TYPE)[keyof typeof RESTORE_TYPE];

export const useChangeSets = ({
  spaceID,
  id: _id, // eslint-disable-line @typescript-eslint/no-unused-vars
  setErrorMessage,
}: IUseChangeSetsProps): IUseChangeSetResult => {
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>(RESTORE_MODE.SIMPLE);
  const [restoreTarget, setRestoreTarget] = useState<RestoreType>(RESTORE_TYPE.CHANGESET);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [restoreTagName, setRestoreTagName] = useState('');
  const [rebaseFromChangeset, setRebaseFromChangeset] = useState<string>('');
  const [rebaseToChangeset, setRebaseToChangeset] = useState<string>('HEAD');

  const [createTag, { error: createTagError, isSuccess: createTagSuccess }] =
    useCreateTagMutation();

  // Fetch all tags in the space (not just changeset tags)
  const { changesetTags = [] } = useListTagsQuery(
    {
      spaceId: spaceID,
    },
    {
      skip: !spaceID,
      selectFromResult: (result) => ({
        changesetTags: result?.data?.map((extendedTag) => extendedTag.Tag).filter(Boolean),
      }),
    },
  );

  useApiErrorMessage(createTagError, createTagSuccess, (message: string) =>
    setErrorMessage([message]),
  );

  const createTagAsync = async (tagName: string): Promise<TagRead> => {
    // Step 1: Create rollback tag
    const response = await createTag({
      spaceId: spaceID,
      tag: {
        Slug: tagName.toLowerCase().replace(/\s+/g, '-'),
        DisplayName: tagName.trim(),
      },
    });

    if (response.data) {
      return response.data;
    } else {
      return {} as TagRead;
    }
  };

  return {
    changesetTags,
    createTagError,
    createTagSuccess,
    createTagAsync,

    isRestoring,
    setIsRestoring,
    restoreMode,
    setRestoreMode,
    restoreTarget,
    setRestoreTarget,
    selectedTag,
    setSelectedTag,
    restoreTagName,
    setRestoreTagName,
    rebaseFromChangeset,
    setRebaseFromChangeset,
    rebaseToChangeset,
    setRebaseToChangeset,
  };
};
