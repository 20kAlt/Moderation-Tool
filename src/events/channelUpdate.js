import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelUpdate,
  once: false,

  async execute(oldChannel, newChannel) {
    try {
      if (!newChannel.guild) return;

      const changes = [];
      const addChange = (label, before, after) => {
        if (before !== after) {
          changes.push(`**${label}:** ${before ?? '*(none)*'} → ${after ?? '*(none)*'}`);
        }
      };

      addChange('Name', oldChannel.name, newChannel.name);
      addChange('Topic', oldChannel.topic, newChannel.topic);
      addChange('Category', oldChannel.parent?.id, newChannel.parent?.id);
      addChange('Slowmode', oldChannel.rateLimitPerUser, newChannel.rateLimitPerUser);
      addChange('NSFW', oldChannel.nsfw ? 'Yes' : 'No', newChannel.nsfw ? 'Yes' : 'No');
      addChange('Position', oldChannel.position, newChannel.position);
      addChange('Bitrate', oldChannel.bitrate, newChannel.bitrate);
      addChange('User limit', oldChannel.userLimit, newChannel.userLimit);

      if (changes.length === 0) return;

      await logEvent({
        client: newChannel.client,
        guildId: newChannel.guild.id,
        eventType: EVENT_TYPES.CHANNEL_UPDATE,
        data: {
          title: 'Channel updated',
          headline: `${newChannel} was updated`,
          lines: [`**Channel ID:** \`${newChannel.id}\``, ...changes],
          channelId: newChannel.id,
        },
      });
    } catch (error) {
      logger.error('Error in channelUpdate event:', error);
    }
  },
};
