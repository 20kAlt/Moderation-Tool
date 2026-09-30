import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, CheckboxBuilder, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { publishPoll } from '../../services/pollService.js';

function buildPollModal() {
    const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('For example: 60')
        .setMinLength(1)
        .setMaxLength(8)
        .setRequired(true);

    const questionInput = new TextInputBuilder()
        .setCustomId('question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('What do you want to ask?')
        .setMaxLength(256)
        .setRequired(true);

    const optionsInput = new TextInputBuilder()
        .setCustomId('options')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('One choice per line, at least two choices')
        .setMaxLength(1100)
        .setRequired(true);

    const anonymousInput = new CheckboxBuilder()
        .setCustomId('anonymous')
        .setDefault(false);

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('channel')
        .setPlaceholder('Choose where to post the poll')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText);

    return new ModalBuilder()
        .setCustomId('poll_create_modal')
        .setTitle('Create a Poll')
        .addLabelComponents(
            new LabelBuilder().setLabel('Voting duration in seconds').setDescription('Between 10 seconds and 30 days.').setTextInputComponent(durationInput),
            new LabelBuilder().setLabel('Question').setTextInputComponent(questionInput),
            new LabelBuilder().setLabel('Choices').setDescription('Enter 2 to 10 choices, one per line.').setTextInputComponent(optionsInput),
            new LabelBuilder().setLabel('Anonymous poll').setCheckboxComponent(anonymousInput),
            new LabelBuilder().setLabel('Post in').setChannelSelectMenuComponent(channelSelect),
        );
}

async function executePrefix(interaction, _guildConfig, client) {
    const args = (interaction.options._hoistedOptions || interaction._hoistedOptions || [])
        .map(option => String(option.value));
    const usage = `Usage: \`${interaction.prefix}poll <seconds> "<question>" "<choice 1>" "<choice 2>" [more choices] [--anonymous] [#channel]\`\nExample: \`${interaction.prefix}poll 60 "Best color?" "Red" "Blue" --anonymous\``;
    if (args.length < 4) {
        return InteractionHelper.safeReply(interaction, { content: usage });
    }

    const durationSeconds = Number(args.shift());
    const question = args.shift();
    const isAnonymous = args.some(argument => argument.toLowerCase() === '--anonymous');
    const remainingArgs = args.filter(argument => argument.toLowerCase() !== '--anonymous');
    const channelArgument = remainingArgs.find(argument => /^<#\d+>$/.test(argument) || /^\d{15,22}$/.test(argument));
    const channelId = channelArgument?.match(/^<#(\d+)>$/)?.[1] || channelArgument;
    const options = remainingArgs.filter(argument => argument !== channelArgument);

    if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 2592000) {
        return InteractionHelper.safeReply(interaction, {
            content: 'Poll duration must be between 10 and 2,592,000 seconds.',
        });
    }
    if (!question || question.length > 256 || options.length < 2 || options.length > 10 || options.some(option => option.length > 100)) {
        return InteractionHelper.safeReply(interaction, { content: usage });
    }

    const targetChannel = channelId
        ? await interaction.guild.channels.fetch(channelId).catch(() => null)
        : interaction.channel;
    if (!targetChannel?.isTextBased()) {
        return InteractionHelper.safeReply(interaction, {
            content: 'Choose a text channel, or omit it to post the poll here.',
        });
    }

    await InteractionHelper.safeDefer(interaction);
    await publishPoll(interaction, { question, options, isAnonymous, durationSeconds, targetChannel });
}

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a timed poll. Prefix: ?poll <seconds> "<question>" "<choice 1>" "<choice 2>" [--anonymous].')
        .setDMPermission(false),

    async execute(interaction) {
        await InteractionHelper.safeShowModal(interaction, buildPollModal());
    },

    prefixExecute: executePrefix,
};