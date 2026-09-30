import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, ChannelSelectMenuBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationToolError, ErrorTypes } from '../../utils/errorHandler.js';
import { saveGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export function ensureGiveawayPermission(interaction) {
    if (!interaction.inGuild()) {
        throw new ModerationToolError(
            'Giveaway command used outside guild',
            ErrorTypes.VALIDATION,
            'This command can only be used in a server.',
            { userId: interaction.user.id }
        );
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        throw new ModerationToolError(
            'User lacks ManageGuild permission',
            ErrorTypes.PERMISSION,
            "You need the 'Manage Server' permission to start a giveaway.",
            { userId: interaction.user.id, guildId: interaction.guildId }
        );
    }
}

function buildGiveawayModal(duration = '', prize = '', winnerCount = null) {
    const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Examples: 30m, 1h, 5d')
        .setMinLength(2)
        .setMaxLength(10)
        .setRequired(true);
    if (duration) durationInput.setValue(duration.slice(0, 10));

    const prizeInput = new TextInputBuilder()
        .setCustomId('prize')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('What can people win?')
        .setMaxLength(256)
        .setRequired(true);
    if (prize) prizeInput.setValue(prize.slice(0, 256));

    const winnersInput = new TextInputBuilder()
        .setCustomId('winners')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Leave blank for ${GIVEAWAY_MIN_WINNERS}`)
        .setMinLength(1)
        .setMaxLength(2)
        .setRequired(false);
    if (winnerCount != null) winnersInput.setValue(String(winnerCount));

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('channel')
        .setPlaceholder('Choose where to post the giveaway')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true);

    return new ModalBuilder()
        .setCustomId('giveaway_create_modal')
        .setTitle('Create a Giveaway')
        .addLabelComponents(
            new LabelBuilder().setLabel('Duration').setDescription('Use seconds, minutes, hours, or days.').setTextInputComponent(durationInput),
            new LabelBuilder().setLabel('Prize').setTextInputComponent(prizeInput),
            new LabelBuilder().setLabel('Number of winners').setDescription(`Between ${GIVEAWAY_MIN_WINNERS} and ${GIVEAWAY_MAX_WINNERS}; optional.`).setTextInputComponent(winnersInput),
            new LabelBuilder().setLabel('Post in').setChannelSelectMenuComponent(channelSelect),
        );
}

export async function createGiveawayFromInput(interaction, { durationString, winnerCount, prize, targetChannel }) {
    logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

    const durationMs = parseDuration(durationString);
    validateWinnerCount(winnerCount);
    const prizeName = validatePrize(prize);

    if (!targetChannel?.isTextBased()) {
        throw new ModerationToolError(
            'Target channel is not text-based',
            ErrorTypes.VALIDATION,
            'The channel must be a text channel.',
            { channelId: targetChannel?.id, channelType: targetChannel?.type }
        );
    }

    const endTime = Date.now() + durationMs;
    const giveawayData = {
        messageId: 'placeholder',
        channelId: targetChannel.id,
        guildId: interaction.guildId,
        prize: prizeName,
        hostId: interaction.user.id,
        endTime,
        endsAt: endTime,
        winnerCount,
        participants: [],
        isEnded: false,
        ended: false,
        createdAt: new Date().toISOString(),
    };

    const giveawayMessage = await targetChannel.send({
        content: '🎉 **NEW GIVEAWAY** 🎉',
        embeds: [createGiveawayEmbed(giveawayData, 'active')],
        components: [createGiveawayButtons(false)],
    });

    giveawayData.messageId = giveawayMessage.id;
    const saved = await saveGiveaway(interaction.client, interaction.guildId, giveawayData);
    await giveawayMessage.edit({
        embeds: [createGiveawayEmbed(giveawayData, 'active')],
        components: [createGiveawayButtons(false)],
    });
    if (!saved) {
        logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
    }

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.GIVEAWAY_CREATE,
            data: {
                description: `Giveaway created: ${prizeName}`,
                channelId: targetChannel.id,
                userId: interaction.user.id,
                fields: [
                    { name: 'Prize', value: prizeName, inline: true },
                    { name: 'Winners', value: winnerCount.toString(), inline: true },
                    { name: 'Duration', value: durationString, inline: true },
                    { name: 'Channel', value: targetChannel.toString(), inline: true },
                ],
            },
        });
    } catch (logError) {
        logger.debug('Error logging giveaway creation event:', logError);
    }

    logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Giveaway Started! 🎉',
            `A new giveaway for **${prizeName}** has been started in ${targetChannel} and will end in **${durationString}**.`,
        )],
    });
}

async function executePrefix(interaction, _guildConfig, client) {
    ensureGiveawayPermission(interaction);

    const args = (interaction.options._hoistedOptions || interaction._hoistedOptions || [])
        .map(option => String(option.value));
    const usage = `Usage: \`${interaction.prefix}gcreate <duration> "<prize>" [winners] [#channel]\`\nExample: \`${interaction.prefix}gcreate 1h "Nitro" 1 #giveaways\``;
    if (args.length < 2) {
        return InteractionHelper.safeReply(interaction, { content: usage });
    }

    const durationString = args[0];
    const prize = args[1];
    const extraArgs = args.slice(2);
    const channelArgument = extraArgs.find(argument => /^<#\d+>$/.test(argument) || /^\d{15,22}$/.test(argument));
    const winnerArgument = extraArgs.find(argument => argument !== channelArgument && /^\d+$/.test(argument));
    const unexpectedArguments = extraArgs.filter(argument => argument !== winnerArgument && argument !== channelArgument);
    if (unexpectedArguments.length > 0) {
        return InteractionHelper.safeReply(interaction, { content: usage });
    }

    const winnerCount = winnerArgument ? Number(winnerArgument) : GIVEAWAY_MIN_WINNERS;
    const channelId = channelArgument?.match(/^<#(\d+)>$/)?.[1] || channelArgument;
    const targetChannel = channelId
        ? await interaction.guild.channels.fetch(channelId).catch(() => null)
        : interaction.channel;

    if (!targetChannel?.isTextBased()) {
        return InteractionHelper.safeReply(interaction, {
            content: 'Choose a text channel, or omit it to post the giveaway here.',
        });
    }

    await InteractionHelper.safeDefer(interaction);
    await createGiveawayFromInput(interaction, { durationString, winnerCount, prize, targetChannel });
}

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription('Create a giveaway. Prefix: ?gcreate <duration> "<prize>" [winners] [#channel].')
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "How long the giveaway should last (e.g., 1h, 30m, 5d).",
                )
                .setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription(`The number of winners to pick (default: ${GIVEAWAY_MIN_WINNERS}).`)
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("The prize being given away.")
                .setRequired(false),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The channel to send the giveaway to (defaults to current channel).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        ensureGiveawayPermission(interaction);
        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners") ?? GIVEAWAY_MIN_WINNERS;
        const prize = interaction.options.getString("prize");
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

        if (!durationString || !prize) {
            await InteractionHelper.safeShowModal(
                interaction,
                buildGiveawayModal(durationString || '', prize || '', interaction.options.getInteger('winners')),
            );
            return;
        }

        await InteractionHelper.safeDefer(interaction);
        await createGiveawayFromInput(interaction, { durationString, winnerCount, prize, targetChannel });
    },

    prefixExecute: executePrefix,
};