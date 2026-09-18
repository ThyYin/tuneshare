import { SlashCommandBuilder } from 'discord.js';
import { addFavouriteAlbum } from '../services/albumFavourites';
import {
  fetchAlbumSearchHit,
  searchCatalogueAlbumsOrThrow,
  type AlbumSearchHit,
} from '../services/music/artistCatalogue';
import type { FavouriteAlbum } from '../types/favourite';
import type { Command } from '../types/command';
import { buildAlbumSearchMessage } from '../utils/albumSearchMessage';
import { UserFacingError, UserMessages } from '../utils/errors';

export const favab: Command = {
  data: new SlashCommandBuilder()
    .setName('favab')
    .setDescription('Save an album to your favourites')
    .addStringOption((option) =>
      option
        .setName('album')
        .setDescription('The album to favourite')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(80),
    ),

  async execute(ctx) {
    const albumName = ctx.getString('album', true);
    if (!albumName) {
      throw new UserFacingError(UserMessages.missingAlbumQuery);
    }
    await ctx.deferReply();

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
