import { MessageFlags } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { createBugReportStatusRow, updateBugReportStatusEmbed } from '../../../services/bugReportService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { BUG_REPORT_CHANNEL_ID } from '../../modals/help/bugReport.js';

function isAuthorizedBotOwner(interaction, client) {
    const applicationOwner = client.application?.owner;
    return isBotOwner(interaction.user.id)
        || applicationOwner?.id === interaction.user.id
        || applicationOwner?.ownerId === interaction.user.id;
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

        if (!isAuthorizedBotOwner(interaction, client)) {
            return InteractionHelper.safeReply(interaction, {
                content: `Your account is not configured as a bot owner. Add your Discord user ID (${interaction.user.id}) to OWNER_IDS and restart the bot.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.channelId !== BUG_REPORT_CHANNEL_ID) {
            return InteractionHelper.safeReply(interaction, {
                content: 'Bug reports can only be updated in the configured private bug-report channel.',
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

        let submitterNotified = false;
        if (status === 'complete') {
            const reportedBy = reportEmbed.fields?.find(field => field.name === 'Reported by')?.value || '';
            const submitterId = reportedBy.match(/<@!?(\d+)>/)?.[1] || reportedBy.match(/\b\d{17,20}\b/)?.[0];
            if (submitterId) {
                const submitter = await client.users.fetch(submitterId).catch(() => null);
                if (submitter) {
                    submitterNotified = await submitter.send({
                        content: 'Thank you for taking the time to report a bug. We have reviewed your report and marked it as complete. Your feedback helps us improve the bot, and we appreciate your help making it better for everyone.',
                    }).then(() => true).catch(() => false);
                }
            }
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: `Bug report marked ${status === 'complete' ? 'complete' : 'pending'}.${status === 'complete' && !submitterNotified ? ' The submitter could not be notified by DM.' : ''}`,
        });
    },
};