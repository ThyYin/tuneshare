import { createHash } from 'crypto';

export const ALL_ARTISTS_FILTER = 'all';

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
