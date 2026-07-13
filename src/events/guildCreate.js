import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
<<<<<<< HEAD
import { getGuildConfig, setGuildConfig } from '../services/guildConfig.js';
=======
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)

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
    } catch (error) {
      logger.error(`Error initializing guild ${guild?.id} on join:`, error);
    }
  },
};
