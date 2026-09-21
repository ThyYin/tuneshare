import { MAX_SONG_URL_LENGTH } from '../../constants';
import type { Platform } from '../../types/favourite';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { soundcloudProvider } from './soundcloud';
import { spotifyProvider } from './spotify';
import { stripArtistFromTitle } from './trackCredits';
import type { MusicProvider, ParsedSongUrl, ResolvedSong, SongInfo } from './types';
import { flattenWrappedMusicUrl } from './urlInput';
import { youtubeMusicProvider } from './youtubeMusic';

const providers: MusicProvider[] = [spotifyProvider, youtubeMusicProvider, soundcloudProvider];

export function looksLikeMusicUrl(raw: string): boolean {
  const trimmed = unwrapLink(raw);
  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  const url = toUrl(trimmed);
  return Boolean(url && providers.some((item) => item.canHandle(url)));
}

export function parsedSongFromParts(platform: Platform, platformSongId: string): ParsedSongUrl {
  return {
    platform,
    platformSongId,
    canonicalUrl: canonicalSongUrl(platform, platformSongId),
  };
}

export function parseMusicUrl(rawUrl: string): ParsedSongUrl {
  const trimmed = unwrapLink(rawUrl);

  if (!trimmed || trimmed.length > MAX_SONG_URL_LENGTH) {
    throw new UserFacingError(UserMessages.invalidUrl);
  }

  const url = toUrl(trimmed);

  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new UserFacingError(UserMessages.invalidUrl);
  }

  const provider = providers.find((item) => item.canHandle(url));

  if (!provider) {
    throw new UserFacingError(UserMessages.unsupportedPlatform);
  }

  const result = provider.parse(url);

  if (!result.ok) {
    if (result.reason === 'unsupported') {
      throw new UserFacingError(UserMessages.unsupportedPlatform);
    }

    if (result.reason === 'not_a_track') {
      throw new UserFacingError(UserMessages.notATrack);
    }

    throw new UserFacingError(UserMessages.invalidUrl);
  }

  return result.song;
}

export async function hydrateSong(song: ParsedSongUrl): Promise<ResolvedSong> {
  try {
    const provider = providers.find((item) => item.platform === song.platform);

    if (!provider) {
      throw new UserFacingError(UserMessages.unsupportedPlatform);
    }

    const metadata = await provider.fetchMetadata(song);
    const { resolvedPlatformSongId, resolvedCanonicalUrl, ...rest } = metadata;

    return {
      ...song,
      ...rest,
      platformSongId: resolvedPlatformSongId ?? song.platformSongId,
      canonicalUrl: resolvedCanonicalUrl ?? song.canonicalUrl,
      title: stripArtistFromTitle(metadata.title, metadata.artist),
      metadataMissing: false,
    };
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    logger.warn('Song metadata lookup failed', {
      platform: song.platform,
      platformSongId: song.platformSongId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return {
      ...song,
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      album: null,
      thumbnailUrl:
        song.platform === 'youtube_music'
          ? `https://i.ytimg.com/vi/${song.platformSongId}/hqdefault.jpg`
          : null,
      metadataMissing: true,
    };
  }
}

export async function fetchSongInfo(song: ParsedSongUrl): Promise<SongInfo> {
  try {
    const provider = providers.find((item) => item.platform === song.platform);

    if (!provider) {
      throw new UserFacingError(UserMessages.unsupportedPlatform);
    }

    const info = await provider.fetchInfo(song);
    return {
      ...info,
      title: stripArtistFromTitle(info.title, info.artist),
    };
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    logger.warn('Song info lookup failed', {
      platform: song.platform,
      platformSongId: song.platformSongId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    throw new UserFacingError(UserMessages.infoFailed);
  }
}

function canonicalSongUrl(platform: Platform, platformSongId: string): string {
  switch (platform) {
    case 'spotify':
      return `https://open.spotify.com/track/${platformSongId}`;
    case 'youtube_music':
      return `https://music.youtube.com/watch?v=${platformSongId}`;
    case 'soundcloud':
      return `https://api.soundcloud.com/tracks/${platformSongId}`;
  }
}

function unwrapLink(value: string): string {
  return flattenWrappedMusicUrl(value);
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}
