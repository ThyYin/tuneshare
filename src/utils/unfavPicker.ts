import { FAVOURITES_PAGE_SIZE } from '../constants';
import { listFavourites } from '../services/favourites';
import type { Favourite } from '../types/favourite';
import type { CommandReplyPayload } from './commandContext';
import { favouritesListEmbeds, unfavPaginationRow, unfavPickRow } from './embeds';
import { UserFacingError, UserMessages } from './errors';

export async function buildUnfavPickerMessage(options: {
  userId: string;
  displayName: string;
  page: number;
}): Promise<CommandReplyPayload> {
  const pageData = await listFavourites(options.userId, options.page);

  if (pageData.total === 0) {
    throw new UserFacingError(UserMessages.unfavEmpty);
  }

  const startIndex = (pageData.page - 1) * pageData.pageSize;

  return {
    content: `Pick a song **${startIndex + 1}–${startIndex + pageData.items.length}**:`,
    embeds: favouritesListEmbeds(options.displayName, pageData, true, {
      title: '🗑️ Pick a song to unfavourite',
    }),
    components: [
      unfavPickRow(options.userId, pageData.items, startIndex),
      unfavPaginationRow(options.userId, pageData),
    ].filter((row) => row !== null),
  };
}

export function buildUnfavMatchMessage(userId: string, matches: Favourite[]): CommandReplyPayload {
  const items = matches.slice(0, FAVOURITES_PAGE_SIZE);
  const pageData = {
    items,
    page: 1,
    pageSize: items.length,
    total: items.length,
    totalPages: 1,
    artistFilter: null,
  };

  return {
    content:
      matches.length > items.length
        ? `Showing the first ${items.length} matches — pick a number, or type a more specific title.`
        : `Pick a song **1–${items.length}**:`,
    embeds: favouritesListEmbeds('Your', pageData, true, {
      title: '🗑️ Pick a song to unfavourite',
    }),
    components: [unfavPickRow(userId, items, 0)],
  };
}
