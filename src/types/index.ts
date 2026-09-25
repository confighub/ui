// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Dispatch, PropsWithChildren } from 'react';
import { GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';

import { ValidationResultRows } from '@/components/validation-result-table/ValidationResultTable';
import {
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  SpaceRead,
  UnitRead,
  ExtendedRevisionRead
} from '@confighub/rtk-query';

// /////////////////////////////////////////////////////////////////////////////////////////////////
// React
// /////////////////////////////////////////////////////////////////////////////////////////////////
export interface CmpProps {
  className?: string;
  children?: React.ReactNode;
}

export interface CmpPropsWithChildren extends CmpProps, PropsWithChildren { }

export type SetStateFn<T> = Dispatch<React.SetStateAction<T>>;

export type Maybe<T> = T | null | undefined;

export type tagType = 'success' | 'warning' | 'error' | 'info';

export type ChipColors =
  | 'default'
  | 'error'
  | 'success'
  | 'warning'
  | 'primary'
  | 'secondary'
  | 'info';

export interface IUnitMutationModalProps {
  units?: Array<UnitRead>;
  spaces?: Array<SpaceRead>;
  unitsToEdit?: Array<UnitRead>;
  fromUnit?: UnitRead;
  toUnit?: UnitRead;
  func?: FunctionSignature;
  onClose: () => void;
  refresh?: () => void;
  isOpen: boolean;
  disable?: boolean;
  // TODO:
  multiSelectSpace?: boolean;
  multiSelectUnit?: boolean;
  onSubmit?: (
    input?:
      | UnitRead
      | Array<UnitRead>
      | Array<FunctionInvocationsResponse>
      | Record<string, string>,
    apiError?: string,
    apiErrors?: string[]
  ) => void | Promise<void> | UnitRead | Promise<UnitRead>;
  modalTitleText?: string;
  modalDescriptionText?: string;
  defaultToolchainType?: string;
  defaultChangeSetId?: string;
  /** Invocation to pre-populate the form with (for edit & invoke flow) */
  invocationToEdit?: Invocation;
}

export interface AttributeInfo {
  Description?: string;
}

export interface AttributeValue {
  AttributeInfo: AttributeInfo;
  Value: unknown;
}

export interface Attribute {
  ResourceName: string;
  ResourceType: string;
  ResourceNameWithoutScope: string;
  ResourceCategory?: string;
  Path: string;
  AttributeName: string;
  DataType: string;
  Description?: string;
  Info?: AttributeInfo;
  Value: string;
  UnitName?: string;
  SpaceName?: string;
}

export interface AttributeValueItem {
  ResourceName: string;
  ResourceNameWithoutScope: string;
  ResourceType: string;
  ResourceCategory: string;
  Path: string;
  AttributeName: string;
  DataType: string;
  Value: unknown;
}

export interface FunctionResultItem {
  id?: string;
  name: string;
  spaceName?: string;
  spaceID?: string;
  function?: string;
  description?: string;
  code?: string;
  additionalInfo?: string;
  diff?: string;
  rows?: ValidationResultRows[];
}

export const APPLY_STATES = {
  NONE: 'None',
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  PROGRESSING: 'Progressing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELED: 'Canceled',
};

export type FilterPayload = {
  where: string;
  whereData: string;
  resourceType: string;
  spaceID: string;
  filterSpaceID?: string;
  filterID?: string;
  viewID?: string;
};

export type RevisionRow = { id: string; RevisionNum: number } & ExtendedRevisionRead;

export const OUTPUT_TYPES = {
  VALIDATION_RESULT: 'ValidationResult',
  VALIDATION_RESULT_LIST: 'ValidationResultList',
  ATTRIBUTE_VALUE_LIST: 'AttributeValueList',
  RESOURCE_INFO_LIST: 'ResourceInfoList',
  RESOURCE_LIST: 'ResourceList',
  RESOURCE_MUTATION_LIST: 'ResourceMutationList',
  PATCH_MAP: 'PatchMap',
  JSON: 'JSON',
  YAML: 'YAML',
  OPAQUE: 'Opaque',
} as const;

export type OutputType = (typeof OUTPUT_TYPES)[keyof typeof OUTPUT_TYPES];

// /////////////////////////////////////////////////////////////////////////////////////////////////
// Data Grid Cell Props
// /////////////////////////////////////////////////////////////////////////////////////////////////
export interface IDateTimeCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
}

