// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ChannelRead, useListAllChannelsQuery } from '@confighub/rtk-query';

/** The reserved command a Channel declares when its client serves functions. */
export const FUNCTION_INVOKE_COMMAND = 'confighub.com/function.invoke';

/** The attribute of that command listing what the client serves, by toolchain and name. */
const FUNCTION_ATTRIBUTE = 'confighub.com/function';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The names of the functions a Channel declares it serves, across toolchains. */
const servedFunctionNames = (channel: ChannelRead): string[] => {
  const served: unknown = channel.Commands?.[FUNCTION_INVOKE_COMMAND]?.Attributes?.[FUNCTION_ATTRIBUTE];
  if (!isRecord(served) || !isRecord(served.toolchains)) return [];
  return Object.values(served.toolchains).flatMap((byName) =>
    isRecord(byName) ? Object.keys(byName) : [],
  );
};

export interface FunctionChannelOption {
  /** The Channel's ID. */
  id: string;
  /** `space/slug`, the way the CLI names a Channel in another Space. */
  label: string;
  /** The Space the Channel is in, which the space-scoped function list is called under. */
  spaceId: string;
  /** The names of the functions it serves, across toolchains. */
  functionNames: string[];
}

/**
 * Lists the Channels in the organization whose clients serve functions, as options for the
 * pickers that choose where a function, Trigger or Invocation runs.
 */
export const useFunctionChannels = ({ skip = false }: { skip?: boolean } = {}) =>
  useListAllChannelsQuery(
    { where: `Commands ? '${FUNCTION_INVOKE_COMMAND}'`, include: 'SpaceID' },
    {
      skip,
      selectFromResult: ({ data, isLoading }) => ({
        channels: (data ?? []).flatMap((extended): FunctionChannelOption[] => {
          const channel = extended.Channel;
          if (!channel?.ChannelID) return [];
          const slug = channel.Slug ?? '';
          return [
            {
              id: channel.ChannelID,
              label: extended.Space?.Slug ? `${extended.Space.Slug}/${slug}` : slug,
              spaceId: channel.SpaceID ?? '',
              functionNames: servedFunctionNames(channel),
            },
          ];
        }),
        isLoadingChannels: isLoading,
      }),
    },
  );

/**
 * The arguments that list the functions an executor serves: a Channel's, a worker's, or the
 * Space's builtin ones when neither is named.
 */
export const functionListArgs = (channelId?: string, workerId?: string) => {
  if (channelId) return { entity: 'channel', id: channelId };
  if (workerId) return { entity: 'worker', id: workerId };
  return { entity: '' };
};
