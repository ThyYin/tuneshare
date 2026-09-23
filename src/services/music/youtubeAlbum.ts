import { getYouTubeApiKey } from '../../config/env';
import { logger } from '../../utils/logger';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './http';

export const YOUTUBE_ALBUM_ARTIST_ID = 'yt';
export const YOUTUBE_PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{13,80}$/;

const BROWSE_URL = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://music.youtube.com',
};

export interface YouTubeAlbumTrack {
  name: string;
  trackNumber: number;
  durationLabel: string | null;
  url: string | null;
}

export interface YouTubeAlbumDetails {
  albumId: string;
  name: string;
  artist: string;
  year: string | null;
  thumbnailUrl: string | null;
  pageUrl: string;
  albumType: string;
  tracks: YouTubeAlbumTrack[];
}

export async function fetchYouTubeAlbum(albumId: string): Promise<YouTubeAlbumDetails | null> {
  if (!YOUTUBE_PLAYLIST_ID_PATTERN.test(albumId)) {
    return null;
  }

  try {
    const fromMusic = await fetchYouTubeMusicPlaylist(albumId);
    if (fromMusic && fromMusic.tracks.length > 0) {
      return fromMusic;
    }
  } catch (error) {
    logger.warn('YouTube Music album lookup failed', {
      albumId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return fetchYouTubeApiPlaylist(albumId);
}

async function fetchYouTubeMusicPlaylist(albumId: string): Promise<YouTubeAlbumDetails | null> {
  const rows: ParsedRow[] = [];
  let continuation: string | null = null;

  for (let page = 0; page < 8; page += 1) {
    const data = await fetchJson(BROWSE_URL, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20250310.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        ...(continuation ? { continuation } : { browseId: browseIdFor(albumId) }),
      }),
    });
    const shelf = findPlaylistShelf(data);
    if (!shelf) {
      break;
    }

    for (const item of readArray(shelf, 'contents') ?? []) {
      const row = asRecord(item);
      const renderer = row ? readRecord(row, 'musicResponsiveListItemRenderer') : null;
      const parsed = renderer ? parseTrackRow(renderer) : null;
      if (parsed) {
        rows.push(parsed);
      }
    }

    continuation = readContinuation(shelf);
    if (!continuation) {
      break;
    }
  }

  if (rows.length === 0) {
    return null;
  }

  const api = await fetchYouTubeApiSnippet(albumId);
  return {
    albumId,
    name: pickAlbumName(rows) ?? api?.name ?? 'Unknown Album',
    artist: pickArtist(rows) ?? api?.artist ?? 'Unknown Artist',
    year: null,
    thumbnailUrl: api?.thumbnailUrl ?? rows.find((row) => row.thumbnailUrl)?.thumbnailUrl ?? null,
    pageUrl: pageUrlFor(albumId),
    albumType: albumId.startsWith('OLAK5uy_') || albumId.startsWith('MPREb_') ? 'Album' : 'Playlist',
    tracks: rows.map((row, index) => ({
      name: row.title,
      trackNumber: index + 1,
      durationLabel: row.durationLabel,
      url: row.videoId ? `https://music.youtube.com/watch?v=${row.videoId}` : null,
    })),
  };
}

async function fetchYouTubeApiPlaylist(albumId: string): Promise<YouTubeAlbumDetails | null> {
  const snippet = await fetchYouTubeApiSnippet(albumId);
  const tracks = await fetchYouTubeApiTracks(albumId);
  if (!snippet && tracks.length === 0) {
    return null;
  }

  return {
    albumId,
    name: snippet?.name ?? 'Unknown Album',
    artist: snippet?.artist ?? 'Unknown Artist',
    year: null,
    thumbnailUrl: snippet?.thumbnailUrl ?? null,
    pageUrl: pageUrlFor(albumId),
    albumType: albumId.startsWith('OLAK5uy_') || albumId.startsWith('MPREb_') ? 'Album' : 'Playlist',
    tracks,
  };
}

