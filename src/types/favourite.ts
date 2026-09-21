export type Platform = 'spotify' | 'youtube_music' | 'soundcloud';

export interface Favourite {
  id: string;
  discordUserId: string;
  songTitle: string;
  artist: string;
  album: string | null;
  platform: Platform;
  platformSongId: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface FavouriteInsert {
  discordUserId: string;
  songTitle: string;
  artist: string;
  album: string | null;
  platform: Platform;
  platformSongId: string;
  url: string;
  thumbnailUrl: string | null;
}

export interface PaginatedFavourites {
  items: Favourite[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  artistFilter: string | null;
  searchQuery: string | null;
}

export interface ArtistCount {
  artist: string;
  count: number;
  names: string[];
}

export interface PaginatedArtists {
  items: ArtistCount[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type AlbumPlatform = 'spotify' | 'deezer' | 'soundcloud';

export interface FavouriteAlbum {
  id: string;
  discordUserId: string;
  albumTitle: string;
  artist: string;
  year: string | null;
  totalTracks: number | null;
  platform: AlbumPlatform;
  platformAlbumId: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface FavouriteAlbumInsert {
  discordUserId: string;
  albumTitle: string;
  artist: string;
  year: string | null;
  totalTracks: number | null;
  platform: AlbumPlatform;
  platformAlbumId: string;
  url: string;
  thumbnailUrl: string | null;
}

export interface PaginatedFavouriteAlbums {
  items: FavouriteAlbum[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  artistFilter: string | null;
  searchQuery: string | null;
}
