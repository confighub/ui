// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Attribute } from '@/types';
import { decodeBase64 } from './string-functions';

// This type is a merge of schema properties for form validation and output and the attribute type from the API
export interface AttributeInput {
  root: string;
  label: string;
  value: string;
  description: string;
  path: string;
  type: string;
  minimum?: number;
  enum?: string[];
}

// This is defined in the function API but is not used in the ConfigHub API.
export interface Resource {
  ResourceName: string;
  ResourceType: string;
  ResourceBody: string;
}

// Types corresponding to Go AttributeValue structure from public/function/api/function.go
export interface AttributeValue {
  ResourceName?: string;
  ResourceType?: string;
  Path: string;
  AttributeName?: string;
  DataType?: string;
  Value?: unknown;
  Comment?: string;
  Index?: number;
}

export type AttributeValueList = AttributeValue[];

// ValidationResult corresponds to the Go ValidationResult struct
export interface ValidationResult {
  Passed: boolean;
  Index?: number;
  Details?: string[];
  FailedAttributes?: AttributeValueList;
}

// React hook form creates an object hierarchy with path properties
export const convertDotsToHyphens = (str: string) => str.replace(/\./g, '-');

export const convertHyphensToDots = (str: string) => str.replace(/-/g, '.');

// This method is used for flattening a json schema representation of a unit resource type.
export const groupAttributesByResourceTypeAndRoot = (
  schema: Record<string, unknown>,
): Record<string, Record<string, Attribute[]>> => {
  const groupedResult: Record<string, Record<string, Attribute[]>> = {};

  const traverse = (obj: Record<string, unknown>, resourceName: string = '') => {
    if (obj && typeof obj === 'object') {
      if ('path' in obj && typeof obj.path === 'string') {
        const path = obj.path as string;
        const pathParts = path.split('.');
        const root = pathParts[0];

        if (!groupedResult[resourceName]) {
          groupedResult[resourceName] = {};
        }

        if (!groupedResult[resourceName][root]) {
          groupedResult[resourceName][root] = [];
        }

        if (obj.dataType !== 'object') {
          groupedResult[resourceName][root].push({
            // @ts-expect-error TODO:
            ResourceName: obj.resourceName,
            // @ts-expect-error TODO:
            ResourceType: obj.resourceType,
            Path: obj.path,
            // @ts-expect-error TODO:
            AttributeName: obj.attributeName,
            // @ts-expect-error TODO:
            DataType: obj.dataType,
            // @ts-expect-error TODO:
            Value: obj.value,
            // @ts-expect-error TODO:
            Description: obj.description || '',
          });
        }
      }

      for (const key in obj) {
        if (typeof obj[key] === 'object') {
          // @ts-expect-error TODO:
          traverse(obj[key], resourceName);
        }
      }
    }
  };

  for (const resourceName in schema) {
    // @ts-expect-error TODO:
    traverse(schema[resourceName], resourceName);
  }

  return groupedResult;
};

export const convertStringToObject = (data: string) => {
  let object: Record<string, unknown> = {};
  if (data) {
    try {
      object = JSON.parse(data);
    } finally {
      // TODO:
    }
  }

  return object;
};

export const convertToResourceList = (data: string) => {
  let resourceArray: Array<unknown> = [];

  if (data) {
    try {
      resourceArray = JSON.parse(decodeBase64(data || ''));
    } finally {
      // TODO:
    }
  }

  return resourceArray;
};

export const convertToAttributeList = (data: string) => {
  let attributesArray: Array<unknown> = [];

  if (data) {
    try {
      attributesArray = JSON.parse(decodeBase64(data || ''));
    } finally {
      // TODO:
    }
  }

  return attributesArray;
};

// Utility function to generate the form type based on fields
export const createAttributeFormType = (
  fields: Record<string, Record<string, Attribute[]>>,
) => {
  const formType: Record<string, string> = {};

  Object.entries(fields).forEach(([outerKey, rootObjects]) => {
    Object.entries(rootObjects).forEach(([, attributes]) => {
      attributes.forEach((attr) => {
        // When a path is supplied as a name react-hook-form will convert it to a hierarchy, which is cool but doesn't work well here.
        const combinedPath = `${outerKey}#${convertDotsToHyphens(attr.Path)}`;
        formType[combinedPath] = attr.Value;
      });
    });
  });

  return formType;
};

export const convertAttributsArrayToObjectHierarchyByPath = (data: Array<Attribute>) => {
  const hierarchy: { [key: string]: unknown } = {};

  data.forEach((item) => {
    const { Path, Value, AttributeName, DataType, ResourceName, ResourceType } = item;
    const parts = Path.split('.');
    let current: { [key: string]: unknown } = hierarchy;

    const formattedResourceName = `${ResourceType?.toLocaleUpperCase()} ${ResourceName?.toLocaleUpperCase()}`;

    // Ensure the top-level object for each ResourceName exists
    if (!current[formattedResourceName]) {
      current[formattedResourceName] = {};
    }
    current = current[formattedResourceName] as { [key: string]: unknown };

    parts.forEach((part, index) => {
      // Handle array notation like "containers.0"
      const arrayMatch = part.match(/^(.+?)\.(\d+)$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const idx = parseInt(arrayMatch[2], 10);

        if (!current[key]) {
          current[key] = [];
        }

        if (!(current[key] as Array<unknown>)[idx]) {
          (current[key] as Array<unknown>)[idx] = {};
        }

        current = (current[key] as Array<unknown>)[idx] as { [key: string]: unknown };
      } else {
        // Handle special case for #references (e.g., "image#reference")
        const refMatch = part.match(/^(.+?)#(.+)$/);
        if (refMatch) {
          const key = refMatch[1];
          const refKey = refMatch[2];

          if (!current[key]) {
            current[key] = {};
          }

          (current[key] as Record<string, unknown>)[refKey] = {
            path: Path,
            attributeName: AttributeName,
            dataType: DataType,
            value: Value,
            resourceName: ResourceName,
            resourceType: ResourceType,
          };
        } else {
          if (!current[part]) {
            current[part] = {};
          }

          if (index === parts.length - 1) {
            current[part] = {
              path: Path,
              attributeName: AttributeName,
              dataType: DataType,
              value: Value,
              resourceName: ResourceName,
              resourceType: ResourceType,
            };
          } else {
            current = current[part] as { [key: string]: unknown };
          }
        }
      }
    });
  });

  return hierarchy;
};

export const groupAndCountResourceTypes = (resources: Array<Resource>): [string, number][] => {
  const counts: Record<string, number> = {};

  resources.forEach((resource) => {
    counts[resource.ResourceType || 'Unknown'] =
      (counts[resource.ResourceType || 'Unknown'] || 0) + 1;
  });

  return Object.entries(counts);
};

export const getTotalResourceCount = (groupedResources: [string, number][]): number => {
  return groupedResources.reduce((total, [, count]) => total + count, 0);
};
