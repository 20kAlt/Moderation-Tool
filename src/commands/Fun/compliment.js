import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const compliments = [
  'You make this server a better place.',
  'Your energy is genuinely contagious.',
  'You have excellent taste in communities.',
  'You are doing better than you think.',
  'Your creativity is seriously impressive.',
  'You bring good vibes wherever you go.',
  'You are a wonderful part of this community.',
  'Your sense of humor is top tier.',
];

export default {
  data: new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Send a kind, friendly compliment.')
    .addUserOption((option) =>
      option.setName('member').setDescription('Who should receive the compliment?'),
    ),
  category: 'Fun',
  helpInvocation: 'both',

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction);
    const member = interaction.options.getUser('member') || interaction.user;
    const compliment = compliments[Math.floor(Math.random() * compliments.length)];
    const embed = createEmbed({
      title: 'Kindness delivered',
      description: `**${member.username}**, ${compliment}`,
      color: 'primary',
    });
    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Compliment command used by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};
