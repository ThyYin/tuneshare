import { listArtistCounts, listFavourites } from '../services/favourites';
import { ALL_ARTISTS_FILTER, artistFilterKey, resolveArtistFilter } from './customIds';
import { artistFilterSelectRow, favouritesListEmbed, favouritesPaginationRow } from './embeds';

export async function buildFavouritesMessage(options: {
  targetUserId: string;
  displayName: string;
  isOwnList: boolean;
  page: number;
  artistKey?: string | null;
}) {
  const artists = await listArtistCounts(options.targetUserId);
  const artistKey = options.artistKey ?? ALL_ARTISTS_FILTER;
  const artistFilter = resolveArtistFilter(artistKey, artists);
  const resolvedKey = artistFilter ? artistFilterKey(artistFilter) : ALL_ARTISTS_FILTER;
  const pageData = await listFavourites(options.targetUserId, options.page, {
    artist: artistFilter,
  });

  const components = [
    artistFilterSelectRow(options.targetUserId, artists, resolvedKey),
    favouritesPaginationRow(options.targetUserId, pageData, resolvedKey),
  ].filter((row) => row !== null);

  return {
    embeds: [favouritesListEmbed(options.displayName, pageData, options.isOwnList)],
    components,
  };
}