export interface ILinkCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
  linkTo: (row: TRow) => string;
  getText?: (row: TRow) => string;
}

export interface INumericAggregateCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
  rows: TRow[];
  aggregateGetter: (rows: TRow[], groupIds: string[]) => number;
}

export interface IUuidCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
}

export type IBooleanDisplay = {
  true: () => React.ReactNode;
  false: () => React.ReactNode;
  undefined?: () => React.ReactNode;
};

export interface IBooleanCellProps<TRow extends GridValidRowModel = GridValidRowModel> {
  params: GridRenderCellParams<TRow>;
  display?: IBooleanDisplay;
}

// /////////////////////////////////////////////////////////////////////////////////////////////////
// Data Grid Column Builder
// /////////////////////////////////////////////////////////////////////////////////////////////////
type IBaseColumnDef = {
  headerName: string;
  minWidth?: number;
  flex?: number;
  groupable?: boolean;
};

export type ILinkColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'link';
  linkTo: (row: TRow) => string;
  getText?: (row: TRow) => string;
};

export type IDateTimeColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'dateTime';
  valueGetter?: (row: TRow) => Date | string | null;
};

export type INumberColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'number';
  valueGetter?: (row: TRow) => number;
};

export type INumericAggregateColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'numericAggregate';
  valueGetter: (row: TRow) => number;
  aggregateGetter: (rows: TRow[], groupIds: string[]) => number;
};

export type IStringColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'string';
  valueGetter?: (row: TRow) => string;
};

export type IUuidColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'uuid';
  valueGetter?: (row: TRow) => string;
};

export type IBooleanColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'boolean';
  valueGetter?: (row: TRow) => boolean | undefined | null;
  display?: IBooleanDisplay;
};

export type ICustomColumnDef<TRow extends GridValidRowModel> = IBaseColumnDef & {
  type: 'custom';
  valueGetter?: (row: TRow) => unknown;
  renderCell: (params: GridRenderCellParams<TRow>) => React.ReactNode;
};

export type IColumnDef<TRow extends GridValidRowModel> =
  | ILinkColumnDef<TRow>
  | IDateTimeColumnDef<TRow>
  | INumberColumnDef<TRow>
  | INumericAggregateColumnDef<TRow>
  | IStringColumnDef<TRow>
  | IUuidColumnDef<TRow>
  | IBooleanColumnDef<TRow>
  | ICustomColumnDef<TRow>;

export type IColumnDefinitions<TRow extends GridValidRowModel> = {
  [K in string]: IColumnDef<TRow>;
};

export type Revision = 'LastReleasedRevisionNum' | 'HeadRevisionNum';


export interface DiscoveredResource {
  /** Full resource name including namespace, e.g. "argocd/my-app" */
  resourceName: string;
  /** Kubernetes resource type, e.g. "argoproj.io/v1alpha1/Application" */
  resourceType: string;
  /** API group, e.g. "argoproj.io" */
  apiGroup: string;
  /** Kubernetes kind, e.g. "Application" */
  kind: string;
  /** Full YAML body of the resource */
  resourceBody: string;
  /** Destination namespace from the ArgoCD Application spec */
  destinationNamespace?: string;
  /** Destination cluster server URL from the ArgoCD Application spec */
  destinationServer?: string;
  /** Whether the application uses a Helm chart or plain Git/Kustomize source */
  sourceType?: 'Helm' | 'Git';
  /** Primary source repository URL */
  sourceRepo?: string;
}

export interface ImportProgress {
  resourceName: string;
  status: 'not started' | 'pending' | 'creating' | 'completed' | 'failed';
  unitId?: string;
  unitSlug?: string;
  error?: string;
}

export interface ApplyProgress {
  unitId: string;
  unitSlug: string;
  status: 'pending' | 'applying' | 'completed' | 'failed';
  error?: string;
}

export interface FinalizeProgress {
  dryUnitSlug: string;
  wetUnitId?: string;
  wetUnitSlug?: string;
  crdsUnitId?: string;
  crdsUnitSlug?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export enum GitOpsImportStep {
  SELECT_TARGETS = 0,
  DISCOVER = 1,
  IMPORT = 2,
  CONFIGURE_LINKED = 3,
  APPLY_AND_FINALIZE = 4,
}