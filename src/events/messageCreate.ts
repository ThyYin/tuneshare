import { Client, Events, type Message } from 'discord.js';
import { commands } from '../commands';
import { COMMAND_PREFIX } from '../constants';
import { createMessageContext, parsePrefixCommand } from '../utils/commandContext';
import { UserFacingError, UserMessages } from '../utils/errors';
import { logger } from '../utils/logger';

export function registerMessageCreateEvent(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    try {
      await handlePrefixMessage(message);
    } catch (error) {
      await handleMessageError(message, error);
    }
  });
}

async function handlePrefixMessage(message: Message): Promise<void> {
  if (message.author.bot || message.webhookId) {
    return;
  }

  const parsed = parsePrefixCommand(message.content);
  if (!parsed) {
    return;
  }

  if (!parsed.name) {
    await message.reply(`Try \`${COMMAND_PREFIX}help\` to see every command.`);
    return;
  }

  const command = commands.get(parsed.name);
  if (!command) {
    await message.reply(UserMessages.unknownPrefixCommand);
    return;
  }

  await command.execute(createMessageContext(command, message, parsed.args));
}

async function handleMessageError(message: Message, error: unknown): Promise<void> {
  const content = error instanceof UserFacingError ? error.userMessage : UserMessages.generic;

  if (!(error instanceof UserFacingError)) {
    logger.error(`Error handling prefix command from ${message.author.id}`, error);
  }

  try {
    await message.reply({ content });
  } catch (replyError) {
    logger.error('Failed to send prefix command error reply', replyError);
  }
}
