import { SlashCommandBuilder } from 'discord.js';
import {
  createAfkNickname,
  getAfkStatus,
  setAfkStatus,
} from '../../services/afkService.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

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
    const member = interaction.member;
    const existingStatus = await getAfkStatus(interaction.guildId, interaction.user.id);
    const originalNickname = existingStatus
      ? existingStatus.originalNickname ?? member?.nickname ?? null
      : member?.nickname ?? null;
    const status = await setAfkStatus(
      interaction.guildId,
      interaction.user.id,
      reason,
      originalNickname,
    );

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

    let nicknameUpdated = false;
    if (member?.setNickname) {
      const displayName = originalNickname || member.displayName || interaction.user.username;
      const afkNickname = createAfkNickname(displayName);

      try {
        if (member.nickname !== afkNickname) {
          await member.setNickname(afkNickname, 'Member set their AFK status');
        }
        nicknameUpdated = true;
      } catch (error) {
        logger.warn(`Could not set AFK nickname for member ${interaction.user.id} in guild ${interaction.guildId}:`, error);
      }
    }

    await InteractionHelper.safeReply(interaction, {
      embeds: [createEmbed({
        title: 'AFK Status Set',
        description: reason
          ? `You are now marked as away.${nicknameUpdated ? ' Your nickname now shows **AFK** and will be restored when you return.' : ' I could not change your nickname; check that I have Manage Nicknames permission and my role is above yours.'}\n**Reason:** ${reason}`
          : `You are now marked as away. Your status will clear when you send your next message.${nicknameUpdated ? ' Your nickname now shows **AFK** and will be restored when you return.' : ' I could not change your nickname; check that I have Manage Nicknames permission and my role is above yours.'}`,
        color: 'success',
      })],
    });
  },
};