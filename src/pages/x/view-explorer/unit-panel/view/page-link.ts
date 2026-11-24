// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The props of a link to another page. A real link, so it can also be copied, or opened in a new tab with the browser's own keys. */
export const pageLink = (href: string | undefined) => (href ? { href } : {});