async function fetchYouTubeApiSnippet(albumId: string): Promise<{
  name: string;
  artist: string | null;
  thumbnailUrl: string | null;
} | null> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey || albumId.startsWith('MPREb_')) {
    return null;
  }

  try {
    const data = await fetchJson(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(albumId)}&key=${encodeURIComponent(apiKey)}`,
    );
    const item = asRecord((readArray(data, 'items') ?? [])[0]);
    const snippet = item ? readRecord(item, 'snippet') : null;
    const title = snippet ? readString(snippet, 'title') : null;
    if (!snippet || !title) {
      return null;
    }

    const channel = readString(snippet, 'channelTitle');
    return {
      name: cleanAlbumTitle(title),
      artist: channel && !/^youtube$/i.test(channel) ? channel.replace(/\s+-\s+Topic$/i, '').trim() : null,
      thumbnailUrl: largestApiThumbnail(readRecord(snippet, 'thumbnails')),
    };
  } catch (error) {
    logger.warn('YouTube playlist API lookup failed', {
      albumId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function fetchYouTubeApiTracks(albumId: string): Promise<YouTubeAlbumTrack[]> {
  const apiKey = getYouTubeApiKey();
  if (!apiKey || albumId.startsWith('MPREb_')) {
    return [];
  }

  const tracks: YouTubeAlbumTrack[] = [];
  let pageToken = '';

  try {
    for (let page = 0; page < 8 && tracks.length < 200; page += 1) {
      const tokenQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const data = await fetchJson(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(albumId)}${tokenQuery}&key=${encodeURIComponent(apiKey)}`,
      );
      for (const item of readArray(data, 'items') ?? []) {
        const row = asRecord(item);
        const snippet = row ? readRecord(row, 'snippet') : null;
        const content = row ? readRecord(row, 'contentDetails') : null;
        const title = snippet ? readString(snippet, 'title') : null;
        const videoId = content ? readString(content, 'videoId') : null;
        if (!title || title === 'Private video' || title === 'Deleted video') {
          continue;
        }
        tracks.push({
          name: title,
          trackNumber: tracks.length + 1,
          durationLabel: null,
          url: videoId ? `https://music.youtube.com/watch?v=${videoId}` : null,
        });
      }

      pageToken = readString(data, 'nextPageToken') ?? '';
      if (!pageToken) {
        break;
      }
    }
  } catch (error) {
    logger.warn('YouTube playlist tracks API lookup failed', {
      albumId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return tracks;
}

interface ParsedRow {
  title: string;
  videoId: string | null;
  artist: string | null;
  album: string | null;
  durationLabel: string | null;
  thumbnailUrl: string | null;
}

function parseTrackRow(row: Record<string, unknown>): ParsedRow | null {
  const playlistItem = readRecord(row, 'playlistItemData');
  const videoId = playlistItem ? readString(playlistItem, 'videoId') : null;
  const columns = readArray(row, 'flexColumns') ?? [];
  const title = columnText(columns[0]);
  if (!title) {
    return null;
  }

  let artist: string | null = null;
  let album: string | null = null;
  for (const run of columnRuns(columns[1])) {
    if (run.pageType === 'MUSIC_PAGE_TYPE_ARTIST' && run.text) {
      artist = artist ?? run.text;
    }
  }
  for (const run of columnRuns(columns[2])) {
    if (run.pageType === 'MUSIC_PAGE_TYPE_ALBUM' && run.text) {
      album = run.text;
    } else if (!album && run.text && !/^go to album$/i.test(run.text)) {
      album = run.text;
    }
  }

  const durationText = columnText((readArray(row, 'fixedColumns') ?? [])[0]);
  return {
    title,
    videoId,
    artist,
    album,
    durationLabel: durationText && /^\d+:\d{2}(?::\d{2})?$/.test(durationText) ? durationText : null,
    thumbnailUrl: largestInnertubeThumbnail(row) ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
  };
}

function columnText(column: unknown): string | null {
  return columnRuns(column).find((item) => item.text)?.text ?? null;
}

function columnRuns(column: unknown): Array<{ text: string | null; pageType: string | null }> {
  const record = asRecord(column);
  const renderer = record ? readRecord(record, 'musicResponsiveListItemFlexColumnRenderer') : null;
  if (!renderer) {
    const fixed = record ? readRecord(record, 'musicResponsiveListItemFixedColumnRenderer') : null;
    const text = fixed ? readRecord(fixed, 'text') : null;
    const runs = text ? (readArray(text, 'runs') ?? []) : [];
    return runs.map((item) => ({ text: asRecord(item) ? readString(asRecord(item) as Record<string, unknown>, 'text') : null, pageType: null }));
  }

  const text = readRecord(renderer, 'text');
  const runs = text ? (readArray(text, 'runs') ?? []) : [];
  return runs.map((item) => {
    const run = asRecord(item);
    const navigation = run ? readRecord(run, 'navigationEndpoint') : null;
    const browse = navigation ? readRecord(navigation, 'browseEndpoint') : null;
    const configs = browse ? readRecord(browse, 'browseEndpointContextSupportedConfigs') : null;
    const music = configs ? readRecord(configs, 'browseEndpointContextMusicConfig') : null;
    return {
      text: run ? readString(run, 'text') : null,
      pageType: music ? readString(music, 'pageType') : null,
    };
  });
}

function largestInnertubeThumbnail(row: Record<string, unknown>): string | null {
  const thumbnail = readRecord(row, 'thumbnail');
  const renderer = thumbnail ? readRecord(thumbnail, 'musicThumbnailRenderer') : null;
  const image = renderer ? readRecord(renderer, 'thumbnail') : null;
  return largestThumbnailList(image ? (readArray(image, 'thumbnails') ?? []) : []);
}

function largestApiThumbnail(thumbnails: Record<string, unknown> | null): string | null {
  if (!thumbnails) {
    return null;
  }
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const entry = readRecord(thumbnails, size);
    const url = entry ? readString(entry, 'url') : null;
    if (url) {
      return url;
    }
  }
  return null;
}

function largestThumbnailList(items: unknown[]): string | null {
  let best: { url: string; width: number } | null = null;
  for (const item of items) {
    const image = asRecord(item);
    const url = image ? readString(image, 'url') : null;
    const width = image ? (readNumber(image, 'width') ?? 0) : 0;
    if (url && (!best || width >= best.width)) {
      best = { url, width };
    }
  }
  return best?.url ?? null;
}

function pickAlbumName(rows: ParsedRow[]): string | null {
  return mostCommon(rows.map((row) => row.album).filter((name): name is string => Boolean(name)));
}

function pickArtist(rows: ParsedRow[]): string | null {
  const names = rows.map((row) => row.artist).filter((name): name is string => Boolean(name));
  const winner = mostCommon(names);
  if (!winner) {
    return null;
  }
  return new Set(names).size > 3 ? 'Various Artists' : winner;
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) {
      best = { value, count };
    }
  }
  return best?.value ?? null;
}

function findPlaylistShelf(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPlaylistShelf(item);
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
  const shelf = readRecord(record, 'musicPlaylistShelfRenderer');
  if (shelf) {
    return shelf;
  }
  for (const value of Object.values(record)) {
    const found = findPlaylistShelf(value);
    if (found) {
      return found;
    }
  }
  return null;
}

function readContinuation(shelf: Record<string, unknown>): string | null {
  const first = asRecord((readArray(shelf, 'continuations') ?? [])[0]);
  const next = first ? readRecord(first, 'nextContinuationData') : null;
  return next ? readString(next, 'continuation') : null;
}

function browseIdFor(albumId: string): string {
  return albumId.startsWith('MPREb_') ? albumId : `VL${albumId}`;
}

function pageUrlFor(albumId: string): string {
  if (albumId.startsWith('MPREb_')) {
    return `https://music.youtube.com/browse/${albumId}`;
  }
  return `https://music.youtube.com/playlist?list=${albumId}`;
}

function cleanAlbumTitle(title: string): string {
  const cleaned = title.replace(/^(album|single|ep)\s+-\s+/i, '').trim();
  return cleaned || title;
}
