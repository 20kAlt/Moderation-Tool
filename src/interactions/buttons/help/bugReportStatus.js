import { MessageFlags } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { createBugReportStatusRow, updateBugReportStatusEmbed } from '../../../services/bugReportService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { BUG_REPORT_CHANNEL_ID } from '../../modals/help/bugReport.js';

function isAuthorizedBotOwner(interaction, client) {
    return isBotOwner(interaction.user.id) || client.application?.owner?.id === interaction.user.id;
}

export default {
    name: 'bugreport_status',
    async execute(interaction, client, args) {
        const status = args[0];
        if (status !== 'pending' && status !== 'complete') {
            return InteractionHelper.safeReply(interaction, {
                content: 'That bug-report status is invalid.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!isAuthorizedBotOwner(interaction, client) || interaction.channelId !== BUG_REPORT_CHANNEL_ID) {
            return InteractionHelper.safeReply(interaction, {
                content: 'Only the bot owner can update reports in the private bug-report channel.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const reportEmbed = interaction.message.embeds[0];
        if (reportEmbed?.title !== 'Bot Bug Report') {
            return InteractionHelper.safeReply(interaction, {
                content: 'This message is not a bot bug report.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        await interaction.message.edit({
            embeds: [updateBugReportStatusEmbed(reportEmbed, status)],
            components: [createBugReportStatusRow(status)],
        });
        await InteractionHelper.safeEditReply(interaction, {
            content: `Bug report marked ${status === 'complete' ? 'complete' : 'pending'}.`,
        });
    },
};