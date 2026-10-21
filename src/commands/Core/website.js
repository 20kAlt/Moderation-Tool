import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const WEBSITE_URL = 'https://moderation-tool-website--20k1.replit.app/';

export default {
  data: new SlashCommandBuilder()
    .setName('website')
    .setDescription('Get the official website link'),

  async execute(interaction) {
    try {
      const websiteButton = new ButtonBuilder()
        .setLabel('Open Website')
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_URL);

      const actionRow = new ActionRowBuilder().addComponents(websiteButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({
            title: 'Moderation Tool Website',
            description: 'Visit the official Moderation Tool website',
          }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Website command error:', error);

      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'System Error', description: 'Could not display website information.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};