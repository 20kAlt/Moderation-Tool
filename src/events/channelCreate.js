import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelCreate,
  once: false,

  async execute(channel) {
    try {
      if (!channel.guild) return;

      await logEvent({
        client: channel.client,
        guildId: channel.guild.id,
        eventType: EVENT_TYPES.CHANNEL_CREATE,
        data: {
          title: 'Channel created',
          headline: `${channel} was created`,
          lines: [
            `**Name:** ${channel.name}`,
            `**Type:** ${channel.constructor.name.replace(/Channel$/, '')}`,
            `**Channel ID:** \`${channel.id}\``,
            channel.parent ? `**Category:** ${channel.parent}` : null,
          ].filter(Boolean),
          channelId: channel.id,
        },
      });
    } catch (error) {
      logger.error('Error in channelCreate event:', error);
    }
  },
};
