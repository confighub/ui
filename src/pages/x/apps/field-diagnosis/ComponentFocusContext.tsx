// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field diagnosis focus, from the Component view URL, for the side pane (PLAN.md decision 4).
// AppsComponentLayout provides it and stays the one component that touches the URL
// (components.md, "The URL is the sole source of truth"): the pane reads the focus here and
// writes through `go`, which is the layout's own `updateParams`.
import { createContext, useContext } from 'react';

import type { ViewParamsPatch } from '../appTypes';
import type { ComponentFocus } from './componentFocus';

export interface ComponentFocusValue {
  focus: ComponentFocus;
  /** The router's location key: changes on every navigation, Back and Forward included. */
  locationKey: string;
  /** Write a patch to the URL: replace by default, push for a jump. */
  go: (patch: ViewParamsPatch, options?: { push?: boolean }) => void;
  /** The address of a patch, for an <a href>. */
  hrefFor: (patch: ViewParamsPatch) => string;
}

const NO_FOCUS: ComponentFocusValue = {
  focus: {},
  locationKey: '',
  go: () => undefined,
  hrefFor: () => '',
};

/** Mounted outside the Components view (a ChangeOrder page), the pane has no focus and writes nothing. */
export const ComponentFocusContext = createContext<ComponentFocusValue>(NO_FOCUS);

export const useComponentFocus = () => useContext(ComponentFocusContext);
