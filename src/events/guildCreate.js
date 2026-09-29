import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';
import { registerCommandsForGuild } from '../handlers/loaders/commandLoader.js';

export default {
  name: Events.GuildCreate,
  async execute(guild, client) {
    try {
      logger.info('Bot joined guild', {
        event: 'guild.create',
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      });

      const config = await getGuildConfig(client, guild.id);
      await setGuildConfig(client, guild.id, config);
      await registerCommandsForGuild(client, guild.id);
    } catch (error) {
      logger.error(`Error initializing guild ${guild?.id} on join:`, error);
    }
  },
};
