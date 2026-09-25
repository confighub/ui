// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ExtendedMutationRead, MutationInfo } from '@confighub/rtk-query';

// Helper function to create a unique key for mutation entries
const createMutationKey = (mutation: MutationInfo, path: string): string => {
  return `${mutation.Index || 0}-${path}`;
};

// Helper function to get filtered mutations for a specific tab and revision
export const getFilteredMutations = (
  pathMutationMap: Record<string, MutationInfo> | undefined,
  mutationDataDictionary: Record<number, ExtendedMutationRead> | undefined,
  revisionNum: number,
): Array<{ key: string; path: string; mutation: MutationInfo }> => {
  if (!pathMutationMap) return [];

  const seenMutations = new Set<string>();
  const filteredMutations: Array<{ key: string; path: string; mutation: MutationInfo }> = [];

  Object.entries(pathMutationMap).forEach(([path, mutation]) => {
    const mutationIndex = mutation?.Index || 0;
    const extendedMutation = mutationDataDictionary?.[mutationIndex];
    const mutationRevisionNum = extendedMutation?.Mutation?.RevisionNum || 0;

    // Only include mutations that match the current revision
    if (mutationRevisionNum === revisionNum) {
      // Create a unique identifier based on mutation index and revision
      const uniqueKey = `${mutationIndex}-${mutationRevisionNum}`;

      // Only add if we haven't seen this exact mutation before
      if (!seenMutations.has(uniqueKey)) {
        seenMutations.add(uniqueKey);
        filteredMutations.push({
          key: createMutationKey(mutation, path),
          path,
          mutation,
        });
      }
    }
  });

  return filteredMutations;
};
