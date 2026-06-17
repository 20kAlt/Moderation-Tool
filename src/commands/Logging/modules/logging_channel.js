import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const DESTINATION_LABELS = {
  audit: 'Audit Log',
  applications: 'Applications',
  reports: 'Reports',
};

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** permissions to configure logging channels.')],
          ephemeral: true,
        });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId, destination, null);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            'Channel Cleared',
            `The **${DESTINATION_LABELS[destination]}** channel has been removed.`,
          )],
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed('Invalid Channel', 'Please provide a valid text channel.')],
        });
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [errorEmbed(
            'Missing Permissions',
            `I need **View Channel**, **Send Messages**, and **Embed Links** in ${channel}.`,
          )],
        });
      }

      await setLogChannel(client, interaction.guildId, destination, channel.id);

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
          'Channel Updated',
          `**${DESTINATION_LABELS[destination]}** logs will be sent to ${channel}.\nUse \`/logging dashboard\` to toggle event categories.`,
        )],
      });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Error', 'Failed to update the log channel.')],
      });
    }
  },
};
