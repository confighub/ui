// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useLazyListAllUnitsQuery,
  useLazyListSpacesQuery,
} from '@confighub/rtk-query';

import { getAdapter, ViewEntityType } from '../adapters';
import { LABEL_PREFIX } from '../types';

type CompletionContext = 'field' | 'operator' | 'value' | 'conjunction' | 'label-key' | 'none';

interface ParseResult {
  context: CompletionContext;
  /** The partial token being typed (text after the last delimiter) */
  partial: string;
  /** The field name relevant to the current operator/value context */
  currentField: string;
  /** Complete WHERE conditions typed before the current token */
  precedingWhere: string;
}

const STRING_OPERATORS = ['=', '!=', 'ILIKE', 'NOT ILIKE', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN'];
const DATE_OPERATORS = ['=', '!=', '<', '>', '<=', '>='];
const NUMBER_OPERATORS = ['=', '!=', '<', '>', '<=', '>=', 'IN', 'NOT IN'];

const DATE_FIELDS = new Set(['CreatedAt', 'UpdatedAt']);
const NUMBER_FIELDS = new Set([
  'HeadRevisionNum',
  'LastReleasedRevisionNum',
  'UpstreamRevisionNum',
]);

/** Entity prefixes a WHERE clause can use to address a related entity's attributes. */
const SOURCE_PREFIXES: Record<string, 'Unit' | 'Space'> = {
  'Unit.': 'Unit',
  'Space.': 'Space',
};

/**
 * Split a possibly-prefixed attribute name into the entity whose rows hold its
 * values and the bare attribute name to ask that entity for. An unprefixed name
 * belongs to the entity being filtered.
 */
function resolveFieldSource(
  field: string,
  entityType: ViewEntityType,
): ['Unit' | 'Space', string] {
  for (const [prefix, source] of Object.entries(SOURCE_PREFIXES)) {
    if (field.startsWith(prefix)) return [source, field.slice(prefix.length)];
  }
  return [entityType === 'Space' ? 'Space' : 'Unit', field];
}

/**
 * Rewrite the already-typed part of a clause so it can be evaluated against
 * `source` directly: terms addressing that entity lose their prefix, and terms
 * addressing anything else are dropped rather than sent somewhere they would be
 * rejected. Value suggestions are a convenience, so narrowing them by fewer
 * terms is better than losing them entirely.
 *
 * `keepUnprefixed` says whether a bare attribute name belongs to `source`. It
 * does when the clause filters that entity directly, and does not when the
 * clause filters something else that addresses it with a prefix -- there, a
 * bare name is an attribute of the filtered entity, not of `source`.
 */
function restrictWhereToSource(
  where: string,
  source: 'Unit' | 'Space',
  keepUnprefixed: boolean,
): string {
  if (!where) return '';
  return where
    .split(/\bAND\b/i)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => {
      for (const [prefix, termSource] of Object.entries(SOURCE_PREFIXES)) {
        if (term.startsWith(prefix)) {
          return termSource === source ? term.slice(prefix.length) : '';
        }
      }
      return keepUnprefixed ? term : '';
    })
    .filter(Boolean)
    .join(' AND ');
}

function operatorsForField(field: string): string[] {
  if (DATE_FIELDS.has(field)) return DATE_OPERATORS;
  if (NUMBER_FIELDS.has(field)) return NUMBER_OPERATORS;
  return STRING_OPERATORS;
}

/**
 * Very lightweight tokenizer that figures out where in a WHERE clause the cursor is.
 * Handles only single-line input; does not deal with parentheses.
 */
