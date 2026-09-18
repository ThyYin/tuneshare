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
import { saveAlbumFromIds } from '../commands/favab';
import { saveSongFromPick } from '../commands/fav';
import { commands } from '../commands';
import { lookupArtistFromPick } from '../services/artists';
import { listTopArtists, removeFavourite } from '../services/favourites';
import { removeFavouriteAlbum } from '../services/albumFavourites';
import { fetchSongInfo, parsedSongFromParts } from '../services/music';
import { getAlbumTracks, getArtistAlbums } from '../services/music/artistCatalogue';
import {
  parseAlbumFavouritesButtonId,
  parseAlbumFavouritesFilterSelectId,
  parseAlbumLookupTracksButtonId,
  parseAlbumSearchCancelButtonId,
  parseAlbumSearchPickButtonId,
  parseArtistSearchCancelButtonId,
  parseArtistSearchPickButtonId,
  parseCatalogueAlbumPickButtonId,
  parseCatalogueAlbumsButtonId,
  parseCatalogueTracksButtonId,
  parseFavouritesButtonId,
  parseFavouritesFilterSelectId,
  parseSearchCancelButtonId,
  parseSearchPickButtonId,
  parseTopArtistsButtonId,
  parseUnfavAlbumButtonId,
  parseUnfavAlbumCancelButtonId,
  parseUnfavAlbumFilterSelectId,
  parseUnfavAlbumPageButtonId,
  parseUnfavAlbumSearchPageButtonId,
  parseUnfavCancelButtonId,
  parseUnfavFilterSelectId,
  parseUnfavPageButtonId,
  parseUnfavSearchPageButtonId,
  parseUnfavSongButtonId,
  loadUnfavSearchQuery,
  ALL_ARTISTS_FILTER,
} from '../utils/customIds';
import { createInteractionContext } from '../utils/commandContext';
import { getDisplayName } from '../utils/displayName';
import {
  addedFavouriteAlbumEmbed,
  addedFavouriteEmbed,
  artistProfileEmbed,
  removedFavouriteAlbumEmbed,
  removedFavouriteEmbed,
  songInfoEmbed,
  topArtistsEmbed,
  topArtistsPaginationRow,
} from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';
import { buildAlbumLookupTracksMessage, buildArtistAlbumsMessage, buildArtistTracksMessage } from '../utils/artistCatalogueMessage';
import { buildAlbumFavouritesMessage } from '../utils/albumFavouritesMessage';
import { buildFavouritesMessage } from '../utils/favouritesMessage';
import { logger } from '../utils/logger';
import { buildUnfavAlbumPickerMessage } from '../utils/unfavAlbumPicker';
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
  const unfavAlbumFilter = parseUnfavAlbumFilterSelectId(interaction.customId);
  if (unfavAlbumFilter) {
    requirePickerOwner(interaction.user.id, unfavAlbumFilter.userId);
    const query = unfavAlbumFilter.searchToken
      ? loadUnfavSearchQuery(unfavAlbumFilter.userId, unfavAlbumFilter.searchToken)
      : null;
    if (unfavAlbumFilter.searchToken && !query) {
      throw new UserFacingError(UserMessages.unfavAlbumSearchExpired);
    }
    const message = await buildUnfavAlbumPickerMessage({
      userId: unfavAlbumFilter.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: 1,
      artistKey: interaction.values[0] ?? ALL_ARTISTS_FILTER,
      query,
    });
    await interaction.update(message);
    return;
  }

  const unfavFilter = parseUnfavFilterSelectId(interaction.customId);
  if (unfavFilter) {
    requirePickerOwner(interaction.user.id, unfavFilter.userId);
    const query = unfavFilter.searchToken
      ? loadUnfavSearchQuery(unfavFilter.userId, unfavFilter.searchToken)
      : null;
    if (unfavFilter.searchToken && !query) {
      throw new UserFacingError(UserMessages.unfavSearchExpired);
    }
    const message = await buildUnfavPickerMessage({
      userId: unfavFilter.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: 1,
      artistKey: interaction.values[0] ?? ALL_ARTISTS_FILTER,
      query,
    });
    await interaction.update(message);
    return;
  }

  const albumFavsUserId = parseAlbumFavouritesFilterSelectId(interaction.customId);
  if (albumFavsUserId) {
    const message = await buildAlbumFavouritesPageUpdate(
      interaction,
      albumFavsUserId,
      1,
      interaction.values[0] ?? ALL_ARTISTS_FILTER,
    );
    await interaction.update(message);
    return;
  }

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
  const albumSearchCancel = parseAlbumSearchCancelButtonId(interaction.customId);
  if (albumSearchCancel) {
    requirePickerOwner(interaction.user.id, albumSearchCancel.userId);
    await interaction.update({
      content:
        albumSearchCancel.action === 'fav'
          ? UserMessages.pickerCancelledFavAlbum
          : UserMessages.pickerCancelled,
      embeds: [],
      components: [],
    });
    return;
  }

  const albumSearchPick = parseAlbumSearchPickButtonId(interaction.customId);
  if (albumSearchPick) {
    await handleAlbumSearchPick(interaction, albumSearchPick);
    return;
  }

  const albumLookupTracks = parseAlbumLookupTracksButtonId(interaction.customId);
  if (albumLookupTracks) {
    requirePickerOwner(interaction.user.id, albumLookupTracks.userId);
    await interaction.deferUpdate();
    const tracks = await getAlbumTracks(
      albumLookupTracks.source,
      albumLookupTracks.artistId,
      albumLookupTracks.albumId,
      albumLookupTracks.page,
    );
    if (!tracks) {
      throw new UserFacingError(UserMessages.catalogueFailed);
    }
    await interaction.editReply(
      buildAlbumLookupTracksMessage({
        userId: albumLookupTracks.userId,
        tracks,
      }),
    );
    return;
  }

  const artistSearchCancel = parseArtistSearchCancelButtonId(interaction.customId);
  if (artistSearchCancel) {
    requirePickerOwner(interaction.user.id, artistSearchCancel.userId);
    await interaction.update({
      content: UserMessages.pickerCancelled,
      embeds: [],
      components: [],
    });
    return;
  }

  const artistSearchPick = parseArtistSearchPickButtonId(interaction.customId);
  if (artistSearchPick) {
    await handleArtistSearchPick(interaction, artistSearchPick);
    return;
  }

  const searchCancel = parseSearchCancelButtonId(interaction.customId);
  if (searchCancel) {
    requirePickerOwner(interaction.user.id, searchCancel.userId);
    await interaction.update({
      content:
        searchCancel.action === 'fav' ? UserMessages.pickerCancelledFav : UserMessages.pickerCancelled,
      embeds: [],
      components: [],
    });
    return;
  }

  const searchPick = parseSearchPickButtonId(interaction.customId);
  if (searchPick) {
    await handleSearchPick(interaction, searchPick);
    return;
  }

  const unfavAlbumCancel = parseUnfavAlbumCancelButtonId(interaction.customId);
  if (unfavAlbumCancel) {
    requirePickerOwner(interaction.user.id, unfavAlbumCancel);
    await interaction.update({
      content: UserMessages.pickerCancelledUnfavAlbum,
      embeds: [],
      components: [],
    });
    return;
  }

  const unfavAlbum = parseUnfavAlbumButtonId(interaction.customId);
  if (unfavAlbum) {
    await handleUnfavAlbumPick(interaction, unfavAlbum.userId, unfavAlbum.albumId);
    return;
  }

  const unfavAlbumSearchPage = parseUnfavAlbumSearchPageButtonId(interaction.customId);
  if (unfavAlbumSearchPage) {
    requirePickerOwner(interaction.user.id, unfavAlbumSearchPage.userId);
    const query = loadUnfavSearchQuery(unfavAlbumSearchPage.userId, unfavAlbumSearchPage.token);
    if (!query) {
      throw new UserFacingError(UserMessages.unfavAlbumSearchExpired);
    }
    const message = await buildUnfavAlbumPickerMessage({
      userId: unfavAlbumSearchPage.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: unfavAlbumSearchPage.page,
      artistKey: unfavAlbumSearchPage.artistKey,
      query,
    });
    await interaction.update(message);
    return;
  }

  const unfavAlbumPage = parseUnfavAlbumPageButtonId(interaction.customId);
  if (unfavAlbumPage) {
    requirePickerOwner(interaction.user.id, unfavAlbumPage.userId);
    const message = await buildUnfavAlbumPickerMessage({
      userId: unfavAlbumPage.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: unfavAlbumPage.page,
      artistKey: unfavAlbumPage.artistKey,
    });
    await interaction.update(message);
    return;
  }

  const unfavCancel = parseUnfavCancelButtonId(interaction.customId);
  if (unfavCancel) {
    requirePickerOwner(interaction.user.id, unfavCancel);
    await interaction.update({
      content: UserMessages.pickerCancelledUnfav,
      embeds: [],
      components: [],
    });
    return;
  }

  const unfavSong = parseUnfavSongButtonId(interaction.customId);
  if (unfavSong) {
    await handleUnfavPick(interaction, unfavSong.userId, unfavSong.songId);
    return;
  }

  const unfavSearchPage = parseUnfavSearchPageButtonId(interaction.customId);
  if (unfavSearchPage) {
    requirePickerOwner(interaction.user.id, unfavSearchPage.userId);
    const query = loadUnfavSearchQuery(unfavSearchPage.userId, unfavSearchPage.token);
    if (!query) {
      throw new UserFacingError(UserMessages.unfavSearchExpired);
    }
    const message = await buildUnfavPickerMessage({
      userId: unfavSearchPage.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: unfavSearchPage.page,
      artistKey: unfavSearchPage.artistKey,
      query,
    });
    await interaction.update(message);
    return;
  }

  const unfavPage = parseUnfavPageButtonId(interaction.customId);
  if (unfavPage) {
    requirePickerOwner(interaction.user.id, unfavPage.userId);
    const message = await buildUnfavPickerMessage({
      userId: unfavPage.userId,
      displayName: getDisplayName(interaction.user, interaction.member),
      page: unfavPage.page,
      artistKey: unfavPage.artistKey,
    });
    await interaction.update(message);
    return;
  }

  const albumPick = parseCatalogueAlbumPickButtonId(interaction.customId);
  if (albumPick) {
    requirePickerOwner(interaction.user.id, albumPick.userId);
    await interaction.deferUpdate();
    const tracks = await getAlbumTracks(
      albumPick.source,
      albumPick.artistId,
      albumPick.albumId,
      1,
    );
    if (!tracks) {
      throw new UserFacingError(UserMessages.catalogueFailed);
    }
    await interaction.editReply(
      buildArtistTracksMessage({
        userId: albumPick.userId,
        tracks,
        albumsPage: albumPick.albumsPage,
      }),
    );
    return;
  }

  const albumTracks = parseCatalogueTracksButtonId(interaction.customId);
  if (albumTracks) {
    requirePickerOwner(interaction.user.id, albumTracks.userId);
    await interaction.deferUpdate();
    const tracks = await getAlbumTracks(
      albumTracks.source,
      albumTracks.artistId,
      albumTracks.albumId,
      albumTracks.trackPage,
    );
    if (!tracks) {
      throw new UserFacingError(UserMessages.catalogueFailed);
    }
    await interaction.editReply(
      buildArtistTracksMessage({
        userId: albumTracks.userId,
        tracks,
        albumsPage: albumTracks.albumsPage,
      }),
    );
    return;
  }

  const artistAlbums = parseCatalogueAlbumsButtonId(interaction.customId);
  if (artistAlbums) {
    requirePickerOwner(interaction.user.id, artistAlbums.userId);
    await interaction.deferUpdate();
    const albums = await getArtistAlbums(artistAlbums.source, artistAlbums.artistId, artistAlbums.page);
    if (!albums) {
      throw new UserFacingError(UserMessages.catalogueFailed);
    }
    await interaction.editReply(
      buildArtistAlbumsMessage({
        userId: artistAlbums.userId,
        albums,
      }),
    );
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

  const albumFavourites = parseAlbumFavouritesButtonId(interaction.customId);
  if (albumFavourites) {
    const message = await buildAlbumFavouritesPageUpdate(
      interaction,
      albumFavourites.targetUserId,
      albumFavourites.page,
      albumFavourites.artistKey,
    );
    await interaction.update(message);
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

async function handleArtistSearchPick(
  interaction: ButtonInteraction,
  pick: NonNullable<ReturnType<typeof parseArtistSearchPickButtonId>>,
): Promise<void> {
  requirePickerOwner(interaction.user.id, pick.userId);
  await interaction.deferUpdate();

  if (pick.action === 'info') {
    const profile = await lookupArtistFromPick(pick.source, pick.artistId);
    if (!profile) {
      throw new UserFacingError(UserMessages.artistNotFound);
    }

    await interaction.editReply({
      content: '',
      embeds: [artistProfileEmbed(profile)],
      components: [],
    });
    return;
  }

  const albums = await getArtistAlbums(pick.source, pick.artistId, 1);
  if (!albums) {
    throw new UserFacingError(UserMessages.artistNotFound);
  }
  if (albums.total === 0) {
    throw new UserFacingError(UserMessages.catalogueEmpty);
  }

  await interaction.editReply(
    buildArtistAlbumsMessage({
      userId: pick.userId,
      albums,
    }),
  );
}

async function handleAlbumSearchPick(
  interaction: ButtonInteraction,
  pick: NonNullable<ReturnType<typeof parseAlbumSearchPickButtonId>>,
): Promise<void> {
  requirePickerOwner(interaction.user.id, pick.userId);
  await interaction.deferUpdate();

  try {
    if (pick.action === 'fav') {
      const album = await saveAlbumFromIds(interaction.user.id, pick.source, pick.albumId);
      await interaction.editReply({
        content: null,
        embeds: [addedFavouriteAlbumEmbed(album)],
        components: [],
      });
      return;
    }

    const tracks = await getAlbumTracks(pick.source, pick.artistId, pick.albumId, 1);
    if (!tracks) {
      throw new UserFacingError(UserMessages.albumNotFound);
    }

    await interaction.editReply(
      buildAlbumLookupTracksMessage({
        userId: pick.userId,
        tracks,
      }),
    );
  } catch (error) {
    if (error instanceof UserFacingError && error.userMessage === UserMessages.duplicateAlbum) {
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

async function handleUnfavAlbumPick(
  interaction: ButtonInteraction,
  ownerId: string,
  albumId: string,
): Promise<void> {
  requirePickerOwner(interaction.user.id, ownerId);

  const album = await removeFavouriteAlbum(albumId, interaction.user.id);
  await interaction.update({
    content: null,
    embeds: [removedFavouriteAlbumEmbed(album)],
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

async function buildAlbumFavouritesPageUpdate(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  targetUserId: string,
  page: number,
  artistKey: string | undefined,
) {
  const user = await interaction.client.users.fetch(targetUserId);
  const member = interaction.guild
    ? await interaction.guild.members.fetch(targetUserId).catch(() => null)
    : null;

  return buildAlbumFavouritesMessage({
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
