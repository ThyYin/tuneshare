**Tunetopia** is a Discord bot for **saving and sharing your favourite songs and albums**.

Type in a song or album name, or paste a Spotify / YT Music / SoundCloud track link — boom! Just like that, Tunetopia keeps your personal list of tracks (and albums) you and your pals can browse, filter, and share; the scrumptious **music diary** for your server! 🥞🎶

It does **not** join voice channels or play audio. It saves your taste.



## What you can do

- **Search songs by name** to add into your music diary 🔍
- **Accept and save songs** from Spotify / YT Music / SoundCloud links 🔗
- **Browse your song list** with pages + an artist filter 📜
- **Peek at someone else's favs** with `t!favs @someone` 👀
- **Favourite albums too**, then browse them the same way 💿
- **Look up song info** (cover, artist, album, year, listener-style stats) 💽
- **Look up albums** (type a name, pick from the top 5, then see the tracklist) 📀
- **Look up artists** (type a name, pick from the top 5, then see portrait/genre/years) 👤
- **Browse an artist's album catalogue** (pick the artist, then albums → songs, with a blue **Back** button) 💿
- **Peek at a user's (incl. yourself) top artists**, ranked by how many of their songs are in a fav list 🎖️



## Quick start

1. `/fav Blinding Lights` or paste a Spotify / YT Music / SoundCloud track link
2. Pick the right result if you searched by name (bot shows the **top 5**). Hit the red **Cancel** if you change your mind.
3. `/favs` to view your song list — or `/favs @someone` to peek at theirs
4. `/favab Thriller` to save an album, `/favsab` to see your album list
5. `/song <song_name_or_link>`, `/album <album_name>`, or `/artist <artist_name>` when you want the lore 😏 — pick from the top 5 if several match
6. `/catalog Michael Jackson` — pick the artist, browse albums, tap one for the tracklist, then **Back**



## Commands

Same commands work with the `t!` prefix, e.g. `t!fav`, `t!help`.

`t!view` / `/view` is gone — use `t!favs @someone` / `/favs @someone` instead.


| Command | What it does |
| --- | --- |
| `/fav` | Save a song by name or link. Name search shows numbered picks + a red **Cancel**. |
| `/favs` | Your favourite songs, or tag someone to peek at theirs (pages + artist filter) |
| `/unfav` | Remove a song. Browse your list (pages + artist filter + red **Cancel**), or search by title |
| `/favab` | Save an album by name. Top 5 picks + a red **Cancel**. |
| `/favsab` | Your favourite albums, or tag someone to peek at theirs (pages + artist filter) |
| `/unfavab` | Remove an album. Browse your list (artist filter + red **Cancel**), or search by title |
| `/song` | Cover, title, artist, album, year, and stats |
| `/album` | Type a name, pick from the top 5 (+ red **Cancel**), then see the album's tracks |
| `/artist` | Type a name, pick from the top 5 (+ red **Cancel**), then see portrait, genre, and years |
| `/catalog` | Type a name, pick from the top 5 (+ red **Cancel**), then browse albums → songs |
| `/topartists` | Artists ranked by how many songs you (or someone else) have favourited |
| `/help` | Shows commands |
| `/ping` | Check whether the bot is online |


Songs vs albums, if you forget which command is which:

| Songs | Albums |
| --- | --- |
| `t!fav` | `t!favab` |
| `t!unfav` | `t!unfavab` |
| `t!favs [@user]` | `t!favsab [@user]` |
| `t!song` | `t!album` |



## Album lookup

`t!album Thriller` (or `/album`) first shows **top 5 matching albums** (with a red **Cancel**). After you pick one, it shows that album's **tracklist** (with pages if it's long). There is no Back button here — you already came from search, not from an artist catalogue.



## Favourite albums

| Command | What happens |
| --- | --- |
| `t!favab Thriller` / `/favab` | Top 5 album search + red **Cancel**. Pick one to save it |
| `t!favsab` / `/favsab` | Your favourite albums (pages + artist filter) |
| `t!favsab @someone` | Peek at someone else's favourite albums |
| `t!unfavab` / `/unfavab` with no name | Your album list, with an **artist dropdown**, pages, numbered picks, and a red **Cancel** below the filter |
| `t!unfavab Thriller` | Searches *your* favourite albums, then lets you pick the match. Same **artist dropdown** + red **Cancel** |
| No matches for that search | Bot says no favourite albums matched. Try another title, or run `t!unfavab` to browse |
| Slash autocomplete | Start typing a title — pick it from Discord's list to remove it immediately |



## Artist catalogue

`t!catalog Michael Jackson` (or `/catalog`) first shows **top 5 matching artists** (with a red **Cancel**). After you pick one, it lands on **albums**.

`t!artist` / `/artist` uses the same picker, then shows the bio (not the album list).

1. Pick an album with the numbered buttons
2. See that album's songs (with pages if the tracklist is long)
3. Hit the blue **Back** button to return to the album list

You can also flip through album pages if they have a big discography.



## Unfavouriting songs

| How you unfav | What happens |
| --- | --- |
| `t!unfav` / `/unfav` with no name | Your fav list, with an **artist dropdown**, pages, numbered picks, and a red **Cancel** below the filter |
| `t!unfav Billie Jean` | Searches *your* favs like a search engine, then lets you pick the match. Same **artist dropdown** + red **Cancel** |
| No matches for that search | Bot says no favourites matched. Try another title, or run `t!unfav` to browse |
| Slash autocomplete | Start typing a title — pick it from Discord's list to remove it immediately |

Hit **Cancel** on a pick list if you don't want to remove (or save) anything.



## 💡Good to know

- **Track links for `/fav`** — Spotify / YT Music / SoundCloud *song* links. Album and playlist links won't save. Use `/favab` + an album name for albums.
- **No duplicates** — you can't save the exact same song link or album twice.
- **Pickers are yours** — only you can press the numbered buttons / Cancel on a search you started.
- **Not a music player** — no voice channel, no queue, no playback. You'll have to ask Jockie Music for that.
- Built for hanging out in servers and sharing your wholesome music tastes with your pals. ✨