function parseContext(text: string, knownFields: string[]): ParseResult {
  const trimmed = text.trimEnd();

  if (!trimmed) {
    return { context: 'field', partial: '', currentField: '', precedingWhere: '' };
  }

  // Split on AND to get individual conditions
  // The last segment is what the user is currently typing
  const segments = trimmed.split(/\bAND\b/i);
  const lastSegment = segments[segments.length - 1].trim();
  const precedingWhere = segments
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' AND ');

  // If the last segment is empty (e.g. text ends with "AND "), user is starting a new field
  if (!lastSegment) {
    return { context: 'field', partial: '', currentField: '', precedingWhere };
  }

  // Try to match: Field OP 'value' (complete condition) → suggest conjunction
  const completeCondition = /^(\w[\w.]*)\s+(=|!=|ILIKE|NOT ILIKE|LIKE|NOT LIKE|IN|NOT IN|<|>|<=|>=)\s+('.+'|\d+)$/i;
  if (completeCondition.test(lastSegment)) {
    return { context: 'conjunction', partial: '', currentField: '', precedingWhere };
  }

  // Try to match: Field OP 'partial (in middle of quoting a value)
  const valueStarted = /^(\w[\w.]*)\s+(=|!=|ILIKE|NOT ILIKE|LIKE|NOT LIKE|IN|NOT IN|<|>|<=|>=)\s+'([^']*)$/i;
  const valueStartedMatch = valueStarted.exec(lastSegment);
  if (valueStartedMatch) {
    const field = valueStartedMatch[1];
    const partial = valueStartedMatch[3];
    return { context: 'value', partial, currentField: field, precedingWhere };
  }

  // Try to match: Field OP (operator typed, user will type value)
  const operatorComplete = /^(\w[\w.]*)\s+(=|!=|ILIKE|NOT ILIKE|LIKE|NOT LIKE|IN|NOT IN|<|>|<=|>=)\s*$/i;
  const opMatch = operatorComplete.exec(lastSegment);
  if (opMatch) {
    return { context: 'value', partial: '', currentField: opMatch[1], precedingWhere };
  }

  // Try to match: Labels. (special: suggest label key completions)
  const labelsKeyPartial = /^(Labels\.)(\w*)$/i;
  const labelsMatch = labelsKeyPartial.exec(lastSegment);
  if (labelsMatch) {
    return {
      context: 'label-key',
      partial: labelsMatch[2],
      currentField: 'Labels',
      precedingWhere,
    };
  }

  // Try to match: Field (partial token, user is typing a field name)
  const fieldPartial = /^(\w[\w.]*)$/i;
  const fieldMatch = fieldPartial.exec(lastSegment);
  if (fieldMatch) {
    const token = fieldMatch[1];
    // Check if it matches a complete known field followed by space (operator context)
    if (knownFields.includes(token)) {
      // Complete field name with trailing space — suggest operators
      return { context: 'operator', partial: '', currentField: token, precedingWhere };
    }
    return { context: 'field', partial: token, currentField: '', precedingWhere };
  }

  // Field followed by partial operator token
  const fieldWithOp = /^(\w[\w.]*)\s+(\S*)$/i;
  const fieldOpMatch = fieldWithOp.exec(lastSegment);
  if (fieldOpMatch) {
    return {
      context: 'operator',
      partial: fieldOpMatch[2],
      currentField: fieldOpMatch[1],
      precedingWhere,
    };
  }

  return { context: 'none', partial: '', currentField: '', precedingWhere: '' };
}

export interface UseWhereCompletionsResult {
  suggestions: string[];
  context: CompletionContext;
  isLoading: boolean;
  /** Call when the WHERE clause text or cursor position changes */
  onInputChange: (text: string) => void;
  /** Call with the suggestion the user selected */
  acceptSuggestion: (suggestion: string, currentText: string) => string;
}

/**
 * Provides type-ahead suggestions for a raw WHERE clause input.
 * Field completions come from actual data via partial queries; operators are static.
 *
 * The entityType parameter swaps the field vocabulary and the data-source
 * query (units vs. spaces) so value suggestions reflect rows the WHERE clause
 * will actually be evaluated against.
 */
