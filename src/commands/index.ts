import { Collection } from 'discord.js';
import type { Command } from '../types/command';
import { artist } from './artist';
import { fav } from './fav';
import { favs } from './favs';
import { help } from './help';
import { info } from './info';
import { ping } from './ping';
import { topartists } from './topartists';
import { unfav } from './unfav';
import { view } from './view';

export const commands = new Collection<string, Command>();

const commandList: Command[] = [help, ping, fav, favs, view, unfav, info, topartists, artist];

for (const command of commandList) {
  commands.set(command.data.name, command);
}
