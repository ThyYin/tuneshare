import {
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type InteractionReplyOptions,
  type Message,
  type User,
} from 'discord.js';
import { COMMAND_PREFIX } from '../constants';
import { flattenWrappedMusicUrl } from '../services/music/urlInput';
import type { DisplayNameMember } from './displayName';
import { UserFacingError, UserMessages } from './errors';

export interface CommandReplyPayload {
  content?: string;
  embeds?: InteractionReplyOptions['embeds'];
  components?: InteractionReplyOptions['components'];
}

export type CommandReplyInput = string | CommandReplyPayload;

export interface CommandContext {
  source: 'slash' | 'prefix';
  user: User;
  member: DisplayNameMember | null;
  guild: Guild | null;
  client: Client;
  getString(name: string, required?: boolean): string | null;
  getUser(name: string, required?: boolean): Promise<User | null>;
  getMember(name: string): Promise<DisplayNameMember | null>;
  deferReply(): Promise<void>;
  reply(payload: CommandReplyInput): Promise<void>;
  editReply(payload: CommandReplyPayload): Promise<void>;
}

export function createInteractionContext(interaction: ChatInputCommandInteraction): CommandContext {
  return {
    source: 'slash',
    user: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    client: interaction.client,

    getString(name: string, required?: boolean): string | null {
      const value = interaction.options.getString(name, required === true);
      if (required && !value) {
        throw new UserFacingError(missingArgMessage(name));
      }
      return value;
    },

    async getUser(name: string, required?: boolean): Promise<User | null> {
      const user = interaction.options.getUser(name, required === true);
      if (required && !user) {
        throw new UserFacingError(UserMessages.missingUser);
      }
      return user;
    },

    getMember: async (name: string) => interaction.options.getMember(name),

    async deferReply() {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
    },

    async reply(payload: CommandReplyInput) {
      const data = toDiscordPayload(payload);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(data);
        return;
      }
      await interaction.reply(data);
    },

    async editReply(payload: CommandReplyPayload) {
      await interaction.editReply(toDiscordPayload(payload));
    },
  };
}

export function createMessageContext(
  command: { data: { toJSON: () => unknown } },
  message: Message,
  rawArgs: string,
): CommandContext {
  const optionNames = prefixOptionNames(command);
  let resolvedUser: { user: User; member: GuildMember | null } | null | undefined;
  let sentMessage: Message | null = null;
  let deferred = false;

  async function resolveNamedUser(required: boolean): Promise<User | null> {
    if (resolvedUser !== undefined) {
      if (required && !resolvedUser) {
        throw new UserFacingError(
          rawArgs.trim() || message.mentions.users.size > 0
            ? UserMessages.userNotFound
            : UserMessages.missingUser,
        );
      }
      return resolvedUser?.user ?? null;
    }

    const query = unwrapArg(rawArgs);
    const mention =
      [...message.mentions.users.values()].find((user) => rawArgs.includes(user.id)) ?? null;

    if (!query && !mention) {
      resolvedUser = null;
      if (required) {
        throw new UserFacingError(UserMessages.missingUser);
      }
      return null;
    }

    resolvedUser = await resolveMessageUser(message, query, mention);
    if (!resolvedUser) {
      throw new UserFacingError(UserMessages.userNotFound);
    }

    return resolvedUser.user;
  }

  return {
    source: 'prefix',
    user: message.author,
    member: message.member,
    guild: message.guild,
    client: message.client,

    getString(name: string, required?: boolean): string | null {
      const value = readPrefixString(name, rawArgs, optionNames);
      if (required && !value) {
        throw new UserFacingError(missingArgMessage(name));
      }
      return value;
    },

    async getUser(_name: string, required?: boolean): Promise<User | null> {
      return resolveNamedUser(required === true);
    },

    async getMember() {
      if (resolvedUser === undefined) {
        await resolveNamedUser(false);
      }
      return resolvedUser?.member ?? null;
    },

    async deferReply() {
      deferred = true;
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
    },

    async reply(payload: CommandReplyInput) {
      const data = toDiscordPayload(payload);
      if (sentMessage) {
        await sentMessage.edit(data);
        return;
      }
      sentMessage = await message.reply(data);
    },

    async editReply(payload: CommandReplyPayload) {
      const data = toDiscordPayload(payload);
      if (sentMessage) {
        await sentMessage.edit(data);
        return;
      }
      if (deferred && 'sendTyping' in message.channel) {
        // typing already sent; fall through to first reply
      }
      sentMessage = await message.reply(data);
    },
  };
}

export function parsePrefixCommand(content: string): { name: string; args: string } | null {
  const trimmed = content.trim();
  if (!trimmed.toLowerCase().startsWith(COMMAND_PREFIX)) {
    return null;
  }

  const rest = trimmed.slice(COMMAND_PREFIX.length).trim();
  if (!rest) {
    return { name: '', args: '' };
  }

  const separator = rest.search(/\s/);
  if (separator === -1) {
    return { name: rest.toLowerCase(), args: '' };
  }

  return {
    name: rest.slice(0, separator).toLowerCase(),
    args: rest.slice(separator).trim(),
  };
}

function prefixOptionNames(command: { data: { toJSON: () => unknown } }): Set<string> {
  const json = command.data.toJSON() as { options?: Array<{ name: string }> };
  return new Set((json.options ?? []).map((option) => option.name));
}

function readPrefixString(name: string, rawArgs: string, optionNames: Set<string>): string | null {
  if (!optionNames.has(name)) {
    return null;
  }

  const cleaned = unwrapArg(rawArgs);
  if (!cleaned) {
    return null;
  }

  if (name === 'song_url' || name === 'song') {
    return extractMusicUrl(cleaned);
  }

  return cleaned;
}

function extractMusicUrl(value: string): string {
  return flattenWrappedMusicUrl(value);
}

function unwrapArg(value: string): string {
  return value.trim().replace(/^[{"]/, '').replace(/[}"]$/, '').trim();
}

async function resolveMessageUser(
  message: Message,
  query: string,
  mention: User | null,
): Promise<{ user: User; member: GuildMember | null } | null> {
  const mentionId = mention?.id ?? query.match(/^<@!?(\d+)>$/)?.[1] ?? null;
  const id = mentionId ?? (/^\d{17,20}$/.test(query) ? query : null);

  if (id) {
    const user = await message.client.users.fetch(id).catch(() => null);
    if (!user) {
      return null;
    }
    const member = message.guild ? await message.guild.members.fetch(id).catch(() => null) : null;
    return { user, member };
  }

  if (!query || !message.guild) {
    return null;
  }

  const needle = query.toLowerCase();
  const cached = message.guild.members.cache.find((member) => {
    return (
      member.user.username.toLowerCase() === needle ||
      member.displayName.toLowerCase() === needle ||
      member.user.tag.toLowerCase() === needle ||
      member.user.globalName?.toLowerCase() === needle
    );
  });

  if (cached) {
    return { user: cached.user, member: cached };
  }

  return null;
}

function toDiscordPayload(payload: CommandReplyInput): CommandReplyPayload {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  return {
    ...data,
    content: data.content ?? undefined,
  };
}

function missingArgMessage(optionName: string): string {
  switch (optionName) {
    case 'song_url':
    case 'song':
      return UserMessages.missingSongQuery;
    case 'album':
      return UserMessages.missingAlbumQuery;
    case 'artistname':
      return UserMessages.missingArtist;
    case 'user':
      return UserMessages.missingUser;
    default:
      return `❌ Missing \`${optionName}\`. Try \`${COMMAND_PREFIX}help\`.`;
  }
}
