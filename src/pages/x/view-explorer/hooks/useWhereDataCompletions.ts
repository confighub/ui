// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { authFetch } from '@/auth/session';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useLazyListAllUnitsQuery,
} from '@confighub/rtk-query';
import yaml from 'js-yaml';

type CompletionContext = 'path' | 'operator' | 'value' | 'conjunction' | 'none';

interface ParseResult {
  context: CompletionContext;
  partial: string;
  currentField: string;
  precedingClause: string;
}

const ALL_OPERATORS = ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IN', 'NOT IN'];

/** Max number of units to sample for path extraction */
const SAMPLE_SIZE = 10;
/** Max depth for path extraction */
const MAX_DEPTH = 6;

/**
 * Recursively extract dot-notation paths from a parsed YAML/JSON object.
 */
function extractPaths(obj: unknown, prefix: string, depth: number, out: Set<string>) {
  if (depth > MAX_DEPTH) return;
  if (obj === null || obj === undefined) return;

  if (Array.isArray(obj)) {
    // Add wildcard path for array
    if (prefix) out.add(`${prefix}.*`);
    // Sample first element for structure
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      extractPaths(obj[0], prefix ? `${prefix}.*` : '*', depth + 1, out);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      if (typeof val === 'object' && val !== null) {
        extractPaths(val, path, depth + 1, out);
      }
    }
  }
}

/**
 * Lightweight parser for WhereData clause context (same grammar as Where, but paths are data paths).
 */
function parseContext(text: string): ParseResult {
  const trimmed = text.trimEnd();

  if (!trimmed) {
    return { context: 'path', partial: '', currentField: '', precedingClause: '' };
  }

  const segments = trimmed.split(/\bAND\b/i);
  const lastSegment = segments[segments.length - 1].trim();
  const precedingClause = segments
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' AND ');

  if (!lastSegment) {
    return { context: 'path', partial: '', currentField: '', precedingClause };
  }

  // Complete condition → suggest conjunction
  const completeCondition = /^([\w.*?~]+(?:\.[\w.*?~=]+)*)\s+(=|!=|ILIKE|LIKE|NOT LIKE|NOT IN|IN|<|>|<=|>=)\s+('.+'|\d+|true|false)$/i;
  if (completeCondition.test(lastSegment)) {
    return { context: 'conjunction', partial: '', currentField: '', precedingClause };
  }

  // Value being typed (after opening quote)
  const valueStarted = /^([\w.*?~]+(?:\.[\w.*?~=]+)*)\s+(=|!=|ILIKE|LIKE|NOT LIKE|NOT IN|IN|<|>|<=|>=)\s+'([^']*)$/i;
  const valueMatch = valueStarted.exec(lastSegment);
  if (valueMatch) {
    return { context: 'value', partial: valueMatch[3], currentField: valueMatch[1], precedingClause };
  }

  // Operator complete, value next
  const operatorComplete = /^([\w.*?~]+(?:\.[\w.*?~=]+)*)\s+(=|!=|ILIKE|LIKE|NOT LIKE|NOT IN|IN|<|>|<=|>=)\s*$/i;
  const opMatch = operatorComplete.exec(lastSegment);
  if (opMatch) {
    return { context: 'value', partial: '', currentField: opMatch[1], precedingClause };
  }

  // Path token being typed
  const pathPartial = /^([\w.*?~]+(?:\.[\w.*?~=]*)*)$/;
  const pathMatch = pathPartial.exec(lastSegment);
  if (pathMatch) {
    const token = pathMatch[1];
    // If followed by space in the original text, it's a complete path → operator context
    if (trimmed.endsWith(' ') && token === lastSegment.trim()) {
      return { context: 'operator', partial: '', currentField: token, precedingClause };
    }
    return { context: 'path', partial: token, currentField: '', precedingClause };
  }

  // Path followed by partial operator
  const pathWithOp = /^([\w.*?~]+(?:\.[\w.*?~=]+)*)\s+(\S*)$/i;
  const pathOpMatch = pathWithOp.exec(lastSegment);
  if (pathOpMatch) {
    return {
      context: 'operator',
      partial: pathOpMatch[2],
      currentField: pathOpMatch[1],
      precedingClause,
    };
  }

  return { context: 'none', partial: '', currentField: '', precedingClause: '' };
}

