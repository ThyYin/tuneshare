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
  invalidUrl: 'gng, pls provide a valid song link (spotify / youtube / soundcloud) 😩',
  unsupportedPlatform: "we aint supportin nunna dat music platform atm cuh",
  notATrack: 'drop a song link cuh, not a playlist / album link; use `/favab` or `/album` for dat 🤦‍♂️',
  soundcloudNotFound:
    "can't find dat soundcloud link twin 🤷‍♂️ (maybe check yo spellin or ensure dat track / album link is public)",
  platformNotEnabled:
    '❌ That platform is not enabled in the database yet. Run the latest `supabase/schema.sql` in the Supabase SQL Editor, then try again.',
  duplicate: 'ayo u alr got tht track in ur list cuh',
  saveFailed: 'some shit went down when i\'m tryna save it, try again mb cuh 😔',
  loadFailed: 'some shit went down when i\'m tryna load it, try again mb cuh 😔',
  removeFailed: 'some shit went down when i\'m tryna remove it, try again mb cuh 😔',
  generic: 'damn we got a server error i think, idk, idc, well try again mb cuh 😔',
  unfavPickFromList: 'pick a damn song from the list & start typin the title cuh 🤦‍♂️',
  unfavNotFound: 'shii dis song aint even in yo list cuh 😭',
  unfavEmpty: "twin tryna unfav an empty list, imagine (go add some songs blud 😂)",
  unfavMultiple: 'buncha songs matched cuh, pick one 🤨',
  missingSongUrl: 'twin, type a song name or paste a damn link 🤦‍♂️ (spotify / youtube / soundcloud) e.g. `t!fav Billie Jean`',
  missingSongQuery: 'twin, type a song name or paste a damn link 🤦‍♂️ (spotify / youtube / soundcloud) e.g. `t!fav Billie Jean`',
  searchNoResults: "couldn't find tht track twin, guess u gotta go again with a different spellin or sum shit 🤷‍♂️",
  searchFailed: 'some shit went down - search failed cuh, maybe try again mb twin 😔',
  pickerNotYours: 'bro tryna click on buttons tht aint his to begin with 😭',
  pickerCancelledFav: 'welp ig blud changed their mind, no songs saved cuh',
  pickerCancelledUnfav: 'welp ig blud changed their mind, no songs removed cuh',
  pickerCancelledFavAlbum: 'welp ig blud changed their mind, no albums saved cuh',
  pickerCancelledUnfavAlbum: 'welp ig blud changed their mind, no albums removed cuh',
  pickerCancelled: 'twin changed their mind, u do u cuh',
  missingUser: 'who u peekin cuh? do `t!favs @user` twin 🤦‍♂️',
  missingArtist: 'who u lookin up cuh? do `t!artist [artist_name]` twin 🤦‍♂️',
  missingUnfavQuery: 'twin, type a song name cuz i can\'t unfav air 🤦‍♂️ e.g. `t!unfav Thick of It - KSI`',
  userNotFound: "who?",
  unknownPrefixCommand: 'nahhh wht language is bro speakin 💀 u need `t!help` cuh',
  metadataMissing: 'i\'ve saved it, doe not able to retrieve the full song info for sum reason 👀',
  artistNotFound: "who?",
  artistSearchFailed: 'some shit went down - search failed cuh, maybe try again mb twin 😔',
  unfavSearchEmpty: 'which song cuh, consider `t!unfav` to browse ur song list directly twin',
  unfavSearchExpired: 'damn search expired, les run `t!unfav` over again, mb cuh 😔',
  catalogueEmpty: "ight blud does exist but bro got an empty catalog, tuff ⚰️",
  catalogueFailed: "some shit went down - catalog search failed cuh, maybe try again mb twin 😔",
  infoFailed: 'some shit went down - info search failed cuh, maybe try again mb twin 😔',
  missingAlbumQuery:
    'twin, type an album name or paste a damn link 🤦‍♂️ (spotify / youtube / soundcloud) e.g. `t!fav Thriller',
  albumNotFound: "couldn't find tht album twin, guess u gotta go again with a different spellin or sum shit 🤷‍♂️",
  albumLinkFailed:
    "can't find dat album link twin 🤷‍♂️ (maybe check yo spellin or ensure dat album link is public)",
  songOnAlbumCommand: 'drop an album link cuh, not a song link; use `/fav` or `/song` for dat 🤦‍♂️',
  notAnAlbumLink:
    'drop an album link cuh, not a song link; use `/fav` or `/song` for dat 🤦‍♂️',
  albumSearchFailed: 'some shit went down - album search failed cuh, maybe try again mb twin 😔',
  duplicateAlbum: 'ayo u alr got tht album in ur list cuh',
  unfavAlbumNotFound: 'shii dis album aint even in yo list cuh 😭',
  unfavAlbumEmpty: "twin tryna unfav an empty list, imagine (go add some albums blud 😂)",
  unfavAlbumSearchExpired: 'damn search expired, les run `t!unfavab` over again, mb cuh 😔',
} as const;
