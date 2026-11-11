// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// What the Add/Edit Trigger form holds, and how it becomes the Trigger it writes.
import type { TriggerRead } from '@confighub/rtk-query';

import {
  type ClearanceRow,
  clearanceToRows,
  rowsToClearance,
} from '@/components/clearance-field/clearanceRows';
import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';
import {
  ENFORCED_AT_ANNOTATION,
  ENFORCED_BY_ANNOTATION,
  enforcedAtAfter,
  PRIORITY_ANNOTATION,
  ENFORCEMENT_ANNOTATIONS,
  enforcementDate,
  toEnforcementTime,
  type TriggerPriority,
  triggerPriority,
} from '@/utility/triggerEnforcement';

/** Whether a Trigger runs a function it names or a stored Invocation. */
export type TriggerSource = 'Function' | 'Invocation';

export interface IAddTriggerFormInput {
  Slug: string;
  DisplayName?: string;
  Description?: string;
  Labels?: MapRow[];
  /** The annotations other than the enforcement ones, which have fields of their own below. */
  Annotations?: MapRow[];
  /** The Priority annotation of a validating Trigger. */
  Priority?: TriggerPriority;
  /** The EnforcedBy annotation of a validating Trigger, as a date (2026-12-31). */
  EnforcedBy?: string;
  DeleteGates?: MapRow[];
  EventType: 'Mutation' | 'PostClone';
  ToolchainType: string;
  Source: TriggerSource;
  FunctionName: string;
  InvocationID?: string;
  ChannelID?: string;
  Disabled?: boolean;
  Warn?: boolean;
  WhereUnit?: string;
  UnitFilterID?: string;
  WhereResource?: string;
  Protect?: boolean;
  Guards?: MapRow[];
  Clearance?: ClearanceRow[];
}

export const defaultTriggerFormInput = (): IAddTriggerFormInput => ({
  Slug: '',
  DisplayName: '',
  Description: '',
  Labels: [],
  Annotations: [],
  Priority: 'Unspecified',
  EnforcedBy: '',
  DeleteGates: [],
  EventType: 'Mutation',
  ToolchainType: 'Kubernetes/YAML',
  Source: 'Function',
  FunctionName: '',
  InvocationID: '',
  ChannelID: '',
  Disabled: false,
  Warn: false,
  WhereUnit: '',
  UnitFilterID: '',
  WhereResource: '',
  Protect: false,
  Guards: [],
  Clearance: [],
});

/** The form's values for a Trigger being edited. */
export const triggerToFormInput = (trigger: TriggerRead): IAddTriggerFormInput => ({
  ...defaultTriggerFormInput(),
  Slug: trigger.Slug || '',
  DisplayName: trigger.DisplayName || '',
  Description: trigger.Description || '',
  Labels: mapToRows(trigger.Labels),
  Annotations: mapToRows(
    Object.fromEntries(
      Object.entries(trigger.Annotations ?? {}).filter(([key]) => !ENFORCEMENT_ANNOTATIONS.includes(key)),
    ),
  ),
  Priority: triggerPriority(trigger.Annotations),
  EnforcedBy: enforcementDate(trigger.Annotations?.[ENFORCED_BY_ANNOTATION]),
  DeleteGates: mapToRows(trigger.DeleteGates),
  EventType: (trigger.Event as 'Mutation' | 'PostClone') || 'Mutation',
  ToolchainType: trigger.ToolchainType || 'Kubernetes/YAML',
  Source: trigger.InvocationID ? 'Invocation' : 'Function',
  FunctionName: trigger.FunctionName || '',
  InvocationID: trigger.InvocationID || '',
  ChannelID: trigger.ChannelID || '',
  Disabled: trigger.Disabled || false,
  Warn: trigger.Warn || false,
  WhereUnit: trigger.WhereUnit || '',
  UnitFilterID: trigger.UnitFilterID || '',
  WhereResource: trigger.WhereResource || '',
  Protect: trigger.Protect || false,
  Guards: mapToRows(trigger.Guards),
  Clearance: clearanceToRows(trigger.Clearance),
});

