import {
    SlashCommandBuilder,
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';
import { closeTicket, generateTranscript } from '../../services/ticket.js';
import { getTicketData, saveTicketData } from '../../utils/database.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('merge')
        .setDescription('Merge this open ticket into another ticket and archive it')
        .setDMPermission(false)
        .addChannelOption((option) =>
            option
                .setName('destination')
                .setDescription('The open ticket that will receive this ticket transcript')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        ),

    category: 'Ticket',

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) return;

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Use `/merge` inside the open ticket you want to merge.',
            });
        }

        if (!permissionContext.canManageTicket) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Only ticket staff or members with **Manage Channels** can merge tickets.',
            });
        }

        const destination = await interaction.options.getChannel('destination');
        if (!destination || destination.type !== ChannelType.GuildText || destination.guildId !== interaction.guildId) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Choose a text channel in this server as the destination ticket.',
            });
        }

        if (destination.id === interaction.channelId) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'The destination must be a different ticket channel.',
            });
        }

        const actorPermissions = destination.permissionsFor(interaction.member);
        if (!actorPermissions?.has(PermissionFlagsBits.ViewChannel)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'You need access to the destination ticket before merging into it.',
            });
        }

        const sourceBotPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);
        if (!sourceBotPermissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
        ])) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'I need permission to view and read the source ticket history to create its transcript.',
            });
        }

        const botPermissions = destination.permissionsFor(destination.guild.members.me);
        if (!botPermissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
        ])) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `I need permission to view, read, and send messages and attachments in ${destination}.`,
            });
        }

        const destinationTicket = await getTicketData(interaction.guildId, destination.id);
        if (!destinationTicket || destinationTicket.status !== 'open') {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'The destination must be an open ticket channel.',
            });
        }

        if (permissionContext.ticketData.status !== 'open') {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Only open tickets can be merged.',
            });
        }

        if (permissionContext.ticketData.userId !== destinationTicket.userId) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Tickets can only be merged when they belong to the same member.',
            });
        }

        const transcript = await generateTranscript(interaction.channel);
        if (!transcript) {
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Could not generate the source ticket transcript, so no changes were made.',
            });
        }

        const sourceTicket = permissionContext.ticketData;
        const mergedAt = new Date().toISOString();
        const sourceNumber = sourceTicket.ticketNumber || sourceTicket.id;
        const destinationNumber = destinationTicket.ticketNumber || destinationTicket.id;
        const mergeEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`Ticket #${sourceNumber} merged`)
            .setDescription(`Transcript from ${interaction.channel} was merged into this ticket by ${interaction.user}.`)
            .addFields(
                { name: 'Source ticket', value: `${interaction.channel} (\`${interaction.channel.id}\`)`, inline: true },
                { name: 'Merged by', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                { name: 'Merged at', value: `<t:${Math.floor(Date.parse(mergedAt) / 1000)}:F>`, inline: false },
            )
            .setTimestamp(mergedAt);

        await destination.send({
            embeds: [mergeEmbed],
            files: [transcript],
            allowedMentions: { parse: [], users: [], roles: [] },
        });

        const archivedTicket = await closeTicket(
            interaction.channel,
            interaction.user,
            `Merged into ticket #${destinationNumber} (${destination}) by ${interaction.user.tag}.`,
        );

        archivedTicket.mergedIntoChannelId = destination.id;
        archivedTicket.mergedAt = mergedAt;
        archivedTicket.mergedBy = interaction.user.id;
        await saveTicketData(interaction.guildId, interaction.channelId, archivedTicket);

        await logEvent({
            client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.TICKET_MERGE,
            data: {
                title: 'Ticket merged',
                lines: [
                    formatLogLine('Source ticket', `${interaction.channel} (#${sourceNumber})`),
                    formatLogLine('Destination ticket', `${destination} (#${destinationNumber})`),
                    formatLogLine('Merged by', `${interaction.user} (\`${interaction.user.id}\`)`),
                    formatLogLine('Merged at', `<t:${Math.floor(Date.parse(mergedAt) / 1000)}:F>`),
                ],
                quoted: true,
                userId: interaction.user.id,
                channelId: destination.id,
            },
        });

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                'Tickets Merged',
                `Ticket **#${sourceNumber}** was copied into ${destination} and closed as an archive. The original channel was kept.`,
            )],
        });
    },
};
