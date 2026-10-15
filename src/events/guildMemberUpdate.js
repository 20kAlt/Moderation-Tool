import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

      if (addedRoles.size > 0) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_ROLE_ADD,
          data: {
            title: 'Role added to member',
            lines: [
              `**Member:** ${newMember.user} (${newMember.user.tag})`,
              `**Roles added:** ${[...addedRoles.values()].map((role) => `${role} (\`${role.id}\`)`).join(', ')}`,
            ],
            userId: newMember.user.id,
          },
        });
      }

      if (removedRoles.size > 0) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_ROLE_REMOVE,
          data: {
            title: 'Role removed from member',
            lines: [
              `**Member:** ${newMember.user} (${newMember.user.tag})`,
              `**Roles removed:** ${[...removedRoles.values()].map((role) => `**${role.name}** (\`${role.id}\`)`).join(', ')}`,
            ],
            userId: newMember.user.id,
          },
        });
      }

      if (oldMember.nickname !== newMember.nickname) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.user.id,
          }
        });

      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};