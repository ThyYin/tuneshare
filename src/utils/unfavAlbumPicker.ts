import { listAlbumArtistCounts, listFavouriteAlbums } from '../services/albumFavourites';
import type { CommandReplyPayload } from './commandContext';
import {
  ALL_ARTISTS_FILTER,
  artistFilterKey,
  resolveArtistFilter,
  storeUnfavSearchToken,
  unfavAlbumFilterSelectId,
} from './customIds';
import {
  artistFilterSelectRow,
  favouriteAlbumsListEmbeds,
  unfavAlbumCancelRow,
  unfavAlbumPaginationRow,
  unfavAlbumPickRow,
} from './embeds';
import { UserFacingError, UserMessages } from './errors';

export async function buildUnfavAlbumPickerMessage(options: {
  userId: string;
  displayName: string;
  page: number;
  artistKey?: string | null;
  query?: string | null;
}): Promise<CommandReplyPayload> {
  const query = options.query?.trim() || null;
  const searchToken = query ? storeUnfavSearchToken(options.userId, query) : null;
  const artists = await listAlbumArtistCounts(options.userId, { search: query });
  const artistKey = options.artistKey ?? ALL_ARTISTS_FILTER;
  const artistFilter = resolveArtistFilter(artistKey, artists);
  const resolvedKey = artistFilter ? artistFilterKey(artistFilter) : ALL_ARTISTS_FILTER;
  const pageData = await listFavouriteAlbums(options.userId, options.page, {
    artist: artistFilter,
    search: query,
  });

  if (pageData.total === 0 && !artistFilter) {
    if (query) {
      throw new UserFacingError(unfavAlbumSearchEmptyMessage(query));
    }
    throw new UserFacingError(UserMessages.unfavAlbumEmpty);
  }

  const startIndex = (pageData.page - 1) * pageData.pageSize;
  const title = query
    ? `🗑️ Album results for "${truncateTitle(query, 60)}"`
    : '🗑️ Pick an album to unfavourite';

  return {
    content:
      pageData.items.length > 0
        ? `Pick an album **${startIndex + 1}–${startIndex + pageData.items.length}**:`
        : undefined,
    embeds: favouriteAlbumsListEmbeds(options.displayName, pageData, true, { title, accent: 'remove' }),
    components: [
      pageData.items.length > 0 ? unfavAlbumPickRow(options.userId, pageData.items, startIndex) : null,
      artistFilterSelectRow(options.userId, artists, resolvedKey, {
        customId: unfavAlbumFilterSelectId(options.userId, searchToken),
        allDescription: query
          ? 'Show every album that matched this search'
          : 'Show every favourite album you can remove',
        countNoun: 'album',
      }),
      unfavAlbumCancelRow(options.userId),
      unfavAlbumPaginationRow(options.userId, pageData, {
        artistKey: resolvedKey,
        searchToken: searchToken ?? undefined,
      }),
    ].filter((row) => row !== null),
  };
}

export function unfavAlbumSearchEmptyMessage(query: string): string {
  return `❌ No favourite albums matched "${truncateTitle(query, 80)}". Try another title, or run \`t!unfavab\` to browse your list.`;
}

function truncateTitle(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}
