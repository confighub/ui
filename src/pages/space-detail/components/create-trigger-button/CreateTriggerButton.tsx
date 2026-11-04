// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';

import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

/**
 * Create, for Triggers: a Trigger is made from a function in the function invoker, or with the
 * Trigger form.
 */
export const CreateTriggerButton = ({
  onCreateInInvoker,
  onCreateWithForm,
}: {
  onCreateInInvoker: () => void;
  onCreateWithForm: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <>
      <ButtonGroup variant='contained' size='small' ref={anchor}>
        <Button onClick={onCreateInInvoker} data-testid='create-trigger-button'>
          Create
        </Button>
        <Button size='small' aria-label='More ways to create a Trigger' onClick={() => setMenuOpen(true)}>
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Menu anchorEl={anchor.current} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <MenuItem
          onClick={() => {
            setMenuOpen(false);
            onCreateInInvoker();
          }}
        >
          From a function, in the function invoker
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuOpen(false);
            onCreateWithForm();
          }}
        >
          With the Trigger form
        </MenuItem>
      </Menu>
    </>
  );
};