export function useWhereCompletions(
  entityType: ViewEntityType = 'Unit',
  fieldsOverride?: string[],
): UseWhereCompletionsResult {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [context, setContext] = useState<CompletionContext>('none');
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adapter = getAdapter(entityType);
  const [triggerListUnits] = useLazyListAllUnitsQuery();
  const [triggerListSpaces] = useLazyListSpacesQuery();

  // Pick the right query + extractors for the current entity type. Closures
  // keep the hook callsites identical regardless of entity type.
  const fetchValueSuggestions = useCallback(
    async (field: string, partial: string, precedingWhere: string) => {
      setIsLoading(true);
      try {
        // A clause evaluated against another entity addresses this one with a
        // prefix, as in `Unit.Slug`. The prefix says which entity to read
        // values from; the query itself takes the bare attribute name.
        const [source, bare] = resolveFieldSource(field, entityType);
        field = bare;
        precedingWhere = restrictWhereToSource(precedingWhere, source, !fieldsOverride);
        const isLabel = field.startsWith(LABEL_PREFIX);
        const labelKey = isLabel ? field.slice(LABEL_PREFIX.length) : '';
        const values = new Set<string>();
        if (source === 'Space') {
          const result = await triggerListSpaces({
            where: precedingWhere || undefined,
            select: isLabel ? 'Labels' : `${field},Slug`,
          });
          for (const es of result.data ?? []) {
            const space = es.Space;
            if (!space) continue;
            if (isLabel) {
              const v = space.Labels?.[labelKey];
              if (v) values.add(v);
            } else if (field === 'Slug' && space.Slug) {
              values.add(space.Slug);
            } else if (field === 'DisplayName' && space.DisplayName) {
              values.add(space.DisplayName);
            } else if (field === 'OrganizationID' && space.OrganizationID) {
              values.add(space.OrganizationID);
            } else if (field === 'SpaceID' && space.SpaceID) {
              values.add(space.SpaceID);
            }
          }
        } else {
          const result = await triggerListUnits({
            where: precedingWhere || undefined,
            select: isLabel ? 'Labels' : `${field},Slug`,
          });
          for (const eu of result.data ?? []) {
            const unit = eu.Unit;
            if (!unit) continue;
            if (isLabel) {
              const v = unit.Labels?.[labelKey];
              if (v) values.add(v);
            } else if (field === 'Slug' && unit.Slug) {
              values.add(unit.Slug);
            } else if (field === 'ToolchainType' && unit.ToolchainType) {
              values.add(unit.ToolchainType);
            } else if (field === 'SpaceID' && unit.SpaceID) {
              values.add(unit.SpaceID);
            } else if (field === 'TargetID' && unit.TargetID) {
              values.add(unit.TargetID);
            } else if (field === 'DisplayName' && unit.DisplayName) {
              values.add(unit.DisplayName);
            } else if (field === 'ProviderType' && unit.ProviderType) {
              values.add(unit.ProviderType);
            } else if (field === 'LastChangeDescription' && unit.LastChangeDescription) {
              values.add(unit.LastChangeDescription);
            }
          }
        }
        const filtered = Array.from(values)
          .filter((v) => !partial || v.toLowerCase().includes(partial.toLowerCase()))
          .sort()
          .slice(0, 15);
        setSuggestions(filtered);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [entityType, fieldsOverride, triggerListUnits, triggerListSpaces],
  );

  const fetchLabelKeySuggestions = useCallback(
    async (partial: string, precedingWhere: string) => {
      setIsLoading(true);
      try {
        const keys = new Set<string>();
        if (entityType === 'Space') {
          const result = await triggerListSpaces({
            where: precedingWhere || undefined,
            select: 'Labels',
          });
          for (const es of result.data ?? []) {
            const labels = es.Space?.Labels ?? {};
            Object.keys(labels).forEach((k) => keys.add(k));
          }
        } else {
          const result = await triggerListUnits({
            where: precedingWhere || undefined,
            select: 'Labels',
          });
          for (const eu of result.data ?? []) {
            const labels = eu.Unit?.Labels ?? {};
            Object.keys(labels).forEach((k) => keys.add(k));
          }
        }
        const filtered = Array.from(keys)
          .filter((k) => !partial || k.toLowerCase().includes(partial.toLowerCase()))
          .slice(0, 15)
          .map((k) => `${LABEL_PREFIX}${k}`);
        setSuggestions(filtered);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [entityType, triggerListUnits, triggerListSpaces],
  );

  const knownFields = useMemo(
    () => [...(fieldsOverride ?? adapter.filterFields), 'Labels'],
    [fieldsOverride, adapter.filterFields],
  );

  const onInputChange = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const parsed = parseContext(text, knownFields);
      setContext(parsed.context);

      if (parsed.context === 'field') {
        const partial = parsed.partial.toLowerCase();
        setSuggestions(
          knownFields.filter((f) => !partial || f.toLowerCase().startsWith(partial)).slice(0, 12),
        );
        setIsLoading(false);
        return;
      }

      if (parsed.context === 'operator') {
        const ops = operatorsForField(parsed.currentField);
        const partial = parsed.partial.toUpperCase();
        setSuggestions(ops.filter((op) => !partial || op.startsWith(partial)));
        setIsLoading(false);
        return;
      }

      if (parsed.context === 'conjunction') {
        setSuggestions(['AND']);
        setIsLoading(false);
        return;
      }

      if (parsed.context === 'label-key') {
        debounceRef.current = setTimeout(() => {
          fetchLabelKeySuggestions(parsed.partial, parsed.precedingWhere);
        }, 300);
        return;
      }

      if (parsed.context === 'value') {
        debounceRef.current = setTimeout(() => {
          fetchValueSuggestions(parsed.currentField, parsed.partial, parsed.precedingWhere);
        }, 300);
        return;
      }

      setSuggestions([]);
      setIsLoading(false);
    },
    [knownFields, fetchValueSuggestions, fetchLabelKeySuggestions],
  );

  /**
   * Given a selected suggestion and the current input text, return the new input text.
   */
  const acceptSuggestion = useCallback((suggestion: string, currentText: string): string => {
    const parsed = parseContext(currentText, knownFields);

    if (parsed.context === 'field') {
      // Replace the partial field token at end
      const base = currentText.slice(0, currentText.length - parsed.partial.length);
      return `${base}${suggestion} `;
    }

    if (parsed.context === 'label-key') {
      // Replace "Labels.<partial>" at end
      const suffix = `${LABEL_PREFIX}${parsed.partial}`;
      const base = currentText.slice(0, currentText.length - suffix.length);
      return `${base}${suggestion} `;
    }

    if (parsed.context === 'operator') {
      // Replace partial operator token at end
      const base = currentText.slice(0, currentText.length - parsed.partial.length);
      return `${base}${suggestion} '`;
    }

    if (parsed.context === 'value') {
      // Replace the partial value token after the opening quote
      const lastQuote = currentText.lastIndexOf("'");
      if (lastQuote !== -1) {
        return `${currentText.slice(0, lastQuote + 1)}${suggestion}' `;
      }
      return `${currentText}'${suggestion}' `;
    }

    if (parsed.context === 'conjunction') {
      return `${currentText.trimEnd()} ${suggestion} `;
    }

    return currentText;
  }, [knownFields]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return useMemo(
    () => ({ suggestions, context, isLoading, onInputChange, acceptSuggestion }),
    [suggestions, context, isLoading, onInputChange, acceptSuggestion],
  );
}
