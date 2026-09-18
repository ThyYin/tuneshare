import { Collection } from 'discord.js';
import type { Command } from '../types/command';
import { album } from './album';
import { artist } from './artist';
import { catalog } from './catalog';
import { fav } from './fav';
import { favab } from './favab';
import { favs } from './favs';
import { favsab } from './favsab';
import { help } from './help';
import { info } from './info';
import { ping } from './ping';
import { topartists } from './topartists';
import { unfav } from './unfav';
import { unfavab } from './unfavab';

export const commands = new Collection<string, Command>();

const commandList: Command[] = [
  help,
  ping,
  fav,
  favs,
  unfav,
  favab,
  favsab,
  unfavab,
  info,
  album,
  topartists,
  artist,
  catalog,
];

for (const command of commandList) {
  commands.set(command.data.name, command);
}
