// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** A Channel belongs to a Space, so its address names both, as a ChangeSet's does. */
export const CHANNELS_PATH = '/channels';
export const channelPath = (spaceSlug: string, slug: string) =>
  `${CHANNELS_PATH}/${encodeURIComponent(spaceSlug)}/${encodeURIComponent(slug)}`;
