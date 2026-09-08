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
import { commands } from '../commands';
import { listTopArtists } from '../services/favourites';
import {
  parseFavouritesButtonId,
  parseFavouritesFilterSelectId,
  parseTopArtistsButtonId,
  ALL_ARTISTS_FILTER,
} from '../utils/customIds';
import { createInteractionContext } from '../utils/commandContext';
import { getDisplayName } from '../utils/displayName';
import { topArtistsEmbed, topArtistsPaginationRow } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildFavouritesMessage } from '../utils/favouritesMessage';
import { logger } from '../utils/logger';

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
