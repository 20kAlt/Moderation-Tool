import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildRoleUpdate,
  once: false,

  async execute(oldRole, newRole) {
    try {
      if (!newRole.guild) return;

      const changes = [];
      const addChange = (label, before, after) => {
        if (before !== after) {
          changes.push(`**${label}:** ${before} → ${after}`);
        }
      };

      addChange('Name', oldRole.name, newRole.name);
      addChange('Color', oldRole.hexColor, newRole.hexColor);
      addChange('Hoisted', oldRole.hoist ? 'Yes' : 'No', newRole.hoist ? 'Yes' : 'No');
      addChange('Mentionable', oldRole.mentionable ? 'Yes' : 'No', newRole.mentionable ? 'Yes' : 'No');
      addChange('Position', oldRole.position, newRole.position);

      const oldPermissions = oldRole.permissions.toArray().sort().join(', ') || 'None';
      const newPermissions = newRole.permissions.toArray().sort().join(', ') || 'None';
      addChange('Permissions', oldPermissions, newPermissions);

      if (changes.length === 0) return;

      await logEvent({
        client: newRole.client,
        guildId: newRole.guild.id,
        eventType: EVENT_TYPES.ROLE_UPDATE,
        data: {
          title: 'Role updated',
          headline: `${newRole} was updated`,
          lines: [`**Role ID:** \`${newRole.id}\``, ...changes],
        },
      });
    } catch (error) {
      logger.error('Error in roleUpdate event:', error);
    }
  },
};
