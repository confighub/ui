// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The props of a link to another page that opens in a new browser tab. A
 * real link, so it can also be copied, or opened with the browser's own keys.
 */
export const newTab = (href: string | undefined) => (href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {});
