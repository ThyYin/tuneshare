import { listAlbumArtistCounts, listFavouriteAlbums } from '../services/albumFavourites';
import { ALL_ARTISTS_FILTER, artistFilterKey, resolveArtistFilter } from './customIds';
import { albumFavouritesPaginationRow, artistFilterSelectRow, favouriteAlbumsListEmbeds } from './embeds';

export async function buildAlbumFavouritesMessage(options: {
  targetUserId: string;
  displayName: string;
  isOwnList: boolean;
  page: number;
  artistKey?: string | null;
}) {
  const artists = await listAlbumArtistCounts(options.targetUserId);
  const artistKey = options.artistKey ?? ALL_ARTISTS_FILTER;
  const artistFilter = resolveArtistFilter(artistKey, artists);
  const resolvedKey = artistFilter ? artistFilterKey(artistFilter) : ALL_ARTISTS_FILTER;
  const pageData = await listFavouriteAlbums(options.targetUserId, options.page, {
    artist: artistFilter,
  });

  const components = [
    artistFilterSelectRow(options.targetUserId, artists, resolvedKey, {
      customId: `favsab-filter:${options.targetUserId}`,
      allDescription: 'Show every favourite album',
      countNoun: 'album',
    }),
    albumFavouritesPaginationRow(options.targetUserId, pageData, resolvedKey),
  ].filter((row) => row !== null);

  return {
    embeds: favouriteAlbumsListEmbeds(options.displayName, pageData, options.isOwnList),
    components,
  };
}
