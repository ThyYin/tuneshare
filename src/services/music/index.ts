import { MAX_SONG_URL_LENGTH } from '../../constants';
import { UserFacingError, UserMessages } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { spotifyProvider } from './spotify';
import type { MusicProvider, ParsedSongUrl, ResolvedSong, SongInfo } from './types';
import { youtubeMusicProvider } from './youtubeMusic';

const providers: MusicProvider[] = [spotifyProvider, youtubeMusicProvider];

export function parseMusicUrl(rawUrl: string): ParsedSongUrl {
  const trimmed = rawUrl.trim();

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

    return {
      ...song,
      ...metadata,
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

    return await provider.fetchInfo(song);
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
