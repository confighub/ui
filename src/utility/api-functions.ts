// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const createApiHeader = (token: string) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json;',
    Accept: 'application/json',
  };
};
