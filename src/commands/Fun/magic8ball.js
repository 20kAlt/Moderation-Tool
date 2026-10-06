import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const answers = [
  'Yes — definitely.',
  'It is decidedly so.',
  'Without a doubt.',
  'Signs point to yes.',
  'Ask again later.',
  'Better not tell you now.',
  'Concentrate and ask again.',
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
  'You may rely on it.',
  'The stars say yes.',
  'This is looking promising.',
  'Seems a little fuzzy — try again.',
  'No way, José.',
  'The odds are in your favor.',
  'A cosmic yes is on the way.',
  'Not today, friend.',
  'The universe is still deciding.',
  'Most likely.',
];

export default {
  data: new SlashCommandBuilder()
    .setName('magic8ball')
    .setDescription('Ask the Magic 8 Ball a question.')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('The question you want answered')
        .setRequired(true)
        .setMaxLength(200),
    ),
  category: 'Fun',

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const question = interaction.options.getString('question')?.trim() || 'No question asked.';
    const answer = answers[Math.floor(Math.random() * answers.length)];

    const embed = createEmbed({
      title: '🎱 Magic 8 Ball',
      description: `Question: "${question}"\n\n✨ **${answer}**`,
      color: 'primary',
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Magic 8 Ball command used by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};
