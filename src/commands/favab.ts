import { SlashCommandBuilder } from 'discord.js';
import { MAX_SONG_URL_LENGTH } from '../constants';
import { addFavouriteAlbum } from '../services/albumFavourites';
import { looksLikeAlbumInput, resolveAlbumFromUrl } from '../services/music/albumUrl';
import {
  fetchAlbumSearchHit,
  searchCatalogueAlbumsOrThrow,
  type AlbumSearchHit,
} from '../services/music/artistCatalogue';
import type { FavouriteAlbum } from '../types/favourite';
import type { Command } from '../types/command';
import { buildAlbumSearchMessage } from '../utils/albumSearchMessage';
import { addedFavouriteAlbumEmbed } from '../utils/embeds';
import { UserFacingError, UserMessages } from '../utils/errors';

export const favab: Command = {
  data: new SlashCommandBuilder()
    .setName('favab')
    .setDescription('Save an album to your favourites by name or link')
    .addStringOption((option) =>
      option
        .setName('album')
        .setDescription('An album name, or a Spotify, YouTube Music, Deezer, or SoundCloud link')
        .setRequired(true)
        .setMaxLength(MAX_SONG_URL_LENGTH),
    ),

  async execute(ctx) {
    const albumName = ctx.getString('album', true);
    if (!albumName) {
      throw new UserFacingError(UserMessages.missingAlbumQuery);
    }
    await ctx.deferReply();

    if (looksLikeAlbumInput(albumName)) {
      const hit = await resolveAlbumFromUrl(albumName);
      const album = await saveAlbumFromPick(ctx.user.id, hit);
      await ctx.editReply({
        embeds: [addedFavouriteAlbumEmbed(album)],
      });
      return;
    }

    const results = await searchCatalogueAlbumsOrThrow(albumName);
    await ctx.editReply(
      buildAlbumSearchMessage({
        action: 'fav',
        userId: ctx.user.id,
        query: albumName,
        results,
      }),
    );
  },
};

export async function saveAlbumFromPick(
  discordUserId: string,
  hit: AlbumSearchHit,
): Promise<FavouriteAlbum> {
  return addFavouriteAlbum({
    discordUserId,
    albumTitle: hit.name,
    artist: hit.artist,
    year: hit.year,
    totalTracks: hit.totalTracks,
    platform: hit.source,
    platformAlbumId: hit.albumId,
    url: hit.pageUrl,
    thumbnailUrl: hit.thumbnailUrl,
  });
}

export async function saveAlbumFromIds(
  discordUserId: string,
  source: AlbumSearchHit['source'],
  albumId: string,
): Promise<FavouriteAlbum> {
  const hit = await fetchAlbumSearchHit(source, albumId);
  if (!hit) {
    throw new UserFacingError(UserMessages.albumNotFound);
  }
  return saveAlbumFromPick(discordUserId, hit);
}
