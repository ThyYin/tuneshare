import type { User } from 'discord.js';

export type DisplayNameMember = {
  displayName?: string | null;
  nick?: string | null;
};

export function getDisplayName(user: User, member?: DisplayNameMember | null): string {
  if (member?.displayName) {
    return member.displayName;
  }

  if (member?.nick) {
    return member.nick;
  }

  return user.displayName;
}
