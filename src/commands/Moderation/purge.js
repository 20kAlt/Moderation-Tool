import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const MAX_BULK_DELETE_AMOUNT = 500;
const BULK_DELETE_BATCH_SIZE = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete up to 500 recent messages from this channel")
    .addIntegerOption((option) =>
      option
    .setName("amount")
    .setDescription("Number of recent messages to delete (1-500)")
    .setRequired(true)
    .setMinValue(1)
    .setMaxValue(MAX_BULK_DELETE_AMOUNT),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    try {
      const amount = interaction.options.getInteger("amount");
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BULK_DELETE_AMOUNT) {
    return await replyUserError(interaction, {
      type: ErrorTypes.VALIDATION,
      message: `Please specify a number between 1 and ${MAX_BULK_DELETE_AMOUNT}.`,
    });
      }

      const channel = interaction.channel;
      if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.bulkDelete) {
    return await replyUserError(interaction, {
      type: ErrorTypes.VALIDATION,
      message: 'This command can only be used in a server text channel that supports bulk deletion.',
    });
      }

      const botMember = interaction.guild?.members.me;
      const requiredBotPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
      ];
      const channelPermissions = botMember ? channel.permissionsFor(botMember) : null;
      if (!channelPermissions?.has(requiredBotPermissions)) {
    return await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: 'I need **View Channel**, **Read Message History**, and **Manage Messages** in this channel.',
    });
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, {
    flags: MessageFlags.Ephemeral,
      });
      if (!deferSuccess) {
    logger.warn('Purge interaction defer failed', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      commandName: 'purge',
    });
    return;
      }

      const { deletedCount, skippedOldMessages } = await purgeChannelMessages(channel, amount);
      await logEvent({
    client,
    guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            skippedOldMessages,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            "Messages Purged",
            `Deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'} in ${channel}.${skippedOldMessages ? '\nMessages older than 14 days were skipped because Discord does not allow bulk deletion of them.' : ''}`,
          ),
        ],
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'An error occurred while deleting messages. Messages older than 14 days cannot be bulk deleted.',
      });
    }
  }
};

export async function purgeChannelMessages(channel, amount) {
  let deletedCount = 0;
  let skippedOldMessages = false;
  let before;

  while (deletedCount < amount) {
    const limit = Math.min(BULK_DELETE_BATCH_SIZE, amount - deletedCount);
    const batch = await channel.messages.fetch({ limit, ...(before ? { before } : {}) });
    if (batch.size === 0) {
      break;
    }
    before = batch.last()?.id;

    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS + 1000;
    const eligibleMessages = batch.filter(
      message => message.createdTimestamp >= cutoff,
    );
    skippedOldMessages ||= eligibleMessages.size < batch.size;

    if (eligibleMessages.size > 0) {
      const deleted = await channel.bulkDelete(eligibleMessages);
      deletedCount += deleted.size;
    }

    if (skippedOldMessages || batch.size < limit || deletedCount >= amount) {
      break;
    }
  }

  return { deletedCount, skippedOldMessages };
}