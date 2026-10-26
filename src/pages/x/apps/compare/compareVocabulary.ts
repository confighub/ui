// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What one column of the comparison is called in the sentences the surface
 * says about it.
 *
 * Components compares one unit across the deployments of a Component; the
 * View explorer compares any Units. The grid is the same, so the words are
 * the only part that differs, and they come from here. The default is
 * Components' wording, so a page that sets nothing reads as it always has.
 */

import { createContext, useContext } from 'react';

export type CompareNoun = 'deployment' | 'Unit';

export interface CompareVocabularyValue {
  noun: CompareNoun;
}

export const DEPLOYMENT_VOCABULARY: CompareVocabularyValue = { noun: 'deployment' };
export const UNIT_VOCABULARY: CompareVocabularyValue = { noun: 'Unit' };

export const CompareVocabulary = createContext<CompareVocabularyValue>(DEPLOYMENT_VOCABULARY);

export function useCompareNoun(): CompareNoun {
  return useContext(CompareVocabulary).noun;
}

/** `deployments`, `Units`. */
export function pluralNoun(noun: CompareNoun): string {
  return `${noun}s`;
}
