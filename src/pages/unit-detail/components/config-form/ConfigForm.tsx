// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Composer, UpdateAttributesInput } from '@/components/forms/composer/Composer';
import { ExpandMore } from '@/components/styled';
import { Attribute } from '@/types';
import {
  convertDotsToHyphens,
  convertHyphensToDots,
  createAttributeFormType,
  groupAttributesByResourceTypeAndRoot,
} from '@/utility/schema-functions';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Grid from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const Form = styled('form')<{ $visibility: boolean }>`
  visibility: ${({ $visibility }) => ($visibility ? 'visible' : 'hidden')};
  height: ${({ $visibility }) => ($visibility ? 'auto' : '0')};
`;

export interface IConfigFormProps {
  attributesList: Array<Attribute>;
  groupedAttributesByResourceName: ReturnType<typeof groupAttributesByResourceTypeAndRoot>;
  isEditMode: boolean;
  setIsShowLastChangeDescriptionModalOpen: (value: React.SetStateAction<boolean>) => void;
  setUpdatedAttributes: (value: React.SetStateAction<Attribute[]>) => void;
  formRef: React.RefObject<HTMLFormElement>;
  isVisible: boolean;
}

export const ConfigForm = ({
  attributesList,
  groupedAttributesByResourceName,
  isEditMode,
  setIsShowLastChangeDescriptionModalOpen,
  setUpdatedAttributes,
  formRef,
  isVisible = true,
}: IConfigFormProps) => {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // TODO: Have to handle resource name and get all values...
  const formType = createAttributeFormType(groupedAttributesByResourceName);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formTypes = Object.entries(formType).map(([key]) => ({ name: key }));

  const updateAttributes = (elem: UpdateAttributesInput) => {
    const newAttributes = attributesList.map((attr) => {
      // Convert hyphens to dots to find the path.  Property names have to be converted to - because react-hook-form converts paths with . to a hierarchy, which is cool but
      // doesn't work well here.;

      // We only need the path for finding the proper attribute to update.
      // Convert back to regular path for comparison as a react-hook-form hack...
      if (
        attr.Path === convertHyphensToDots(elem.path) &&
        attr.Value !== elem.value &&
        attr.ResourceName === elem.resourceName
      ) {
        let newValue: string | number | boolean = elem.value;

        // Convert the value to the correct type since the form fields are typically converted to strings internally.
        if (attr.DataType === 'int') {
          newValue = parseInt(elem.value, 10);
        } else if (attr.DataType === 'boolean') {
          newValue = elem.value === 'true';
        }

        return { ...attr, Value: newValue };
      }
      return attr;
    });

    const changedAttributes = newAttributes.filter(
      (attr, index) => attr.Value !== attributesList[index].Value,
    );

    // @ts-expect-error TODO: Fix this
    setUpdatedAttributes(changedAttributes);
  };

  type FormValues = {
    [Key in Exclude<(typeof formTypes)[number]['name'], undefined>]: string;
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: formType,
    values: formType,
  });

  const toggleExpand = (key: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Initialize expandedItems to expand all resources by default
  useEffect(() => {
    const initialExpandedItems = Object.keys(groupedAttributesByResourceName).reduce(
      (acc, key) => {
        acc[key] = true; // Set all resources to expanded (true)
        return acc;
      },
      {} as Record<string, boolean>,
    );
    setExpandedItems(initialExpandedItems);
  }, [groupedAttributesByResourceName]);

  useEffect(() => {
    if (!isEditMode) reset();
  }, [isEditMode]);

  return (
    <>
      <Form
        ref={formRef}
        $visibility={isVisible}
        onSubmit={handleSubmit(() => setIsShowLastChangeDescriptionModalOpen(true))}
      >
        {Object.entries(groupedAttributesByResourceName).map(([resourceName, fields]) => (
          <>
            {Object.entries(fields).map(([, value]) => (
              <>
                <Box
                  key={resourceName}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant='h6'>{resourceName}</Typography>
                  <ExpandMore
                    expand={expandedItems[resourceName]}
                    onClick={() => toggleExpand(resourceName)}
                    aria-expanded={expandedItems[resourceName]}
                    aria-label='show more'
                  >
                    <ExpandMoreIcon />
                  </ExpandMore>
                </Box>
                <Collapse
                  key={resourceName}
                  in={expandedItems[resourceName]}
                  timeout={'auto'}
                  unmountOnExit
                >
                  <Grid container spacing={2} sx={{ marginTop: '5px', marginBottom: '32px' }}>
                    {value.map((attr) => (
                      <Grid size={{ xs: 6 }} key={attr.Path}>
                        <Composer
                          isEditMode={isEditMode}
                          updateAttributes={updateAttributes}
                          field={attr}
                          errors={errors}
                          control={control}
                          // When a path is supplied as a name react-hook-form will convert it to a hierarchy, which is cool but doesn't work well here.
                          uniqueResourceKey={`${resourceName}#${convertDotsToHyphens(attr.Path)}`}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Collapse>
              </>
            ))}
          </>
        ))}
      </Form>
    </>
  );
};
