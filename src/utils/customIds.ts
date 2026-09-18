import { createHash } from 'crypto';
import type { CatalogueSource } from '../services/music/artistCatalogue';
import type { Platform } from '../types/favourite';

export const ALL_ARTISTS_FILTER = 'all';
export type SongSearchAction = 'fav' | 'info';
export type ArtistSearchAction = 'info' | 'cat';
export type AlbumSearchAction = 'info' | 'fav';

const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const DEEZER_ID_PATTERN = /^\d{1,12}$/;

export function artistFilterKey(artist: string): string {
  return createHash('sha256').update(artist.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function parseFavouritesButtonId(
  customId: string,
): { targetUserId: string; page: number; artistKey: string } | null {
  const match = customId.match(/^favs:(\d+):(\d+)(?::([a-z0-9]+))?$/);

  if (!match) {
    return null;
  }

  return {
    targetUserId: match[1],
    page: Number(match[2]),
    artistKey: match[3] ?? ALL_ARTISTS_FILTER,
  };
}

export function parseFavouritesFilterSelectId(customId: string): string | null {
  const match = customId.match(/^favs-filter:(\d+)$/);
  return match?.[1] ?? null;
}

export function parseUnfavFilterSelectId(
  customId: string,
): { userId: string; searchToken: string | null } | null {
  const match = customId.match(/^unfav-filter:(\d+)(?::([a-f0-9]{12}))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    searchToken: match[2] ?? null,
  };
}

export function unfavFilterSelectId(userId: string, searchToken?: string | null): string {
  return searchToken ? `unfav-filter:${userId}:${searchToken}` : `unfav-filter:${userId}`;
}

export function parseTopArtistsButtonId(
  customId: string,
): { targetUserId: string; page: number } | null {
  const match = customId.match(/^topart:(\d+):(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    targetUserId: match[1],
    page: Number(match[2]),
  };
}

export function resolveArtistFilter(
  artistKey: string,
  artists: Array<{ artist: string }>,
): string | null {
  if (!artistKey || artistKey === ALL_ARTISTS_FILTER) {
    return null;
  }

  return artists.find((item) => artistFilterKey(item.artist) === artistKey)?.artist ?? null;
}

export function searchPickButtonId(
  action: SongSearchAction,
  userId: string,
  platform: Platform,
  platformSongId: string,
): string {
  return `search:${action}:${userId}:${platform === 'spotify' ? 's' : 'y'}:${platformSongId}`;
}

export function searchCancelButtonId(action: SongSearchAction, userId: string): string {
  return `search-cancel:${action}:${userId}`;
}

export function parseSearchCancelButtonId(
  customId: string,
): { action: SongSearchAction; userId: string } | null {
  const match = customId.match(/^search-cancel:(fav|info):(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as SongSearchAction,
    userId: match[2],
  };
}

function parsePlatformSong(code: string, platformSongId: string): { platform: Platform; platformSongId: string } | null {
  if (code === 's' && SPOTIFY_ID_PATTERN.test(platformSongId)) {
    return { platform: 'spotify', platformSongId };
  }
  if (code === 'y' && /^[A-Za-z0-9_-]{11}$/.test(platformSongId)) {
    return { platform: 'youtube_music', platformSongId };
  }

  return null;
}

export function parseSearchPickButtonId(
  customId: string,
): { action: SongSearchAction; userId: string; platform: Platform; platformSongId: string } | null {
  const match = customId.match(/^search:(fav|info):(\d+):([sy]):([A-Za-z0-9_-]+)$/);
  if (!match) {
    return null;
  }

  const song = parsePlatformSong(match[3], match[4]);
  if (!song) {
    return null;
  }

  return {
    action: match[1] as SongSearchAction,
    userId: match[2],
    ...song,
  };
}

export function artistSearchPickButtonId(
  action: ArtistSearchAction,
  userId: string,
  source: CatalogueSource,
  artistId: string,
): string {
  return `art-pick:${action}:${userId}:${catalogueSourceCode(source)}${artistId}`;
}

export function parseArtistSearchPickButtonId(customId: string): {
  action: ArtistSearchAction;
  userId: string;
  source: CatalogueSource;
  artistId: string;
} | null {
  const match = customId.match(/^art-pick:(info|cat):(\d+):([sd])([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[3]);
  if (!source || !isValidCatalogueId(source, match[4])) {
    return null;
  }

  return {
    action: match[1] as ArtistSearchAction,
    userId: match[2],
    source,
    artistId: match[4],
  };
}

export function artistSearchCancelButtonId(action: ArtistSearchAction, userId: string): string {
  return `art-cancel:${action}:${userId}`;
}

export function parseArtistSearchCancelButtonId(
  customId: string,
): { action: ArtistSearchAction; userId: string } | null {
  const match = customId.match(/^art-cancel:(info|cat):(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as ArtistSearchAction,
    userId: match[2],
  };
}

export function unfavSongButtonId(userId: string, songId: string): string {
  return `unfav-song:${userId}:${songId}`;
}

export function parseUnfavSongButtonId(
  customId: string,
): { userId: string; songId: string } | null {
  const match = customId.match(
    /^unfav-song:(\d+):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    songId: match[2],
  };
}

export function unfavCancelButtonId(userId: string): string {
  return `unfav-cancel:${userId}`;
}

export function parseUnfavCancelButtonId(customId: string): string | null {
  const match = customId.match(/^unfav-cancel:(\d+)$/);
  return match?.[1] ?? null;
}

export function parseUnfavPageButtonId(
  customId: string,
): { userId: string; page: number; artistKey: string } | null {
  const match = customId.match(/^unfav-page:(\d+):(\d+)(?::([a-z0-9]+))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    page: Number(match[2]),
    artistKey: match[3] ?? ALL_ARTISTS_FILTER,
  };
}

export function unfavSearchPageButtonId(
  userId: string,
  page: number,
  token: string,
  artistKey: string = ALL_ARTISTS_FILTER,
): string {
  return `unfav-q:${userId}:${page}:${token}:${artistKey || ALL_ARTISTS_FILTER}`;
}

export function parseUnfavSearchPageButtonId(
  customId: string,
): { userId: string; page: number; token: string; artistKey: string } | null {
  const match = customId.match(/^unfav-q:(\d+):(\d+):([a-f0-9]{12})(?::([a-z0-9]+))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    page: Number(match[2]),
    token: match[3],
    artistKey: match[4] ?? ALL_ARTISTS_FILTER,
  };
}

export function storeUnfavSearchToken(userId: string, query: string): string {
  const trimmed = query.trim();
  const token = createHash('sha256').update(`${userId}:${trimmed.toLowerCase()}`).digest('hex').slice(0, 12);
  unfavSearchQueries.set(`${userId}:${token}`, {
    query: trimmed,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return token;
}

export function loadUnfavSearchQuery(userId: string, token: string): string | null {
  const key = `${userId}:${token}`;
  const row = unfavSearchQueries.get(key);
  if (!row) {
    return null;
  }

  if (row.expiresAt < Date.now()) {
    unfavSearchQueries.delete(key);
    return null;
  }

  return row.query;
}

const unfavSearchQueries = new Map<string, { query: string; expiresAt: number }>();

export function catalogueSourceCode(source: CatalogueSource): 's' | 'd' {
  return source === 'spotify' ? 's' : 'd';
}

export function parseCatalogueSource(code: string): CatalogueSource | null {
  if (code === 's') {
    return 'spotify';
  }
  if (code === 'd') {
    return 'deezer';
  }
  return null;
}

function isValidCatalogueId(source: CatalogueSource, id: string): boolean {
  return source === 'spotify' ? SPOTIFY_ID_PATTERN.test(id) : DEEZER_ID_PATTERN.test(id);
}

export function catalogueAlbumsButtonId(
  userId: string,
  source: CatalogueSource,
  artistId: string,
  page: number,
): string {
  return `cat-alb:${userId}:${catalogueSourceCode(source)}${artistId}:${page}`;
}

export function parseCatalogueAlbumsButtonId(
  customId: string,
): { userId: string; source: CatalogueSource; artistId: string; page: number } | null {
  const match = customId.match(/^cat-alb:(\d+):([sd])([A-Za-z0-9]+):(\d+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[2]);
  if (!source || !isValidCatalogueId(source, match[3])) {
    return null;
  }

  return {
    userId: match[1],
    source,
    artistId: match[3],
    page: Number(match[4]),
  };
}

export function catalogueAlbumPickButtonId(
  userId: string,
  source: CatalogueSource,
  artistId: string,
  albumId: string,
  albumsPage: number,
): string {
  return `cat-pick:${userId}:${catalogueSourceCode(source)}${artistId}:${albumId}:${albumsPage}`;
}

export function parseCatalogueAlbumPickButtonId(customId: string): {
  userId: string;
  source: CatalogueSource;
  artistId: string;
  albumId: string;
  albumsPage: number;
} | null {
  const match = customId.match(/^cat-pick:(\d+):([sd])([A-Za-z0-9]+):([A-Za-z0-9]+):(\d+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[2]);
  if (!source || !isValidCatalogueId(source, match[3]) || !isValidCatalogueId(source, match[4])) {
    return null;
  }

  return {
    userId: match[1],
    source,
    artistId: match[3],
    albumId: match[4],
    albumsPage: Number(match[5]),
  };
}

export function catalogueTracksButtonId(
  userId: string,
  source: CatalogueSource,
  artistId: string,
  albumId: string,
  trackPage: number,
  albumsPage: number,
): string {
  return `cat-trk:${userId}:${catalogueSourceCode(source)}${artistId}:${albumId}:${trackPage}:${albumsPage}`;
}

export function parseCatalogueTracksButtonId(customId: string): {
  userId: string;
  source: CatalogueSource;
  artistId: string;
  albumId: string;
  trackPage: number;
  albumsPage: number;
} | null {
  const match = customId.match(/^cat-trk:(\d+):([sd])([A-Za-z0-9]+):([A-Za-z0-9]+):(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[2]);
  if (!source || !isValidCatalogueId(source, match[3]) || !isValidCatalogueId(source, match[4])) {
    return null;
  }

  return {
    userId: match[1],
    source,
    artistId: match[3],
    albumId: match[4],
    trackPage: Number(match[5]),
    albumsPage: Number(match[6]),
  };
}

export function albumSearchPickButtonId(
  action: AlbumSearchAction,
  userId: string,
  source: CatalogueSource,
  artistId: string,
  albumId: string,
): string {
  return `alb-pick:${action}:${userId}:${catalogueSourceCode(source)}${artistId}:${albumId}`;
}

export function parseAlbumSearchPickButtonId(customId: string): {
  action: AlbumSearchAction;
  userId: string;
  source: CatalogueSource;
  artistId: string;
  albumId: string;
} | null {
  const match = customId.match(/^alb-pick:(info|fav):(\d+):([sd])([A-Za-z0-9]+):([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[3]);
  if (!source || !isValidCatalogueId(source, match[4]) || !isValidCatalogueId(source, match[5])) {
    return null;
  }

  return {
    action: match[1] as AlbumSearchAction,
    userId: match[2],
    source,
    artistId: match[4],
    albumId: match[5],
  };
}

export function albumSearchCancelButtonId(action: AlbumSearchAction, userId: string): string {
  return `alb-cancel:${action}:${userId}`;
}

export function parseAlbumSearchCancelButtonId(
  customId: string,
): { action: AlbumSearchAction; userId: string } | null {
  const match = customId.match(/^alb-cancel:(info|fav):(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as AlbumSearchAction,
    userId: match[2],
  };
}

export function albumLookupTracksButtonId(
  userId: string,
  source: CatalogueSource,
  artistId: string,
  albumId: string,
  page: number,
): string {
  return `alb-trk:${userId}:${catalogueSourceCode(source)}${artistId}:${albumId}:${page}`;
}

export function parseAlbumLookupTracksButtonId(customId: string): {
  userId: string;
  source: CatalogueSource;
  artistId: string;
  albumId: string;
  page: number;
} | null {
  const match = customId.match(/^alb-trk:(\d+):([sd])([A-Za-z0-9]+):([A-Za-z0-9]+):(\d+)$/);
  if (!match) {
    return null;
  }

  const source = parseCatalogueSource(match[2]);
  if (!source || !isValidCatalogueId(source, match[3]) || !isValidCatalogueId(source, match[4])) {
    return null;
  }

  return {
    userId: match[1],
    source,
    artistId: match[3],
    albumId: match[4],
    page: Number(match[5]),
  };
}

export function parseAlbumFavouritesButtonId(
  customId: string,
): { targetUserId: string; page: number; artistKey: string } | null {
  const match = customId.match(/^favsab:(\d+):(\d+)(?::([a-z0-9]+))?$/);
  if (!match) {
    return null;
  }

  return {
    targetUserId: match[1],
    page: Number(match[2]),
    artistKey: match[3] ?? ALL_ARTISTS_FILTER,
  };
}

export function parseAlbumFavouritesFilterSelectId(customId: string): string | null {
  const match = customId.match(/^favsab-filter:(\d+)$/);
  return match?.[1] ?? null;
}

export function unfavAlbumButtonId(userId: string, albumId: string): string {
  return `unfavab-alb:${userId}:${albumId}`;
}

export function parseUnfavAlbumButtonId(
  customId: string,
): { userId: string; albumId: string } | null {
  const match = customId.match(
    /^unfavab-alb:(\d+):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    albumId: match[2],
  };
}

export function unfavAlbumCancelButtonId(userId: string): string {
  return `unfavab-cancel:${userId}`;
}

export function parseUnfavAlbumCancelButtonId(customId: string): string | null {
  const match = customId.match(/^unfavab-cancel:(\d+)$/);
  return match?.[1] ?? null;
}

export function parseUnfavAlbumPageButtonId(
  customId: string,
): { userId: string; page: number; artistKey: string } | null {
  const match = customId.match(/^unfavab-page:(\d+):(\d+)(?::([a-z0-9]+))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    page: Number(match[2]),
    artistKey: match[3] ?? ALL_ARTISTS_FILTER,
  };
}

export function unfavAlbumFilterSelectId(userId: string, searchToken?: string | null): string {
  return searchToken ? `unfavab-filter:${userId}:${searchToken}` : `unfavab-filter:${userId}`;
}

export function parseUnfavAlbumFilterSelectId(
  customId: string,
): { userId: string; searchToken: string | null } | null {
  const match = customId.match(/^unfavab-filter:(\d+)(?::([a-f0-9]{12}))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    searchToken: match[2] ?? null,
  };
}

export function unfavAlbumSearchPageButtonId(
  userId: string,
  page: number,
  token: string,
  artistKey: string = ALL_ARTISTS_FILTER,
): string {
  return `unfavab-q:${userId}:${page}:${token}:${artistKey || ALL_ARTISTS_FILTER}`;
}

export function parseUnfavAlbumSearchPageButtonId(
  customId: string,
): { userId: string; page: number; token: string; artistKey: string } | null {
  const match = customId.match(/^unfavab-q:(\d+):(\d+):([a-f0-9]{12})(?::([a-z0-9]+))?$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    page: Number(match[2]),
    token: match[3],
    artistKey: match[4] ?? ALL_ARTISTS_FILTER,
  };
}

