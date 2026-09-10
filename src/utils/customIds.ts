import { createHash } from 'crypto';
import type { Platform } from '../types/favourite';

export const ALL_ARTISTS_FILTER = 'all';
export type SongSearchAction = 'fav' | 'info';

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

function parsePlatformSong(code: string, platformSongId: string): { platform: Platform; platformSongId: string } | null {
  if (code === 's' && /^[A-Za-z0-9]{22}$/.test(platformSongId)) {
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

export function parseUnfavPageButtonId(
  customId: string,
): { userId: string; page: number } | null {
  const match = customId.match(/^unfav-page:(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    page: Number(match[2]),
  };
}
