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

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a timed poll with anonymous voting options.')
        .setDMPermission(false),

    async execute(interaction) {
        await InteractionHelper.safeShowModal(interaction, buildPollModal());
    },
};