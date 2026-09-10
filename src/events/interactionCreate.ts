import {
  Client,
  Events,
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { saveSongFromPick } from '../commands/fav';
import { commands } from '../commands';
import { listTopArtists, removeFavourite } from '../services/favourites';
import { fetchSongInfo, parsedSongFromParts } from '../services/music';
import {
  parseFavouritesButtonId,
  parseFavouritesFilterSelectId,
  parseSearchPickButtonId,
  parseTopArtistsButtonId,
  parseUnfavPageButtonId,
  parseUnfavSongButtonId,
  ALL_ARTISTS_FILTER,
} from '../utils/customIds';
import { createInteractionContext } from '../utils/commandContext';
import { getDisplayName } from '../utils/displayName';
import {
  addedFavouriteEmbed,
  removedFavouriteEmbed,
  songInfoEmbed,
  topArtistsEmbed,
  topArtistsPaginationRow,
} from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildFavouritesMessage } from '../utils/favouritesMessage';
import { logger } from '../utils/logger';
import { buildUnfavPickerMessage } from '../utils/unfavPicker';

export function registerInteractionCreateEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction);
        return;
      }

      if (interaction.isChatInputCommand()) {
        await handleChatInput(interaction);
      }
    } catch (error) {
      await handleError(interaction, error);
    }
  });
}

async function handleChatInput(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);

  if (!command) {
    logger.warn(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  await command.execute(createInteractionContext(interaction));
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);

  if (!command?.autocomplete) {
    await interaction.respond([]);
    return;
  }

  try {
    await command.autocomplete(interaction);
  } catch (error) {
    logger.error(`Autocomplete failed for /${interaction.commandName}`, error);

    if (!interaction.responded) {
      await interaction.respond([]);
    }
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const targetUserId = parseFavouritesFilterSelectId(interaction.customId);

  if (!targetUserId) {
    return;
  }

  const message = await buildFavouritesPageUpdate(
    interaction,
    targetUserId,
    1,
    interaction.values[0] ?? ALL_ARTISTS_FILTER,
  );
  await interaction.update(message);
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const searchPick = parseSearchPickButtonId(interaction.customId);
  if (searchPick) {
    await handleSearchPick(interaction, searchPick);
    return;
  }

  const unfavSong = parseUnfavSongButtonId(interaction.customId);
  if (unfavSong) {
    await handleUnfavPick(interaction, unfavSong.userId, unfavSong.songId);
    return;
  }

  const unfavPage = parseUnfavPageButtonId(interaction.customId);
  if (unfavPage) {
    requirePickerOwner(interaction.user.id, unfavPage.userId);
    const message = await buildUnfavPickerMessage({
      userId: unfavPage.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: unfavPage.page,
    });
    await interaction.update(message);
    return;
  }

  const topArtists = parseTopArtistsButtonId(interaction.customId);
  if (topArtists) {
    const pageData = await listTopArtists(topArtists.targetUserId, topArtists.page);
    const user = await interaction.client.users.fetch(topArtists.targetUserId);
    const member = interaction.guild
      ? await interaction.guild.members.fetch(topArtists.targetUserId).catch(() => null)
      : null;
    const row = topArtistsPaginationRow(topArtists.targetUserId, pageData);

    await interaction.update({
      embeds: [topArtistsEmbed(getDisplayName(user, member), pageData)],
      components: row ? [row] : [],
    });
    return;
  }

  const favourites = parseFavouritesButtonId(interaction.customId);
  if (!favourites) {
    return;
  }

  const message = await buildFavouritesPageUpdate(
    interaction,
    favourites.targetUserId,
    favourites.page,
    favourites.artistKey,
  );
  await interaction.update(message);
}

async function handleSearchPick(
  interaction: ButtonInteraction,
  pick: NonNullable<ReturnType<typeof parseSearchPickButtonId>>,
): Promise<void> {
  requirePickerOwner(interaction.user.id, pick.userId);
  await interaction.deferUpdate();

  const parsed = parsedSongFromParts(pick.platform, pick.platformSongId);

  try {
    if (pick.action === 'fav') {
      const result = await saveSongFromPick(interaction.user.id, pick.platform, pick.platformSongId);
      await interaction.editReply({
        content: null,
        embeds: [addedFavouriteEmbed(result.favourite, result.metadataMissing)],
        components: [],
      });
      return;
    }

    const details = await fetchSongInfo(parsed);
    await interaction.editReply({
      content: null,
      embeds: [songInfoEmbed(details)],
      components: [],
    });
  } catch (error) {
    if (error instanceof UserFacingError && error.userMessage === UserMessages.duplicate) {
      await interaction.followUp({
        content: error.userMessage,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    throw error;
  }
}

async function handleUnfavPick(
  interaction: ButtonInteraction,
  ownerId: string,
  songId: string,
): Promise<void> {
  requirePickerOwner(interaction.user.id, ownerId);

  const favourite = await removeFavourite(songId, interaction.user.id);
  await interaction.update({
    content: null,
    embeds: [removedFavouriteEmbed(favourite)],
    components: [],
  });
}

function requirePickerOwner(actorId: string, ownerId: string): void {
  if (actorId !== ownerId) {
    throw new UserFacingError(UserMessages.pickerNotYours);
  }
}

async function buildFavouritesPageUpdate(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  targetUserId: string,
  page: number,
  artistKey: string | undefined,
) {
  const user = await interaction.client.users.fetch(targetUserId);
  const member = interaction.guild
    ? await interaction.guild.members.fetch(targetUserId).catch(() => null)
    : null;

  return buildFavouritesMessage({
    targetUserId,
    displayName: getDisplayName(user, member),
    isOwnList: targetUserId === interaction.user.id,
    page,
    artistKey,
  });
}

async function handleError(interaction: Interaction, error: unknown): Promise<void> {
  const commandName = interaction.isCommand() ? interaction.commandName : interaction.id;

  if (error instanceof UserFacingError) {
    await replyToInteraction(interaction, error.userMessage, error.ephemeral);
    return;
  }

  logger.error(`Error handling interaction ${commandName}`, error);
  await replyToInteraction(interaction, UserMessages.generic, true);
}

async function replyToInteraction(
  interaction: Interaction,
  content: string,
  ephemeral: boolean,
): Promise<void> {
  if (!interaction.isRepliable()) {
    return;
  }

  const payload = {
    content,
    embeds: [] as [],
    components: [] as [],
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }

    if (ephemeral) {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(payload);
  } catch (replyError) {
    logger.error('Failed to send error reply', replyError);
  }
}