/** The text of an optional field, or undefined when it is blank, so it is left out. */
const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** A map, or undefined when it is empty. */
const optionalMap = <T,>(map: Record<string, T>): Record<string, T> | undefined =>
  Object.keys(map).length > 0 ? map : undefined;

/**
 * The fields of the Trigger the form writes. Every field the form shows is set, to undefined when
 * blank, so an edit that clears one sends the Trigger without it rather than an empty string the
 * server would refuse.
 *
 * A Trigger runs either a function or an Invocation, never both: the server refuses a FunctionName
 * beside an InvocationID, and the Invocation names where its functions run, so a Trigger that runs
 * one has no Channel, and passes its functions the other Units the Invocation names rather than its own.
 * Protect is for a function that writes; the server refuses it on a validating one.
 *
 * The other Units a Trigger passes its function, OtherUnitIDs, are not in the form, so an edit keeps
 * the ones the Trigger has.
 */
export const buildTriggerBody = (
  data: IAddTriggerFormInput,
  argumentValues: Record<string, string>,
  ids: { spaceId: string; orgID: string },
  selectedFunctionValidating = false,
  existingTrigger?: TriggerRead,
): TriggerRead => {
  const runsInvocation = data.Source === 'Invocation';
  const clearance = rowsToClearance(data.Clearance);
  return {
    Slug: data.Slug,
    DisplayName: optional(data.DisplayName),
    Description: optional(data.Description),
    Labels: rowsToMap(data.Labels),
    Annotations: withEnforcementAnnotations(
      rowsToMap(data.Annotations),
      data,
      selectedFunctionValidating || !!existingTrigger?.Validating,
      existingTrigger,
    ),
    DeleteGates: rowsToGates(data.DeleteGates),
    SpaceID: ids.spaceId,
    OrganizationID: ids.orgID,
    Event: data.EventType,
    ToolchainType: data.ToolchainType,
    FunctionName: runsInvocation ? '' : data.FunctionName,
    Arguments: runsInvocation
      ? []
      : Object.entries(argumentValues).map(([ParameterName, Value]) => ({ ParameterName, Value })),
    InvocationID: runsInvocation ? optional(data.InvocationID) : undefined,
    ChannelID: runsInvocation ? undefined : optional(data.ChannelID),
    Disabled: data.Disabled || false,
    Warn: data.Warn || false,
    WhereUnit: optional(data.WhereUnit),
    UnitFilterID: optional(data.UnitFilterID),
    WhereResource: optional(data.WhereResource),
    OtherUnitIDs: runsInvocation ? undefined : existingTrigger?.OtherUnitIDs,
    Protect: !selectedFunctionValidating && (data.Protect || false),
    Guards: optionalMap(rowsToMap(data.Guards)),
    Clearance: clearance.length > 0 ? clearance : undefined,
  };
};

/**
 * The annotations with the enforcement ones added back from their fields. EnforcedAt follows Warn: it
 * is stamped when a validating Trigger is created blocking or an edit makes it block, kept while it
 * blocks, and removed when it goes back to warning.
 */
const withEnforcementAnnotations = (
  annotations: Record<string, string>,
  data: IAddTriggerFormInput,
  validating: boolean,
  existingTrigger: TriggerRead | undefined,
): Record<string, string> => {
  const out = { ...annotations };
  if (data.Priority && data.Priority !== 'Unspecified') out[PRIORITY_ANNOTATION] = data.Priority;
  // The form holds a date; a time of day set elsewhere is kept while the date is unchanged.
  const storedEnforcedBy = existingTrigger?.Annotations?.[ENFORCED_BY_ANNOTATION];
  const enforcedBy =
    storedEnforcedBy && enforcementDate(storedEnforcedBy) === data.EnforcedBy
      ? storedEnforcedBy
      : toEnforcementTime(data.EnforcedBy ?? '');
  if (enforcedBy) out[ENFORCED_BY_ANNOTATION] = enforcedBy;
  const enforcedAt = validating
    ? enforcedAtAfter(existingTrigger, data.Warn ?? false)
    : existingTrigger?.Annotations?.[ENFORCED_AT_ANNOTATION];
  if (enforcedAt) out[ENFORCED_AT_ANNOTATION] = enforcedAt;
  return out;
};
