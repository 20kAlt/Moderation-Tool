import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const CHANNEL_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function canManageAnnouncements(interaction) {
  return interaction.guild?.ownerId === interaction.user?.id
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

function getPrefixChannelId(interaction) {
  const value = interaction.options.getString('channel')?.trim();
  if (!value) return null;
  return value.match(/^<#(\d+)>$/)?.[1] || value;
}

async function executeAnnouncements(interaction, client) {
  if (!canManageAnnouncements(interaction)) {
    await InteractionHelper.safeReply(interaction, {
      content: 'Only this server’s owner or a member with Manage Server permission can configure announcements.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const prefixChannelInput = interaction._isPrefixCommand
    ? interaction.options.getString('channel')?.trim()
    : null;
  const disable = interaction.options.getBoolean('disable')
    || prefixChannelInput?.toLowerCase() === 'disable';
  const selectedChannel = interaction._isPrefixCommand
    ? null
    : interaction.options.getChannel('channel');
  const channelId = interaction._isPrefixCommand
    ? getPrefixChannelId(interaction)
    : selectedChannel?.id || null;

  if (!await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral })) {
    return;
  }

  if (disable) {
    await patchGuildConfig(client, interaction.guildId, {
      announcements: { enabled: false, channelId: null },
    });
    await InteractionHelper.safeEditReply(interaction, {
      content: 'Global bot announcements are now disabled for this server.',
    });
    return;
  }

  if (!channelId) {
    const config = await getGuildConfig(client, interaction.guildId);
    const current = config.announcements?.enabled && config.announcements.channelId
      ? `<#${config.announcements.channelId}>`
      : 'Off';
    await InteractionHelper.safeEditReply(interaction, {
      content: `Global bot announcements: **${current}**.\nSet a channel with \`/announcements channel\` or \`?announcements #channel\`. Disable them with \`/announcements disable:true\` or \`?announcements disable\`.`,
    });
    return;
  }

  const channel = selectedChannel
    || interaction.guild.channels.cache.get(channelId)
    || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (
    !channel
    || channel.guildId !== interaction.guildId
    || !CHANNEL_TYPES.has(channel.type)
  ) {
    await InteractionHelper.safeEditReply(interaction, {
      content: 'Choose a text or announcement channel from this server.',
    });
    return;
  }

  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    await InteractionHelper.safeEditReply(interaction, {
      content: `I need View Channel, Send Messages, and Embed Links in ${channel} before it can receive announcements.`,
    });
    return;
  }

  try {
    await patchGuildConfig(client, interaction.guildId, {
      announcements: { enabled: true, channelId: channel.id },
    });
  } catch (error) {
    logger.error(`Could not save announcement channel for guild ${interaction.guildId}:`, error);
    await InteractionHelper.safeEditReply(interaction, {
      content: 'Could not save the announcement settings. Please try again.',
    });
    return;
  }

  await InteractionHelper.safeEditReply(interaction, {
    content: `Global bot announcements are now enabled in ${channel}.`,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('announcements')
    .setDescription('Configure this server’s opt-in channel for global bot announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Announcement channel; omit to check status')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('disable')
        .setDescription('Turn off global bot announcements for this server')
        .setRequired(false),
    ),
  category: 'Core',

  async execute(interaction, _guildConfig, client) {
    await executeAnnouncements(interaction, client);
  },

  async prefixExecute(interaction, _guildConfig, client) {
    await executeAnnouncements(interaction, client);
  },
};
