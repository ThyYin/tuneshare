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
  invalidUrl: '❌ Please provide a valid Spotify or YouTube Music song link.',
  unsupportedPlatform: "❌ That music platform isn't supported yet.",
  notATrack: '❌ Please send a song link, not a playlist or album.',
  duplicate: 'ℹ️ You already have this song in your favourites.',
  saveFailed: '❌ Something went wrong while saving your favourite. Please try again later.',
  loadFailed: '❌ Something went wrong while loading favourites. Please try again later.',
  removeFailed: '❌ Something went wrong while removing that favourite. Please try again later.',
  generic: '❌ Something went wrong while running that command. Please try again later.',
  unfavPickFromList: '❌ Pick a song from the list — start typing the title or artist.',
  unfavNotFound: '❌ That song is not in your favourites.',
  unfavEmpty: "❌ You don't have any favourites to remove yet. Add one with `/fav` or `t!fav`.",
  unfavMultiple: '❌ Multiple songs matched. Pick one from the list below.',
  missingSongUrl: '❌ Type a song name or paste a Spotify / YouTube Music link, like `t!fav Billie Jean`.',
  missingSongQuery: '❌ Type a song name or paste a Spotify / YouTube Music link, like `t!fav Billie Jean`.',
  searchNoResults: "❌ I couldn't find that song. Try a different spelling, or paste a Spotify / YouTube Music link.",
  searchFailed: '❌ Something went wrong while searching for that song. Try a link instead.',
  pickerNotYours: '❌ Only the person who ran that command can pick a song.',
  missingUser: '❌ Tag a user, like `t!view @someone`.',
  missingArtist: '❌ Type an artist name, like `t!artist Ariana Grande`.',
  missingUnfavQuery: '❌ Type a song title or artist, like `t!unfav Billie Jean`.',
  userNotFound: "❌ I couldn't find that user. Tag them with @ or paste their Discord ID.",
  unknownPrefixCommand: '❌ Unknown command. Try `t!help`.',
  metadataMissing: '⚠️ I couldn\'t retrieve the full song information, but the link was still saved.',
  artistNotFound: "❌ I couldn't find that artist. Try a different spelling.",
  infoFailed: '❌ Something went wrong while looking up that song. Please try again later.',
} as const;
