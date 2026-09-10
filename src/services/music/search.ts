import { MAX_SONG_SEARCH_RESULTS } from '../../constants';
import { getSpotifyCredentials, getYouTubeApiKey } from '../../config/env';
import { logger } from '../../utils/logger';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { getSpotifyAppToken } from './spotifyAuth';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './http';
import { firstKnownArtist } from './trackCredits';
import type { SongSearchHit } from './types';

function youtubeMusicUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`;
}

function spotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_MUSIC_SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const YOUTUBE_MUSIC_SONGS_PARAMS = 'EgWKAQIIAWoKEAMQBBAJEAoQBQ==';

export async function searchSongs(query: string): Promise<SongSearchHit[]> {
  const cleaned = query.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return [];
  }

  if (getSpotifyCredentials()) {
    try {
      const spotify = await searchSpotifyTracks(cleaned);
      if (spotify.length > 0) {
        return spotify.slice(0, MAX_SONG_SEARCH_RESULTS);
      }
    } catch (error) {
      logger.warn('Spotify song search failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  try {
    const youtubeMusic = await searchYouTubeMusicTracks(cleaned);
    if (youtubeMusic.length > 0) {
      return youtubeMusic.slice(0, MAX_SONG_SEARCH_RESULTS);
    }
  } catch (error) {
    logger.warn('YouTube Music song search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  const apiKey = getYouTubeApiKey();
  if (apiKey) {
    try {
      return (await searchYouTubeDataTracks(cleaned, apiKey)).slice(0, MAX_SONG_SEARCH_RESULTS);
    } catch (error) {
      logger.warn('YouTube Data API song search failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return [];
}

export async function searchSongsOrThrow(query: string): Promise<SongSearchHit[]> {
  try {
    const results = await searchSongs(query);
    if (results.length === 0) {
      throw new UserFacingError(UserMessages.searchNoResults);
    }
    return results;
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    logger.warn('Song search failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw new UserFacingError(UserMessages.searchFailed);
  }
}

async function searchSpotifyTracks(query: string): Promise<SongSearchHit[]> {
  const token = await getSpotifyAppToken();
  const data = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${MAX_SONG_SEARCH_RESULTS}&market=US`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const tracks = readRecord(data, 'tracks');
  const items = tracks ? (readArray(tracks, 'items') ?? []) : [];
  const hits: SongSearchHit[] = [];

  for (const item of items) {
    const track = asRecord(item);
    if (!track) {
      continue;
    }

    const platformSongId = readString(track, 'id');
    const title = readString(track, 'name');
    if (!platformSongId || !SPOTIFY_TRACK_ID_PATTERN.test(platformSongId) || !title) {
      continue;
    }

    const artists = readArray(track, 'artists') ?? [];
    const firstArtist = asRecord(artists[0]);
    const album = readRecord(track, 'album');
    const images = album ? (readArray(album, 'images') ?? []) : [];
    const cover = asRecord(images[0]);

    hits.push({
      platform: 'spotify',
      platformSongId,
      canonicalUrl: spotifyTrackUrl(platformSongId),
      title,
      artist: firstKnownArtist(firstArtist ? readString(firstArtist, 'name') : null),
      album: album ? readString(album, 'name') : null,
      thumbnailUrl: cover ? readString(cover, 'url') : null,
    });

    if (hits.length >= MAX_SONG_SEARCH_RESULTS) {
      break;
    }
  }

  return hits;
}

async function searchYouTubeMusicTracks(query: string): Promise<SongSearchHit[]> {
  const filtered = await fetchYouTubeMusicSearch(query, YOUTUBE_MUSIC_SONGS_PARAMS);
  if (filtered.length > 0) {
    return filtered;
  }

  return fetchYouTubeMusicSearch(query);
}

