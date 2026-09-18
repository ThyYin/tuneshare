import type { AlbumSearchHit } from '../services/music/artistCatalogue';
import type { CommandReplyPayload } from './commandContext';
import type { AlbumSearchAction } from './customIds';
import { albumSearchCancelRow, albumSearchEmbeds, albumSearchPickRow } from './embeds';

export function buildAlbumSearchMessage(options: {
  action: AlbumSearchAction;
  userId: string;
  query: string;
  results: AlbumSearchHit[];
}): CommandReplyPayload {
  return {
    content: `Pick a result **1–${options.results.length}**:`,
    embeds: albumSearchEmbeds(options.query, options.results),
    components: [
      albumSearchPickRow(options.action, options.userId, options.results),
      albumSearchCancelRow(options.action, options.userId),
    ],
  };
}