export interface UseWhereDataCompletionsResult {
  suggestions: string[];
  context: CompletionContext;
  isLoading: boolean;
  onInputChange: (text: string) => void;
  acceptSuggestion: (suggestion: string, currentText: string) => string;
}

/**
 * Provides type-ahead suggestions for a WhereData clause input.
 * Extracts data paths by sampling unit config data (YAML/JSON).
 */
export function useWhereDataCompletions(): UseWhereDataCompletionsResult {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [context, setContext] = useState<CompletionContext>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [dataPaths, setDataPaths] = useState<string[]>([]);
  const pathsFetchedRef = useRef(false);

  const [triggerListUnits] = useLazyListAllUnitsQuery();

  // Fetch data paths from a sample of units on first focus
  const fetchDataPaths = useCallback(async () => {
    if (pathsFetchedRef.current) return;
    pathsFetchedRef.current = true;
    setIsLoading(true);

    try {
      const result = await triggerListUnits({});
      const units = result.data ?? [];
      const sample = units.slice(0, SAMPLE_SIZE);

      const allPaths = new Set<string>();

      await Promise.all(
        sample.map(async (eu) => {
          const unitId = eu.Unit?.UnitID;
          const spaceId = eu.Unit?.SpaceID;
          if (!unitId || !spaceId) return;

          try {
            const resp = await authFetch(`/api/space/${spaceId}/unit/${unitId}/data`);
            if (!resp.ok) return;
            const raw = await resp.text();
            if (!raw) return;

            const docs = yaml.loadAll(raw);
            for (const doc of docs) {
              extractPaths(doc, '', 0, allPaths);
            }
          } catch {
            // Skip units whose data can't be fetched/parsed
          }
        }),
      );

      setDataPaths(Array.from(allPaths).sort());
    } catch {
      setDataPaths([]);
    } finally {
      setIsLoading(false);
    }
  }, [triggerListUnits]);

  // Trigger path fetching on mount
  useEffect(() => {
    fetchDataPaths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInputChange = useCallback(
    (text: string) => {
      const parsed = parseContext(text);
      setContext(parsed.context);

      if (parsed.context === 'path') {
        const partial = parsed.partial.toLowerCase();
        const filtered = dataPaths
          .filter((p) => !partial || p.toLowerCase().startsWith(partial))
          .slice(0, 20);
        setSuggestions(filtered);
        return;
      }

      if (parsed.context === 'operator') {
        const partial = parsed.partial.toUpperCase();
        setSuggestions(ALL_OPERATORS.filter((op) => !partial || op.startsWith(partial)));
        return;
      }

      if (parsed.context === 'conjunction') {
        setSuggestions(['AND']);
        return;
      }

      // No value completions for data fields (too varied)
      setSuggestions([]);
    },
    [dataPaths],
  );

  const acceptSuggestion = useCallback((suggestion: string, currentText: string): string => {
    const parsed = parseContext(currentText);

    if (parsed.context === 'path') {
      const base = currentText.slice(0, currentText.length - parsed.partial.length);
      return `${base}${suggestion} `;
    }

    if (parsed.context === 'operator') {
      const base = currentText.slice(0, currentText.length - parsed.partial.length);
      return `${base}${suggestion} '`;
    }

    if (parsed.context === 'conjunction') {
      return `${currentText.trimEnd()} ${suggestion} `;
    }

    return currentText;
  }, []);

  return useMemo(
    () => ({ suggestions, context, isLoading, onInputChange, acceptSuggestion }),
    [suggestions, context, isLoading, onInputChange, acceptSuggestion],
  );
}
