import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { createBugReportStatusRow } from '../../../services/bugReportService.js';

export const BUG_REPORT_CHANNEL_ID = '1554888243663732908'; // server chanel (bot owner only)

export default {
    name: 'help_bug_report_modal',
    async execute(interaction, client) {
        if (!interaction.inGuild()) {
            throw new Error('Bug reports must be submitted from a server.');
        }

        const bug = interaction.fields.getTextInputValue('bug').trim();
        const proof = interaction.fields.getTextInputValue('proof')?.trim();

        if (bug.length < 10 || bug.length > 1800) {
            throw new Error('Please describe the bug in 10 to 1,800 characters.');
        }
        if (proof && proof.length > 1000) {
            throw new Error('Proof links must be 1,000 characters or fewer.');
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const reportChannel = await client.channels.fetch(BUG_REPORT_CHANNEL_ID).catch(() => null);
        if (!reportChannel?.isTextBased() || typeof reportChannel.send !== 'function') {
            throw new Error('The bot-owner bug-report channel is unavailable. Please try again later.');
        }

        const embed = new EmbedBuilder()
            .setColor(0xD64545)
            .setTitle('Bot Bug Report')
            .setDescription(bug)
            .addFields(
                { name: 'Status', value: '🕓 Pending', inline: true },
                { name: 'Server', value: `${interaction.guild.name}\n\`${interaction.guildId}\``, inline: true },
                { name: 'Reported by', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
                { name: 'Proof', value: proof || 'Not provided', inline: false },
            )
            .setTimestamp();

        await reportChannel.send({
            embeds: [embed],
            components: [createBugReportStatusRow()],
            allowedMentions: { parse: [] },
        });
        await InteractionHelper.safeEditReply(interaction, {
            content: 'Your bug report was sent privately to the bot owner for review. Thanks for including details and any optional proof.',
        });
    },
};