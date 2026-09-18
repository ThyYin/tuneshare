import { listArtistCounts, listFavourites } from '../services/favourites';
import type { CommandReplyPayload } from './commandContext';
import {
  ALL_ARTISTS_FILTER,
  artistFilterKey,
  resolveArtistFilter,
  storeUnfavSearchToken,
  unfavFilterSelectId,
} from './customIds';
import { artistFilterSelectRow, favouritesListEmbeds, unfavCancelRow, unfavPaginationRow, unfavPickRow } from './embeds';
import { UserFacingError, UserMessages } from './errors';

export async function buildUnfavPickerMessage(options: {
  userId: string;
  displayName: string;
  page: number;
  artistKey?: string | null;
  query?: string | null;
}): Promise<CommandReplyPayload> {
  const query = options.query?.trim() || null;
  const searchToken = query ? storeUnfavSearchToken(options.userId, query) : null;
  const artists = await listArtistCounts(options.userId, { search: query });
  const artistKey = options.artistKey ?? ALL_ARTISTS_FILTER;
  const artistFilter = resolveArtistFilter(artistKey, artists);
  const resolvedKey = artistFilter ? artistFilterKey(artistFilter) : ALL_ARTISTS_FILTER;
  const pageData = await listFavourites(options.userId, options.page, {
    artist: artistFilter,
    search: query,
  });

  if (pageData.total === 0 && !artistFilter) {
    if (query) {
      throw new UserFacingError(unfavSearchEmptyMessage(query));
    }
    throw new UserFacingError(UserMessages.unfavEmpty);
  }

  const startIndex = (pageData.page - 1) * pageData.pageSize;
  const title = query
    ? `🗑️ Results for "${truncateTitle(query, 60)}"`
    : '🗑️ Pick a song to unfavourite';

  return {
    content:
      pageData.items.length > 0
        ? `Pick a song **${startIndex + 1}–${startIndex + pageData.items.length}**:`
        : undefined,
    embeds: favouritesListEmbeds(options.displayName, pageData, true, { title }),
    components: [
      pageData.items.length > 0 ? unfavPickRow(options.userId, pageData.items, startIndex) : null,
      artistFilterSelectRow(options.userId, artists, resolvedKey, {
        customId: unfavFilterSelectId(options.userId, searchToken),
        allDescription: query
          ? 'Show every song that matched this search'
          : 'Show every favourite you can remove',
      }),
      unfavCancelRow(options.userId),
      unfavPaginationRow(options.userId, pageData, {
        artistKey: resolvedKey,
        searchToken: searchToken ?? undefined,
      }),
    ].filter((row) => row !== null),
  };
}

export function unfavSearchEmptyMessage(query: string): string {
  return `❌ No favourites matched "${truncateTitle(query, 80)}". Try another title, or run \`t!unfav\` to browse your list.`;
}

function truncateTitle(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}
