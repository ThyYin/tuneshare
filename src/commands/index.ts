import { Collection } from 'discord.js';
import type { Command } from '../types/command';
import { ping } from './ping';

export const commands = new Collection<string, Command>();

const commandList: Command[] = [ping];

for (const command of commandList) {
  commands.set(command.data.name, command);
}
