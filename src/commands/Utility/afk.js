import { SlashCommandBuilder } from 'discord.js';
import { setAfkStatus } from '../../services/afkService.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your status to away and optionally share a reason.')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Why you are away')
        .setMaxLength(200),
    ),
  category: 'Utility',

  async execute(interaction) {
    const reason = interaction.options.getString('reason')?.trim() || null;
    const status = await setAfkStatus(interaction.guildId, interaction.user.id, reason);

    if (!status) {
      await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
          title: 'Unable to Set AFK Status',
          description: 'Your AFK status could not be saved. Please try again shortly.',
          color: 'error',
        })],
      });
      return;
    }

    await InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: 'AFK Status Set',
        description: reason
          ? `You are now marked as away.\n**Reason:** ${reason}`
          : 'You are now marked as away. Your status will clear when you send your next message.',
        color: 'success',
      })],
    });
  },
};