import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import {
    canEditSessionBoard,
    getTrainingOrShiftCards,
    normalizeSessionStatus,
    parseRoleIds,
    syncSessionBoardCard,
} from '../../services/sessionBoardService.js';

const IDEAL_ROLE_LABELS = {
    planned: 'Planned',
    ongoing: 'Ongoing',
    cancelled: 'Cancelled',
};

function getConfiguredRoleIds(config = {}) {
    if (!config?.sessionBoard) {
        return [];
    }

    const sessionBoardConfig = config.sessionBoard;
    const values = [
        ...(Array.isArray(sessionBoardConfig.coHostRoleIds) ? sessionBoardConfig.coHostRoleIds : []),
        ...parseRoleIds(sessionBoardConfig.coHostRoleIds || ''),
    ];

    return [...new Set(values.filter(Boolean))];
}

export default {
    data: new SlashCommandBuilder()
        .setName('sessionboard')
        .setDescription('Manage a Trello Roblox session board and Discord co-host access.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(null)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Connect the Trello board and role access for the session board')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addStringOption((option) =>
                    option
                        .setName('api_key')
                        .setDescription('Trello API key for the board')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('token')
                        .setDescription('Trello token for the board')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('board_id')
                        .setDescription('The Trello board ID to connect to')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('planned_list_id')
                        .setDescription('Trello list ID for planned sessions')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('ongoing_list_id')
                        .setDescription('Trello list ID for ongoing sessions')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('cancelled_list_id')
                        .setDescription('Trello list ID for cancelled sessions')
                        .setRequired(false)
                )
                .addRoleOption((option) =>
                    option
                        .setName('host_role')
                        .setDescription('Discord role allowed to host or edit the session board')
                        .setRequired(false)
                )
                .addChannelOption((option) =>
                    option
                        .setName('announcement_channel')
                        .setDescription('Channel to notify when the session board updates')
                        .setRequired(false)
                )
                .addBooleanOption((option) =>
                    option
                        .setName('announce_everyone')
                        .setDescription('Ping @everyone in the announcement channel when the board changes')
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName('cohost_roles')
                        .setDescription('Comma-separated Discord role IDs or mentions allowed to co-host')
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('update')
                .setDescription('Set a session to planned, ongoing, or cancelled on the Trello board')
                .addStringOption((option) =>
                    option
                        .setName('session_name')
                        .setDescription('Name of the Roblox session card')
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName('status')
                        .setDescription('Session status for the Trello card')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Planned', value: 'planned' },
                            { name: 'Ongoing', value: 'ongoing' },
                            { name: 'Cancelled', value: 'cancelled' },
                        )
                )
                .addStringOption((option) =>
                    option
                        .setName('notes')
                        .setDescription('Optional session notes to add to the Trello card')
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('view')
                .setDescription('View the current Trello board and role setup')
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('cards')
                .setDescription('List Trello training and shift cards from the connected board')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
            if (!deferSuccess) {
                logger.warn('Session board interaction defer failed', { guildId, userId: interaction.user.id });
                return;
            }

            const guildConfig = await getGuildConfig(interaction.client, guildId, { context: 'sessionboard' });
            const sessionBoardConfig = guildConfig.sessionBoard || {};
            const currentStatus = normalizeSessionStatus(sessionBoardConfig.defaultStatus || 'planned');

            if (subcommand === 'setup') {
                const apiKey = interaction.options.getString('api_key') || sessionBoardConfig.apiKey || process.env.TRELLO_API_KEY || null;
                const token = interaction.options.getString('token') || sessionBoardConfig.token || process.env.TRELLO_TOKEN || null;
                const boardId = interaction.options.getString('board_id') || sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID || null;
                const plannedListId = interaction.options.getString('planned_list_id') || sessionBoardConfig.plannedListId || process.env.TRELLO_PLANNED_LIST_ID || null;
                const ongoingListId = interaction.options.getString('ongoing_list_id') || sessionBoardConfig.ongoingListId || process.env.TRELLO_ONGOING_LIST_ID || null;
                const cancelledListId = interaction.options.getString('cancelled_list_id') || sessionBoardConfig.cancelledListId || process.env.TRELLO_CANCELLED_LIST_ID || null;
                const hostRole = interaction.options.getRole('host_role') || (sessionBoardConfig.hostRoleId ? interaction.guild.roles.cache.get(sessionBoardConfig.hostRoleId) : null);
                const hostRoleId = hostRole?.id || sessionBoardConfig.hostRoleId || null;
                const announcementChannel = interaction.options.getChannel('announcement_channel') || (sessionBoardConfig.announcementChannelId ? interaction.guild.channels.cache.get(sessionBoardConfig.announcementChannelId) : null);
                const announcementChannelId = announcementChannel?.id || sessionBoardConfig.announcementChannelId || null;
                const announceEveryone = interaction.options.getBoolean('announce_everyone') ?? Boolean(sessionBoardConfig.announceEveryone);
                const cohostRoleIds = interaction.options.getString('cohost_roles') || (Array.isArray(sessionBoardConfig.coHostRoleIds) ? sessionBoardConfig.coHostRoleIds.join(', ') : '');
                const parsedCoHostIds = parseRoleIds(cohostRoleIds);

                await patchGuildConfig(interaction.client, guildId, {
                    sessionBoard: {
                        ...sessionBoardConfig,
                        enabled: true,
                        apiKey,
                        token,
                        boardId,
                        plannedListId,
                        ongoingListId,
                        cancelledListId,
                        hostRoleId,
                        announcementChannelId,
                        announceEveryone,
                        coHostRoleIds: parsedCoHostIds,
                        defaultStatus: currentStatus,
                    },
                }, { context: 'sessionboard-setup' });

                const boardSummary = [
                    `API key: ${apiKey ? 'configured' : 'not configured'}`,
                    `Board: ${boardId || 'not configured'}`,
                    `Planned: ${plannedListId || 'not configured'}`,
                    `Ongoing: ${ongoingListId || 'not configured'}`,
                    `Cancelled: ${cancelledListId || 'not configured'}`,
                    `Host role: ${hostRole?.name || hostRoleId || 'not configured'}`,
                    `Announcement channel: ${announcementChannel?.name || announcementChannelId || 'not configured'}`,
                    `Ping everyone: ${announceEveryone ? 'yes' : 'no'}`,
                    `Co-host roles: ${parsedCoHostIds.length > 0 ? parsedCoHostIds.join(', ') : 'not configured'}`,
                ].join('\n');

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Session board configured',
                        description: `The Roblox session board is ready.\n\n${boardSummary}`,
                        color: 'success',
                    })],
                });
                return;
            }

            if (subcommand === 'cards') {
                const apiKey = sessionBoardConfig.apiKey || process.env.TRELLO_API_KEY;
                const token = sessionBoardConfig.token || process.env.TRELLO_TOKEN;
                const boardId = sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID;
                if (!boardId || !apiKey || !token) {
                    await InteractionHelper.safeEditReply(interaction, {
                        content: 'No Trello board or API credentials are set. Run /sessionboard setup first.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const trainingOrShiftCards = await getTrainingOrShiftCards({
                    boardId,
                    apiKey,
                    token,
                });

                if (!trainingOrShiftCards.length) {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: 'Training and shift cards',
                            description: 'No Trello cards were found for training or shifts on this board.',
                            color: 'info',
                        })],
                    });
                    return;
                }

                const cardLines = trainingOrShiftCards.slice(0, 10).map((card) => {
                    const type = card.type === 'training' ? 'Training' : 'Shift';
                    const listName = card.listName ? ` (${card.listName})` : '';
                    return `- **${type}** ${card.name}${listName} — ${card.url || 'No Trello URL'}`;
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Training and shift cards',
                        description: cardLines.join('\n'),
                        color: 'info',
                    })],
                });
                return;
            }

            if (subcommand === 'view') {
                const configSummary = sessionBoardConfig.enabled ? [
                        `API key: ${sessionBoardConfig.apiKey || process.env.TRELLO_API_KEY ? 'configured' : 'not set'}`,
                        `Board ID: ${sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID || 'not set'}`,
                        `Planned list: ${sessionBoardConfig.plannedListId || process.env.TRELLO_PLANNED_LIST_ID || 'not set'}`,
                        `Ongoing list: ${sessionBoardConfig.ongoingListId || process.env.TRELLO_ONGOING_LIST_ID || 'not set'}`,
                        `Cancelled list: ${sessionBoardConfig.cancelledListId || process.env.TRELLO_CANCELLED_LIST_ID || 'not set'}`,
                        `Host role: ${sessionBoardConfig.hostRoleId ? `<@&${sessionBoardConfig.hostRoleId}>` : 'not set'}`,
                        `Announcement channel: ${sessionBoardConfig.announcementChannelId ? `<#${sessionBoardConfig.announcementChannelId}>` : 'not set'}`,
                        `Ping everyone: ${sessionBoardConfig.announceEveryone ? 'yes' : 'no'}`,
                        `Co-host roles: ${getConfiguredRoleIds(guildConfig).length > 0 ? getConfiguredRoleIds(guildConfig).map((roleId) => `<@&${roleId}>`).join(', ') : 'not set'}`,
                    ].join('\n')
                    : 'No Trello board is connected yet. Use /sessionboard setup to connect one.';

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Session board status',
                        description: configSummary,
                        color: 'info',
                    })],
                });
                return;
            }

            if (subcommand === 'update') {
                const sessionName = interaction.options.getString('session_name', true);
                const status = normalizeSessionStatus(interaction.options.getString('status', true));
                const notes = interaction.options.getString('notes') || 'Roblox session update.';

                if (!canEditSessionBoard(interaction.member, guildConfig)) {
                    await InteractionHelper.safeEditReply(interaction, {
                        content: 'You do not have permission to edit the session board. Ask a host or co-host to update it.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const configuredListIds = {
                    planned: sessionBoardConfig.plannedListId || process.env.TRELLO_PLANNED_LIST_ID,
                    ongoing: sessionBoardConfig.ongoingListId || process.env.TRELLO_ONGOING_LIST_ID,
                    cancelled: sessionBoardConfig.cancelledListId || process.env.TRELLO_CANCELLED_LIST_ID,
                };
                const apiKey = sessionBoardConfig.apiKey || process.env.TRELLO_API_KEY;
                const token = sessionBoardConfig.token || process.env.TRELLO_TOKEN;

                const targetListId = configuredListIds[status];
                if (!targetListId) {
                    await InteractionHelper.safeEditReply(interaction, {
                        content: `The ${IDEAL_ROLE_LABELS[status]} list is not configured. Run /sessionboard setup first.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const boardId = sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID;
                if (!boardId) {
                    await InteractionHelper.safeEditReply(interaction, {
                        content: 'No Trello board ID is configured. Run /sessionboard setup first.',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const result = await syncSessionBoardCard({
                    title: sessionName,
                    status,
                    notes,
                    boardId,
                    listId: targetListId,
                    apiKey,
                    token,
                    sessionKey: `discord:${interaction.guildId}:${sessionName}`,
                    hostName: interaction.user.tag,
                    hostRoleName: interaction.member.roles.highest?.name || 'Discord member',
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: `Session marked as ${IDEAL_ROLE_LABELS[status]}`,
                        description: `Updated the Trello card for "${result.name}" to **${IDEAL_ROLE_LABELS[status]}**.\n\n${result.url}`,
                        color: status === 'cancelled' ? 'danger' : status === 'ongoing' ? 'warning' : 'success',
                    })],
                });
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: 'Choose a valid sessionboard action.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Session board command error:', error);
            try {
                await InteractionHelper.safeEditReply(interaction, {
                    content: `The session board update failed: ${error.message || 'unknown error'}`,
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send session board error reply:', replyError);
            }
        }
    },
};