async function fetchYouTubeMusicSearch(query: string, params?: string): Promise<SongSearchHit[]> {
  const data = await fetchJson(YOUTUBE_MUSIC_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://music.youtube.com',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20250310.01.00',
        },
      },
      query,
      ...(params ? { params } : {}),
    }),
  });

  const hits: SongSearchHit[] = [];
  const seen = new Set<string>();
  collectYouTubeMusicHits(data, hits, seen);
  return hits;
}

function collectYouTubeMusicHits(node: unknown, hits: SongSearchHit[], seen: Set<string>): void {
  if (hits.length >= MAX_SONG_SEARCH_RESULTS) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectYouTubeMusicHits(item, hits, seen);
      if (hits.length >= MAX_SONG_SEARCH_RESULTS) {
        return;
      }
    }
    return;
  }

  const record = asRecord(node);
  if (!record) {
    return;
  }

  const listItem = readRecord(record, 'musicResponsiveListItemRenderer');
  if (listItem) {
    addYouTubeHit(parseYouTubeListItem(listItem), hits, seen);
  }

  const card = readRecord(record, 'musicCardShelfRenderer');
  if (card) {
    addYouTubeHit(parseYouTubeCard(card), hits, seen);
  }

  for (const value of Object.values(record)) {
    if (hits.length >= MAX_SONG_SEARCH_RESULTS) {
      return;
    }
    if (typeof value === 'object' && value !== null) {
      collectYouTubeMusicHits(value, hits, seen);
    }
  }
}

function addYouTubeHit(
  hit: SongSearchHit | null,
  hits: SongSearchHit[],
  seen: Set<string>,
): void {
  if (!hit || seen.has(hit.platformSongId) || hits.length >= MAX_SONG_SEARCH_RESULTS) {
    return;
  }

  seen.add(hit.platformSongId);
  hits.push(hit);
}

function parseYouTubeListItem(renderer: Record<string, unknown>): SongSearchHit | null {
  const videoId = readYouTubeVideoId(renderer);
  if (!videoId) {
    return null;
  }

  const columns = readArray(renderer, 'flexColumns') ?? [];
  const title = flexColumnText(columns[0]) ?? 'Unknown Title';
  const subtitle = flexColumnText(columns[1]) ?? '';
  const credits = parseYouTubeSubtitle(subtitle);

  return youtubeMusicHit(videoId, title, credits, renderer);
}

function parseYouTubeCard(renderer: Record<string, unknown>): SongSearchHit | null {
  const videoId = readYouTubeVideoId(renderer);
  if (!videoId) {
    return null;
  }

  const title = readText(readRecord(renderer, 'title')) ?? 'Unknown Title';
  const subtitle = readText(readRecord(renderer, 'subtitle')) ?? '';
  const credits = parseYouTubeSubtitle(subtitle);

  return youtubeMusicHit(videoId, title, credits, renderer);
}

function youtubeMusicHit(
  videoId: string,
  title: string,
  credits: { artist: string; album: string | null },
  renderer: Record<string, unknown>,
): SongSearchHit {
  return {
    platform: 'youtube_music',
    platformSongId: videoId,
    canonicalUrl: youtubeMusicUrl(videoId),
    title,
    artist: firstKnownArtist(credits.artist),
    album: credits.album,
    thumbnailUrl: readYouTubeThumbnail(renderer, videoId),
  };
}

function flexColumnText(column: unknown): string | null {
  const row = asRecord(column);
  const renderer = row
    ? (readRecord(row, 'musicResponsiveListItemFlexColumnRenderer') ?? row)
    : null;
  return renderer ? readText(readRecord(renderer, 'text') ?? renderer) : null;
}

function parseYouTubeSubtitle(subtitle: string): { artist: string; album: string | null } {
  const parts = subtitle
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isDuration(part));

  const skip = new Set(['song', 'video', 'album', 'playlist', 'artist', 'ep', 'single']);
  const rest = parts[0] && skip.has(parts[0].toLowerCase()) ? parts.slice(1) : parts;

  return {
    artist: rest[0] ?? 'Unknown Artist',
    album: rest[1] ?? null,
  };
}

