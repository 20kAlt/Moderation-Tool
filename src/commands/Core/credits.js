import { readFile } from 'node:fs/promises';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const CREDITS_FILE = new URL('../../../credits.json', import.meta.url);

export default {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Shows bot ownership and asset rights information'),

  async execute(interaction) {
    try {
      const credits = JSON.parse(await readFile(CREDITS_FILE, 'utf8'));
      await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: credits.title, description: credits.notice })],
      });
    } catch (error) {
      logger.error('Credits command error:', error);
      await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: 'Credits Unavailable',
          description: 'Could not load the credits notice.',
          color: 'error',
        })],
      }).catch(() => {});
    }
  },
};