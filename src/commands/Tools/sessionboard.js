import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { canEditSessionBoard, normalizeSessionStatus, parseRoleIds, syncSessionBoardCard } from '../../services/sessionBoardService.js';

const IDEAL_ROLE_LABELS = {
    planned: 'Planned',
    ongoing: 'Ongoing',
    cancelled: 'Cancelled',
    delayed: 'Delayed',
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
                        .setName('board_id')
                        .setDescription('The Trello board ID to connect to')
                        .setRequired(true)
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
                const boardId = interaction.options.getString('board_id') || sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID || null;
                const plannedListId = interaction.options.getString('planned_list_id') || sessionBoardConfig.plannedListId || process.env.TRELLO_PLANNED_LIST_ID || null;
                const ongoingListId = interaction.options.getString('ongoing_list_id') || sessionBoardConfig.ongoingListId || process.env.TRELLO_ONGOING_LIST_ID || null;
                const cancelledListId = interaction.options.getString('cancelled_list_id') || sessionBoardConfig.cancelledListId || process.env.TRELLO_CANCELLED_LIST_ID || null;
                const hostRole = interaction.options.getRole('host_role') || (sessionBoardConfig.hostRoleId ? interaction.guild.roles.cache.get(sessionBoardConfig.hostRoleId) : null);
                const hostRoleId = hostRole?.id || sessionBoardConfig.hostRoleId || null;
                const cohostRoleIds = interaction.options.getString('cohost_roles') || (Array.isArray(sessionBoardConfig.coHostRoleIds) ? sessionBoardConfig.coHostRoleIds.join(', ') : '');
                const parsedCoHostIds = parseRoleIds(cohostRoleIds);

                await patchGuildConfig(interaction.client, guildId, {
                    sessionBoard: {
                        ...sessionBoardConfig,
                        enabled: true,
                        boardId,
                        plannedListId,
                        ongoingListId,
                        cancelledListId,
                        hostRoleId,
                        coHostRoleIds: parsedCoHostIds,
                        defaultStatus: currentStatus,
                    },
                }, { context: 'sessionboard-setup' });

                const boardSummary = [
                    `Board: ${boardId || 'not configured'}`,
                    `Planned: ${plannedListId || 'not configured'}`,
                    `Ongoing: ${ongoingListId || 'not configured'}`,
                    `Cancelled: ${cancelledListId || 'not configured'}`,
                    `Host role: ${hostRole?.name || hostRoleId || 'not configured'}`,
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

            if (subcommand === 'view') {
                const configSummary = sessionBoardConfig.enabled
                    ? [
                        `Board ID: ${sessionBoardConfig.boardId || process.env.TRELLO_BOARD_ID || 'not set'}`,
                        `Planned list: ${sessionBoardConfig.plannedListId || process.env.TRELLO_PLANNED_LIST_ID || 'not set'}`,
                        `Ongoing list: ${sessionBoardConfig.ongoingListId || process.env.TRELLO_ONGOING_LIST_ID || 'not set'}`,
                        `Cancelled list: ${sessionBoardConfig.cancelledListId || process.env.TRELLO_CANCELLED_LIST_ID || 'not set'}`,
                        `Host role: ${sessionBoardConfig.hostRoleId ? `<@&${sessionBoardConfig.hostRoleId}>` : 'not set'}`,
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
