import { formatCount, yearFromDate } from '../../utils/format';
import { logger } from '../../utils/logger';
import { asRecord, fetchJson, readArray, readNumber, readRecord, readString } from './http';
import { isUnknownArtist } from './trackCredits';
import type { AudienceStat, SongInfo } from './types';

export interface CatalogTrack {
  title: string;
  artist: string;
  album: string | null;
  releaseYear: string | null;
  thumbnailUrl: string | null;
  audience: AudienceStat[];
}

interface CatalogCandidate extends CatalogTrack {
  score: number;
  deezerArtistId: number | null;
}

export async function enrichTrackFromCatalog(query: string): Promise<CatalogTrack | null> {
  const cleaned = query.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return null;
  }

  const primary = primaryTitle(cleaned);
  const searches: Array<Promise<CatalogCandidate[]>> = [
    searchITunes(primary || cleaned),
    searchDeezer(cleaned),
  ];

  if (primary && primary.toLowerCase() !== cleaned.toLowerCase()) {
    searches.push(searchDeezer(primary));
  }

  const groups = await Promise.all(
    searches.map(async (search) => {
      try {
        return await search;
      } catch (error) {
        logger.warn('Catalog lookup failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
        return [];
      }
    }),
  );

  const ranked = groups
    .flat()
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(cleaned, candidate),
    }))
    .filter((candidate) => candidate.score >= 20)
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  if (!winner) {
    return null;
  }

  const audience =
    winner.audience.length > 0
      ? winner.audience
      : winner.deezerArtistId !== null
        ? await audienceFromDeezer(winner.deezerArtistId)
        : [];

  return {
    title: winner.title,
    artist: winner.artist,
    album: winner.album,
    releaseYear: winner.releaseYear,
    thumbnailUrl: winner.thumbnailUrl,
    audience,
  };
}

export async function applyCatalogFallback(info: SongInfo): Promise<SongInfo> {
  const needsArtist = isUnknownArtist(info.artist);
  const needsDetails = !info.album || !info.releaseYear || info.audience.length === 0 || needsArtist;

  if (!needsDetails) {
    return info;
  }

  const query = catalogQuery(info);
  const catalog = await enrichTrackFromCatalog(query);

  if (!catalog) {
    return info;
  }

  return {
    ...info,
    artist: needsArtist ? catalog.artist : info.artist,
    album: info.album ?? catalog.album,
    releaseYear: info.releaseYear ?? catalog.releaseYear,
    thumbnailUrl: info.thumbnailUrl ?? catalog.thumbnailUrl,
    audience: info.audience.length > 0 ? info.audience : catalog.audience,
  };
}

function catalogQuery(info: Pick<SongInfo, 'title' | 'artist'>): string {
  const parts: string[] = [];

  if (info.title && info.title !== 'Unknown Title') {
    parts.push(info.title);
  }

  if (info.artist && !isUnknownArtist(info.artist)) {
    parts.push(info.artist);
  }

  return parts.join(' ').trim() || info.title || info.artist;
}

async function searchITunes(query: string): Promise<CatalogCandidate[]> {
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}` +
    `&entity=song&limit=8&country=US`;
  const data = await fetchJson(url);
  const results = readArray(data, 'results') ?? [];
  const tracks: CatalogCandidate[] = [];

  for (const item of results) {
    const track = asRecord(item);
    if (!track) {
      continue;
    }

    const title = readString(track, 'trackName');
    const artist = readString(track, 'artistName');
    if (!title || !artist) {
      continue;
    }

    const artwork = readString(track, 'artworkUrl100');

    tracks.push({
      title,
      artist,
      album: readString(track, 'collectionName'),
      releaseYear: yearFromDate(readString(track, 'releaseDate')),
      thumbnailUrl: artwork ? artwork.replace(/\/\d+x\d+bb/, '/600x600bb') : null,
      audience: [],
      score: 0,
      deezerArtistId: null,
    });
  }

  return tracks;
}

async function searchDeezer(query: string): Promise<CatalogCandidate[]> {
  const data = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=8`);
  const results = readArray(data, 'data') ?? [];
  const tracks: CatalogCandidate[] = [];

  for (const item of results) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }

    const artist = readRecord(row, 'artist');
    const album = readRecord(row, 'album');
    const title = readString(row, 'title');
    const artistName = artist ? readString(artist, 'name') : null;

    if (!title || !artistName) {
      continue;
    }

    const artistId = artist ? readNumber(artist, 'id') : null;

    tracks.push({
      title,
      artist: artistName,
      album: album ? readString(album, 'title') : null,
      releaseYear: null,
      thumbnailUrl: album ? readString(album, 'cover_xl') ?? readString(album, 'cover_big') : null,
      audience: [],
      score: 0,
      deezerArtistId: artistId,
    });
  }

  return tracks;
}

async function audienceFromDeezer(artistId: number): Promise<AudienceStat[]> {
  try {
    const artist = await fetchJson(`https://api.deezer.com/artist/${artistId}`);
    const fans = readNumber(artist, 'nb_fan');
    return fans !== null ? [{ label: 'Deezer fans', value: formatCount(fans) }] : [];
  } catch {
    return [];
  }
}

function primaryTitle(title: string): string {
  return title
    .replace(/\s*[\(\[]\s*(feat\.?|ft\.?|featuring)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s*(feat\.?|ft\.?|featuring)\b.*$/i, '')
    .trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(query: string, candidate: CatalogTrack): number {
  const primary = normalize(primaryTitle(query));
  const title = normalize(candidate.title);
  const artist = normalize(candidate.artist);
  const haystack = `${title} ${artist} ${normalize(candidate.album ?? '')}`;

  if (primary.length > 2 && !title.includes(primary)) {
    return 0;
  }

  let score = 0;
  if (title === primary) {
    score += 40;
  } else if (title.includes(primary)) {
    score += 20;
  }

  const skip = new Set(['feat', 'ft', 'featuring', 'with', 'the', 'and']);
  for (const token of normalize(query).split(' ')) {
    if (token.length < 2 || skip.has(token)) {
      continue;
    }
    if (haystack.includes(token)) {
      score += 8;
    }
  }

  if (/\b(karaoke|cover|instrumental)\b/i.test(`${candidate.title} ${candidate.album ?? ''}`)) {
    score -= 15;
  }

  return score;
}
