import type { Platform } from '../../types/favourite';

export interface ParsedSongUrl {
  platform: Platform;
  platformSongId: string;
  canonicalUrl: string;
}

export type ParseUrlResult =
  | { ok: true; song: ParsedSongUrl }
  | { ok: false; reason: 'invalid' | 'unsupported' | 'not_a_track' };

export interface SongMetadata {
  title: string;
  artist: string;
  album: string | null;
  thumbnailUrl: string | null;
  resolvedPlatformSongId?: string;
  resolvedCanonicalUrl?: string;
}

export interface AudienceStat {
  label: string;
  value: string;
}

export interface ResolvedSong extends ParsedSongUrl, SongMetadata {
  metadataMissing: boolean;
}

export interface SongSearchHit extends ParsedSongUrl, SongMetadata {}

export interface SongInfo extends ParsedSongUrl, SongMetadata {
  releaseYear: string | null;
  audience: AudienceStat[];
  metadataMissing: boolean;
}

export interface MusicProvider {
  platform: Platform;
  canHandle(url: URL): boolean;
  parse(url: URL): ParseUrlResult;
  fetchMetadata(song: ParsedSongUrl): Promise<SongMetadata>;
  fetchInfo(song: ParsedSongUrl): Promise<SongInfo>;
}
