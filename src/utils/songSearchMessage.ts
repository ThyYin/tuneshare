import type { SongSearchHit } from '../services/music/types';
import type { CommandReplyPayload } from './commandContext';
import type { SongSearchAction } from './customIds';
import { songSearchCancelRow, songSearchEmbeds, songSearchPickRow } from './embeds';

export function buildSongSearchMessage(options: {
  action: SongSearchAction;
  userId: string;
  query: string;
  results: SongSearchHit[];
}): CommandReplyPayload {
  return {
    content: `Pick a result **1–${options.results.length}**:`,
    embeds: songSearchEmbeds(options.query, options.results),
    components: [
      songSearchPickRow(options.action, options.userId, options.results),
      songSearchCancelRow(options.action, options.userId),
    ],
  };
}
