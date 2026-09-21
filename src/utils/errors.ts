export class UserFacingError extends Error {
  readonly userMessage: string;
  readonly ephemeral: boolean;

  constructor(userMessage: string, options?: { ephemeral?: boolean }) {
    super(userMessage);
    this.name = 'UserFacingError';
    this.userMessage = userMessage;
    this.ephemeral = options?.ephemeral ?? true;
  }
}

export const UserMessages = {
  invalidUrl: '❌ Please provide a valid Spotify, YouTube Music, or SoundCloud song link.',
  unsupportedPlatform: "❌ That music platform isn't supported yet.",
  notATrack: '❌ Please send a song link, not a playlist or album. Use `/favab` or `/album` for albums.',
  soundcloudNotFound:
    "❌ I couldn't find that SoundCloud link. Paste it on one line, or double-check that the track is public.",
  platformNotEnabled:
    '❌ SoundCloud is not enabled in the database yet. Run the latest `supabase/schema.sql` in the Supabase SQL Editor, then try again.',
  duplicate: 'ℹ️ You already have this song in your favourites.',
  saveFailed: '❌ Something went wrong while saving your favourite. Please try again later.',
  loadFailed: '❌ Something went wrong while loading favourites. Please try again later.',
  removeFailed: '❌ Something went wrong while removing that favourite. Please try again later.',
  generic: '❌ Something went wrong while running that command. Please try again later.',
  unfavPickFromList: '❌ Pick a song from the list — start typing the title or artist.',
  unfavNotFound: '❌ That song is not in your favourites.',
  unfavEmpty: "❌ You don't have any favourites to remove yet. Add one with `/fav` or `t!fav`.",
  unfavMultiple: '❌ Multiple songs matched. Pick one from the list below.',
  missingSongUrl: '❌ Type a song name or paste a Spotify / YouTube Music / SoundCloud link, like `t!fav Billie Jean`.',
  missingSongQuery: '❌ Type a song name or paste a Spotify / YouTube Music / SoundCloud link, like `t!fav Billie Jean`.',
  searchNoResults: "❌ I couldn't find that song. Try a different spelling, or paste a Spotify / YouTube Music / SoundCloud link.",
  searchFailed: '❌ Something went wrong while searching for that song. Try a link instead.',
  pickerNotYours: '❌ Only the person who ran that command can use those buttons.',
  pickerCancelledFav: '❌ Cancelled — no song was saved.',
  pickerCancelledUnfav: '❌ Cancelled — no song was removed.',
  pickerCancelledFavAlbum: '❌ Cancelled — no album was saved.',
  pickerCancelledUnfavAlbum: '❌ Cancelled — no album was removed.',
  pickerCancelled: '❌ Cancelled.',
  missingUser: '❌ Tag a user, like `t!favs @someone`.',
  missingArtist: '❌ Type an artist name, like `t!artist Ariana Grande`.',
  missingUnfavQuery: '❌ Type a song title or artist, like `t!unfav Billie Jean`.',
  userNotFound: "❌ I couldn't find that user. Tag them with @ or paste their Discord ID.",
  unknownPrefixCommand: '❌ Unknown command. Try `t!help`.',
  metadataMissing: '⚠️ I couldn\'t retrieve the full song information, but the link was still saved.',
  artistNotFound: "❌ I couldn't find that artist. Try a different spelling.",
  artistSearchFailed: '❌ Something went wrong while searching for that artist. Please try again later.',
  unfavSearchEmpty: '❌ No favourites matched that search. Try another title, or run `t!unfav` to browse your list.',
  unfavSearchExpired: '❌ That search expired. Run `t!unfav` with the song name again.',
  catalogueEmpty: "❌ I found that artist, but I couldn't load any albums.",
  catalogueFailed: "❌ Something went wrong while loading that artist's catalogue. Please try again later.",
  infoFailed: '❌ Something went wrong while looking up that song. Please try again later.',
  missingAlbumQuery: '❌ Type an album name, like `t!album Thriller`.',
  albumNotFound: "❌ I couldn't find that album. Try a different spelling.",
  albumSearchFailed: '❌ Something went wrong while searching for that album. Please try again later.',
  duplicateAlbum: 'ℹ️ You already have this album in your favourites.',
  unfavAlbumNotFound: '❌ That album is not in your favourites.',
  unfavAlbumEmpty: "❌ You don't have any favourite albums to remove yet. Add one with `/favab` or `t!favab`.",
  unfavAlbumSearchExpired: '❌ That search expired. Run `t!unfavab` with the album name again.',
} as const;
