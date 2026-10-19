import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const ANNOUNCEMENT_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);

export function buildAnnouncementEmbed(scope, message) {
  return new EmbedBuilder()
    .setTitle(scope === 'global' ? 'Global Announcement' : 'Server Announcement')
    .setDescription(message)
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter({ text: 'Moderation Tool' });
}

function canSendAnnouncement(channel, guild) {
  if (!channel || !ANNOUNCEMENT_CHANNEL_TYPES.has(channel.type)) {
    return false;
  }

  const permissions = channel.permissionsFor(guild.members.me);
  return Boolean(permissions?.has([
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]));
}

export async function sendGlobalAnnouncement(client, message) {
  let sent = 0;
  let skipped = 0;

  for (const guild of client.guilds.cache.values()) {
    let guildConfig;
    try {
      guildConfig = await getGuildConfig(client, guild.id);
    } catch (error) {
      skipped += 1;
      logger.warn(`Could not load announcement settings for guild ${guild.id}:`, error);
      continue;
    }

    if (!guildConfig.announcements?.enabled || !guildConfig.announcements.channelId) {
      skipped += 1;
      continue;
    }

    let channel;
    try {
      channel = guild.channels.cache.get(guildConfig.announcements.channelId)
        || await guild.channels.fetch(guildConfig.announcements.channelId);
    } catch (error) {
      skipped += 1;
      logger.warn(`Could not fetch configured announcement channel in guild ${guild.id}:`, error);
      continue;
    }

    if (!canSendAnnouncement(channel, guild)) {
      skipped += 1;
      logger.warn(`Skipped global announcement in guild ${guild.id}: configured announcement channel is unavailable or not sendable.`);
      continue;
    }

    try {
      await channel.send({
        embeds: [buildAnnouncementEmbed('global', message)],
        allowedMentions: { parse: [], repliedUser: false },
      });
      sent += 1;
    } catch (error) {
      skipped += 1;
      logger.warn(`Could not send global announcement in guild ${guild.id}:`, error);
    }
  }

  return { sent, skipped };
}

async function executeAnnouncement(interaction, client) {
  if (!isBotOwner(interaction.user?.id)) {
    await InteractionHelper.safeReply(interaction, {
      content: 'Only configured bot owners can use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const scope = interaction.options.getString('scope');
  const message = interaction.options.getString('message')?.trim();

  if (!['server', 'global'].includes(scope) || !message) {
    await InteractionHelper.safeReply(interaction, {
      content: 'Choose `server` or `global` and provide an announcement message.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral })) {
    return;
  }

  if (scope === 'server') {
    const channel = interaction.channel;
    if (!interaction.guild || !canSendAnnouncement(channel, interaction.guild)) {
      await InteractionHelper.safeEditReply(interaction, {
        content: 'I cannot post an announcement in this channel. Use a server text channel where I can send messages and embeds.',
      });
      return;
    }

    try {
      await channel.send({
        embeds: [buildAnnouncementEmbed('server', message)],
        allowedMentions: { parse: [], repliedUser: false },
      });
    } catch (error) {
      logger.error(`Could not send server announcement in guild ${interaction.guild.id}:`, error);
      await InteractionHelper.safeEditReply(interaction, {
        content: 'The announcement could not be sent. Check that I can send messages and embeds in this channel.',
      });
      return;
    }

    await InteractionHelper.safeEditReply(interaction, {
      content: `Server announcement posted in ${channel}.`,
    });
    return;
  }

  const result = await sendGlobalAnnouncement(client, message);
  await InteractionHelper.safeEditReply(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle('Global Announcement')
        .setDescription(`Posted in **${result.sent}** opted-in server(s).\nSkipped **${result.skipped}** server(s) that are not configured or have an unavailable announcement channel.`)
        .setColor(result.sent > 0 ? 0x57F287 : 0xFEE75C)
        .setTimestamp(),
    ],
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a bot-owner announcement in this server or across all servers')
    .addStringOption((option) =>
      option
        .setName('scope')
        .setDescription('Where to post the announcement')
        .setRequired(true)
        .addChoices(
          { name: 'This server', value: 'server' },
          { name: 'All servers', value: 'global' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Announcement text')
        .setRequired(true)
        .setMaxLength(2000),
    )
    .setDMPermission(false),
  category: 'Core',
  abuseProtection: { maxAttempts: 2, windowMs: 60_000 },

  async execute(interaction, _guildConfig, client) {
    await executeAnnouncement(interaction, client);
  },

  async prefixExecute(interaction, _guildConfig, client) {
    await executeAnnouncement(interaction, client);
  },
};
