import { getYouTubeApiKey } from '../../config/env';
import { formatCount, yearFromDate } from '../../utils/format';
import { logger } from '../../utils/logger';
import type { MusicProvider, ParseUrlResult, ParsedSongUrl, SongInfo, SongMetadata } from './types';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './http';
import { profileName } from './trackCredits';
import { fetchYouTubeMusicArtist } from './youtubeMusicArtist';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const NON_TRACK_PATHS = /^\/(playlist|channel|@|user|c|feed|library|browse)/i;

function hostname(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

function isVideoId(value: string | null): value is string {
  return Boolean(value && VIDEO_ID_PATTERN.test(value));
}

export const youtubeMusicProvider: MusicProvider = {
  platform: 'youtube_music',

  canHandle(url) {
    return YOUTUBE_HOSTS.has(hostname(url));
  },

  parse(url): ParseUrlResult {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'invalid' };
    }

    const host = hostname(url);

    if (NON_TRACK_PATHS.test(url.pathname)) {
      return { ok: false, reason: 'not_a_track' };
    }

    const platformSongId = extractVideoId(url, host);

    if (!platformSongId) {
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      song: {
        platform: 'youtube_music',
        platformSongId,
        canonicalUrl: `https://music.youtube.com/watch?v=${platformSongId}`,
      },
    };
  },

  async fetchMetadata(song: ParsedSongUrl): Promise<SongMetadata> {
    const info = await this.fetchInfo(song);
    return {
      title: info.title,
      artist: info.artist,
      album: info.album,
      thumbnailUrl: info.thumbnailUrl,
    };
  },

  async fetchInfo(song: ParsedSongUrl): Promise<SongInfo> {
    const apiKey = getYouTubeApiKey();

    if (apiKey) {
      try {
        return await fetchYouTubeApiInfo(song, apiKey);
      } catch (error) {
        logger.warn('YouTube API lookup failed, falling back to oEmbed', {
          platformSongId: song.platformSongId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    const oembed = await fetchOEmbed(song);
    const artist = await resolveYouTubeArtist(song.platformSongId, oembed.artist);

    return {
      ...song,
      ...oembed,
      artist,
      album: null,
      releaseYear: null,
      audience: [],
      metadataMissing: false,
    };
  },
};

async function resolveYouTubeArtist(videoId: string, channelName: string | null): Promise<string> {
  try {
    const profileArtist = await fetchYouTubeMusicArtist(videoId);
    if (profileArtist) {
      return profileArtist;
    }
  } catch (error) {
    logger.warn('YouTube Music artist profile lookup failed', {
      videoId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  const fromChannel = profileName(channelName ?? '');
  return fromChannel || 'Unknown Artist';
}

async function fetchOEmbed(song: ParsedSongUrl): Promise<SongMetadata> {
  const watchUrl = `https://www.youtube.com/watch?v=${song.platformSongId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  const data = await fetchJson(oembedUrl);

  return {
    title: readString(data, 'title') ?? 'Unknown Title',
    artist: readString(data, 'author_name') ?? 'Unknown Artist',
    album: null,
    thumbnailUrl:
      readString(data, 'thumbnail_url') ??
      `https://i.ytimg.com/vi/${song.platformSongId}/hqdefault.jpg`,
  };
}

async function fetchYouTubeApiInfo(song: ParsedSongUrl, apiKey: string): Promise<SongInfo> {
  const apiUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,statistics` +
    `&id=${encodeURIComponent(song.platformSongId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const data = await fetchJson(apiUrl);
  const items = readArray(data, 'items') ?? [];
  const video = asRecord(items[0]);

  if (!video) {
    throw new Error('YouTube API returned no video');
  }

  const snippet = readRecord(video, 'snippet');
  const statistics = readRecord(video, 'statistics');
  const thumbnails = snippet ? readRecord(snippet, 'thumbnails') : null;
  const thumbnailUrl = pickYouTubeThumbnail(thumbnails, song.platformSongId);
  const views = statistics ? readNumber(statistics, 'viewCount') : null;
  const title = snippet ? (readString(snippet, 'title') ?? 'Unknown Title') : 'Unknown Title';
  const channelTitle = snippet ? readString(snippet, 'channelTitle') : null;
  const artist = await resolveYouTubeArtist(song.platformSongId, channelTitle);

  return {
    ...song,
    title,
    artist,
    album: null,
    thumbnailUrl,
    releaseYear: snippet ? yearFromDate(readString(snippet, 'publishedAt')) : null,
    audience: views !== null ? [{ label: 'Views', value: formatCount(views) }] : [],
    metadataMissing: false,
  };
}

function pickYouTubeThumbnail(
  thumbnails: Record<string, unknown> | null,
  videoId: string,
): string {
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const entry = thumbnails ? readRecord(thumbnails, size) : null;
    const url = entry ? readString(entry, 'url') : null;
    if (url) {
      return url;
    }
  }

  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function extractVideoId(url: URL, host: string): string | null {
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    return isVideoId(id) ? id : null;
  }

  const fromQuery = url.searchParams.get('v');
  if (isVideoId(fromQuery)) {
    return fromQuery;
  }

  const embedMatch = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
  return embedMatch?.[1] ?? null;
}
