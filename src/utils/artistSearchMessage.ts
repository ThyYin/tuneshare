import type { ArtistSearchHit } from '../services/music/artistCatalogue';
import type { CommandReplyPayload } from './commandContext';
import type { ArtistSearchAction } from './customIds';
import { artistSearchCancelRow, artistSearchEmbeds, artistSearchPickRow } from './embeds';

export function buildArtistSearchMessage(options: {
  action: ArtistSearchAction;
  userId: string;
  query: string;
  results: ArtistSearchHit[];
}): CommandReplyPayload {
  return {
    content: `Pick a result **1–${options.results.length}**:`,
    embeds: artistSearchEmbeds(options.query, options.results),
    components: [
      artistSearchPickRow(options.action, options.userId, options.results),
      artistSearchCancelRow(options.action, options.userId),
    ],
  };
}
