// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// `webkitdirectory` (and its legacy `directory` alias) let an <input
// type="file"> pick an entire folder in Chromium/WebKit browsers. Neither
// attribute is part of React's InputHTMLAttributes typings, and the UI does not
// use `as any` casts, so we extend the ambient type instead.
import 'react';

declare module 'react' {
  // The <T> is unused in this augmentation's own body, but must be present to
  // match React's InputHTMLAttributes<T> arity for declaration merging to apply.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