function isDuration(value: string): boolean {
  return /^\d+:\d{2}(?::\d{2})?$/.test(value);
}

function readYouTubeVideoId(node: Record<string, unknown>): string | null {
  const playlist = readRecord(node, 'playlistItemData');
  const fromPlaylist = playlist ? readString(playlist, 'videoId') : null;
  if (fromPlaylist && VIDEO_ID_PATTERN.test(fromPlaylist)) {
    return fromPlaylist;
  }

  return findWatchVideoId(node, 0);
}

function findWatchVideoId(node: unknown, depth: number): string | null {
  if (depth > 6) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findWatchVideoId(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = asRecord(node);
  if (!record) {
    return null;
  }

  const watch = readRecord(record, 'watchEndpoint');
  const fromWatch = watch ? readString(watch, 'videoId') : null;
  if (fromWatch && VIDEO_ID_PATTERN.test(fromWatch)) {
    return fromWatch;
  }

  for (const key of [
    'overlay',
    'content',
    'onTap',
    'navigationEndpoint',
    'playNavigationEndpoint',
    'musicPlayButtonRenderer',
    'musicItemThumbnailOverlayRenderer',
  ]) {
    if (record[key] === undefined) {
      continue;
    }
    const found = findWatchVideoId(record[key], depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function readYouTubeThumbnail(node: Record<string, unknown>, videoId: string): string {
  const thumbnail = readRecord(node, 'thumbnail');
  const renderer = thumbnail ? (readRecord(thumbnail, 'musicThumbnailRenderer') ?? thumbnail) : null;
  const nested = renderer ? (readRecord(renderer, 'thumbnail') ?? renderer) : null;
  const images = nested ? (readArray(nested, 'thumbnails') ?? []) : [];
  let best: { url: string; width: number } | null = null;

  for (const item of images) {
    const image = asRecord(item);
    const url = image ? readString(image, 'url') : null;
    const width = image ? (readNumber(image, 'width') ?? 0) : 0;
    if (url && (!best || width >= best.width)) {
      best = { url, width };
    }
  }

  return best?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function readText(node: Record<string, unknown> | null): string | null {
  if (!node) {
    return null;
  }

  const simple = readString(node, 'simpleText');
  if (simple) {
    return simple;
  }

  const direct = readString(node, 'text');
  if (direct) {
    return direct;
  }

  const runs = readArray(node, 'runs') ?? [];
  const parts: string[] = [];
  for (const run of runs) {
    const row = asRecord(run);
    const text = row ? readString(row, 'text') : null;
    if (text) {
      parts.push(text);
    }
  }

  const joined = parts.join('').trim();
  return joined || null;
}

async function searchYouTubeDataTracks(query: string, apiKey: string): Promise<SongSearchHit[]> {
  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${MAX_SONG_SEARCH_RESULTS}` +
      `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`,
  );
  const items = readArray(data, 'items') ?? [];
  const hits: SongSearchHit[] = [];

  for (const item of items) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }

    const id = readRecord(row, 'id');
    const videoId = id ? readString(id, 'videoId') : null;
    const snippet = readRecord(row, 'snippet');
    const title = snippet ? readString(snippet, 'title') : null;

    if (!videoId || !VIDEO_ID_PATTERN.test(videoId) || !title) {
      continue;
    }

    const thumbnails = snippet ? readRecord(snippet, 'thumbnails') : null;
    const high = thumbnails ? readRecord(thumbnails, 'high') : null;
    const medium = thumbnails ? readRecord(thumbnails, 'medium') : null;

    hits.push({
      platform: 'youtube_music',
      platformSongId: videoId,
      canonicalUrl: youtubeMusicUrl(videoId),
      title,
      artist: firstKnownArtist(snippet ? readString(snippet, 'channelTitle') : null),
      album: null,
      thumbnailUrl:
        (high ? readString(high, 'url') : null) ??
        (medium ? readString(medium, 'url') : null) ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }

  return hits;
}
