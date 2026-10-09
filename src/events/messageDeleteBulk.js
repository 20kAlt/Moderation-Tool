import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import messageDelete from './messageDelete.js';

export default {
  name: Events.MessageBulkDelete,
  once: false,

  async execute(messages) {
    for (const message of messages.values()) {
      await messageDelete.execute(message).catch((error) => {
        logger.error(`Failed to log bulk-deleted message ${message.id}:`, error);
      });
    }
  },
};
