import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import {
    createLiveSessionBoard,
    fetchSessionBoardStatus,
} from '../../services/trelloSessionBoardService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sessionboard')
        .setDescription('View or configure the server Trello session board for scheduled shifts')
        .addStringOption((option) =>
            option
                .setName('board_id')
                .setDescription('Trello board ID for this server.')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('api_key')
                .setDescription('Trello API key for this server only.')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('token')
                .setDescription('Trello token for this server only. Optional if your Trello board is public.')
                .setRequired(false)
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Text channel to post the live auto-refreshing board')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option
                .setName('auto_update')
                .setDescription('Keep the board updated in the selected channel every 5 minutes')
                .setRequired(false)
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: 'Utility',

    async execute(interaction, guildConfig, client) {
        const guildId = interaction.guildId;
        const serverConfig = guildConfig || await getGuildConfig(client, guildId);
        const storedBoardId = serverConfig.sessionBoard?.boardId || null;
        const storedApiKey = serverConfig.sessionBoard?.apiKey || null;
        const storedToken = serverConfig.sessionBoard?.token || null;
        const selectedBoardId = interaction.options.getString('board_id') || storedBoardId || null;
        const selectedApiKey = interaction.options.getString('api_key') || storedApiKey || null;
        const selectedToken = interaction.options.getString('token') || storedToken || null;
        const selectedChannel = interaction.options.getChannel('channel') || interaction.channel;
        const autoUpdate = interaction.options.getBoolean('auto_update') ?? Boolean(selectedChannel && serverConfig.sessionBoard?.autoUpdate);

        await InteractionHelper.safeDefer(interaction);

        if (selectedBoardId || selectedApiKey || selectedToken) {
            const nextConfig = {
                ...serverConfig,
                sessionBoard: {
                    ...(serverConfig.sessionBoard || {}),
                    enabled: true,
                    boardId: selectedBoardId || serverConfig.sessionBoard?.boardId || null,
                    apiKey: selectedApiKey || serverConfig.sessionBoard?.apiKey || null,
                    token: selectedToken || serverConfig.sessionBoard?.token || null,
                    channelId: (selectedChannel && selectedChannel.id) || serverConfig.sessionBoard?.channelId || null,
                    autoUpdate: Boolean(autoUpdate),
                },
            };
            await setGuildConfig(client, guildId, nextConfig);
        }

        if (!selectedBoardId || !selectedApiKey) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Session board not configured for this server',
                        description: 'This board is saved per server, not globally. Use `/sessionboard api_key:YOUR_KEY board_id:YOUR_BOARD_ID` to save your Trello credentials for this server, then reopen the command. The config is stored in this server and survives restarts.',
                        color: 'warning',
                    }),
                ],
            });
            return;
        }

        try {
            const status = await fetchSessionBoardStatus({
                boardId: selectedBoardId,
                apiKey: selectedApiKey,
                token: selectedToken,
                guildConfig: {
                    sessionBoard: {
                        boardId: selectedBoardId,
                        apiKey: selectedApiKey,
                        token: selectedToken,
                        channelId: selectedChannel?.id || serverConfig.sessionBoard?.channelId || null,
                        autoUpdate: Boolean(autoUpdate),
                    },
                },
            });

            const embed = createEmbed({
                title: `📋 ${status.boardName}`,
                description: `Live Trello session data for ${status.boardName}. This server-only board refreshes every 5 minutes when auto-update is enabled.`,
                color: 'success',
                fields: status.activeCards.length > 0
                    ? status.activeCards.slice(0, 10).map((card) => {
                        const cardFields = [
                            `Type: ${card.type || 'Unknown'}`,
                            `Status: ${card.status}`,
                            `Host: ${card.host || 'Unknown'}`,
                            `Co-host: ${card.coHost || 'Not listed'}`,
                            `User ID: ${card.userId || 'Not listed'}`,
                            `Time: ${card.time || 'Not listed'}`,
                        ].join('\n');

                        return {
                            name: card.name || 'Untitled card',
                            value: `${cardFields}\n[Open card](${card.url || card.shortUrl || '#'})`,
                        };
                    })
                    : [
                        {
                            name: 'No shifts planned',
                            value: 'No shifts are planned. Check back later.',
                        },
                    ],
            });

            if (selectedChannel && autoUpdate) {
                await createLiveSessionBoard(client, {
                    guildId,
                    channelId: selectedChannel.id,
                    boardId: selectedBoardId,
                    apiKey: selectedApiKey,
                    token: selectedToken,
                    autoUpdate: true,
                    guildConfig: {
                        sessionBoard: {
                            boardId: selectedBoardId,
                            apiKey: selectedApiKey,
                            token: selectedToken,
                            channelId: selectedChannel.id,
                            autoUpdate: true,
                        },
                    },
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Live session board enabled for this server',
                            description: `The Trello board is now posting live updates every 5 minutes in ${selectedChannel}. This is saved per server and does not rely on environment variables.`,
                            color: 'success',
                        }),
                    ],
                });
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Trello board lookup failed',
                        description: `I could not load cards from this Trello board for this server. Check the Trello API key, token, and board ID.\n\n${error.message || 'Unknown Trello error'}`,
                        color: 'error',
                    }),
                ],
            });
        }
    },
};
