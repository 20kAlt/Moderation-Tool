import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
} from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    createLiveSessionBoard,
    fetchSessionBoardStatus,
} from '../../services/trelloSessionBoardService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sessionboard')
        .setDescription('View the live Trello session board for scheduled shifts')
        .addStringOption((option) =>
            option
                .setName('board_id')
                .setDescription('Trello board ID. Optional if TRELLO_BOARD_ID is already set.')
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
        const selectedBoardId = interaction.options.getString('board_id') || process.env.TRELLO_BOARD_ID || null;
        const selectedChannel = interaction.options.getChannel('channel') || interaction.channel;
        const autoUpdate = interaction.options.getBoolean('auto_update') ?? Boolean(selectedChannel);

        await InteractionHelper.safeDefer(interaction);

        if (!selectedBoardId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: 'Session board not configured',
                        description: 'Set the Trello board ID with `TRELLO_BOARD_ID`, or pass a board ID with `/sessionboard board_id:...`.',
                        color: 'warning',
                    }),
                ],
            });
            return;
        }

        try {
            const status = await fetchSessionBoardStatus({
                boardId: selectedBoardId,
                apiKey: process.env.TRELLO_API_KEY,
                token: process.env.TRELLO_TOKEN,
            });

            const embed = createEmbed({
                title: `📋 ${status.boardName}`,
                description: `Live Trello session data for ${status.boardName}. Cards are refreshed every 5 minutes when auto-update is enabled.`,
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
                            name: 'No active session cards',
                            value: 'No Trello cards for shift training, promotional shift, show, canceled, planned, delayed, or ongoing were found on this board.',
                        },
                    ],
            });

            if (selectedChannel && autoUpdate) {
                await createLiveSessionBoard(client, {
                    guildId,
                    channelId: selectedChannel.id,
                    boardId: selectedBoardId,
                    apiKey: process.env.TRELLO_API_KEY,
                    token: process.env.TRELLO_TOKEN,
                    autoUpdate: true,
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Live session board enabled',
                            description: `The Trello board is now posting live updates every 5 minutes in ${selectedChannel}.`,
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
                        description: `I could not load cards from this Trello board. Check the Trello API key, token, and board ID.\n\n${error.message || 'Unknown Trello error'}`,
                        color: 'error',
                    }),
                ],
            });
        }
    },
};
