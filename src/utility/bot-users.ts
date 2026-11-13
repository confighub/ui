// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ExternalID prefixes of the Users that are not people: a ServiceAccount's User, and the bot
 * User a removed worker authenticated as, as the server tells them apart.
 */
const BOT_EXTERNAL_ID_PREFIXES = ['confighub:serviceaccount:', 'confighub:worker'];

/** Whether a User is a bot rather than a person, such as one not to offer to ask for a review. */
export const isBotUser = (user: { ExternalID?: string } | undefined): boolean =>
  BOT_EXTERNAL_ID_PREFIXES.some((prefix) => user?.ExternalID?.startsWith(prefix) ?? false);
