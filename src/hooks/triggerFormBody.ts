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

/** Whether a Trigger runs a function it names or a stored Invocation. */
export type TriggerSource = 'Function' | 'Invocation';

export interface IAddTriggerFormInput {
  Slug: string;
  DisplayName?: string;
  Description?: string;
  Labels?: MapRow[];
  Annotations?: MapRow[];
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
  OtherDataSource?: string;
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
  OtherDataSource: '',
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
  Annotations: mapToRows(trigger.Annotations),
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
  OtherDataSource: trigger.OtherDataSource || '',
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
 * one has no Channel. Protect is for a function that writes; the server refuses it on a validating
 * one.
 */
export const buildTriggerBody = (
  data: IAddTriggerFormInput,
  argumentValues: Record<string, string>,
  ids: { spaceId: string; orgID: string },
  selectedFunctionValidating = false,
): TriggerRead => {
  const runsInvocation = data.Source === 'Invocation';
  const clearance = rowsToClearance(data.Clearance);
  return {
    Slug: data.Slug,
    DisplayName: optional(data.DisplayName),
    Description: optional(data.Description),
    Labels: rowsToMap(data.Labels),
    Annotations: rowsToMap(data.Annotations),
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
    OtherDataSource: optional(data.OtherDataSource),
    Protect: !selectedFunctionValidating && (data.Protect || false),
    Guards: optionalMap(rowsToMap(data.Guards)),
    Clearance: clearance.length > 0 ? clearance : undefined,
  };
};
