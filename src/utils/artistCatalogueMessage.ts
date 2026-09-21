import type { ArtistProfile } from '../services/artists';
import type { AlbumTracksPage, PaginatedAlbums } from '../services/music/artistCatalogue';
import type { CommandReplyPayload } from './commandContext';
import {
  artistAlbumPickRow,
  artistAlbumsEmbeds,
  artistAlbumsPaginationRow,
  artistTracksEmbed,
  artistTracksNavRow,
} from './embeds';

export function buildArtistAlbumsMessage(options: {
  userId: string;
  albums: PaginatedAlbums;
  profile?: ArtistProfile | null;
}): CommandReplyPayload {
  return {
    content: options.albums.items.length > 0 ? 'Pick an album to view its tracks:' : undefined,
    embeds: artistAlbumsEmbeds(options.albums, options.profile),
    components: [
      artistAlbumPickRow(options.userId, options.albums),
      artistAlbumsPaginationRow(options.userId, options.albums),
    ].filter((row) => row !== null),
  };
}

export function buildArtistTracksMessage(options: {
  userId: string;
  tracks: AlbumTracksPage;
  albumsPage: number;
}): CommandReplyPayload {
  return {
    content: '',
    embeds: [artistTracksEmbed(options.tracks)],
    components: [artistTracksNavRow(options.userId, options.tracks, options.albumsPage)].filter(
      (row) => row !== null,
    ),
  };
}

export function buildAlbumLookupTracksMessage(options: {
  userId: string;
  tracks: AlbumTracksPage;
}): CommandReplyPayload {
  const row = artistTracksNavRow(options.userId, options.tracks, 1, { showBack: false });
  return {
    content: '',
    embeds: [artistTracksEmbed(options.tracks)],
    components: row ? [row] : [],
  };
}
