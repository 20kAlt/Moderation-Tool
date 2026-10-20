import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const prompts = [
  'What is a small thing that made you smile today?',
  'What game could you play forever?',
  'What fictional world would you visit for a day?',
  'What is your most useful unusual skill?',
  'What song always improves your mood?',
  'What is the best snack for a gaming session?',
  'If you could instantly learn one skill, what would it be?',
  'What is a hobby you would recommend to everyone?',
];

export default {
  data: new SlashCommandBuilder()
    .setName('icebreaker')
    .setDescription('Start a friendly conversation in the server.'),
  category: 'Fun',

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction);
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    const embed = createEmbed({
      title: 'Conversation starter',
      description: prompt,
      color: 'primary',
    });
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Icebreaker command used by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};
