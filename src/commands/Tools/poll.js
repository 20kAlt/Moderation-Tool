import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, CheckboxBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;

function buildPollModal(question = '', options = [], isAnonymous = false) {
    const questionInput = new TextInputBuilder()
        .setCustomId('question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('What do you want to ask?')
        .setMaxLength(256)
        .setRequired(true);

    if (question) questionInput.setValue(question.slice(0, 256));

    const optionsInput = new TextInputBuilder()
        .setCustomId('options')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('One choice per line, at least two choices')
        .setMaxLength(1100)
        .setRequired(true);

    if (options.length) optionsInput.setValue(options.join('\n').slice(0, 1100));

    const anonymousInput = new CheckboxBuilder()
        .setCustomId('anonymous')
        .setDefault(isAnonymous);

    return new ModalBuilder()
        .setCustomId('poll_create_modal')
        .setTitle('Create a Poll')
        .addLabelComponents(
            new LabelBuilder().setLabel('Question').setTextInputComponent(questionInput),
            new LabelBuilder().setLabel('Choices').setDescription('Enter 2 to 10 choices, one per line.').setTextInputComponent(optionsInput),
            new LabelBuilder().setLabel('Anonymous poll').setCheckboxComponent(anonymousInput),
        );
}

export async function publishPoll(interaction, question, options, isAnonymous) {
    let description = `**${question}**\n\n`;
    options.forEach((option, index) => {
        description += `${EMOJIS[index]} ${option}\n`;
    });

    if (isAnonymous) {
        description += '\n*This is an anonymous poll. Votes are not tracked to users.*';
    } else {
        description += '\n*React with the emoji to vote!*';
    }

    const embed = successEmbed(
        `📊 ${isAnonymous ? 'Anonymous ' : ''}Poll`,
        description
    );

    const message = await interaction.channel.send({ embeds: [embed] });

    for (let i = 0; i < options.length; i++) {
        await message.react(EMOJIS[i]);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    await InteractionHelper.safeEditReply(interaction, {
        content: '✅ Poll created successfully!',
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll with up to 10 choices using the form or modal')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The poll question')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('First option')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Second option')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Third option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Fourth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('Fifth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('Sixth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('Seventh option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('Eighth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('Ninth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('Tenth option (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Make the poll anonymous (default: false)')
                .setRequired(false)),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const isAnonymous = interaction.options.getBoolean('anonymous') || false;

        const options = [];
        for (let i = 1; i <= MAX_OPTIONS; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        if (!question || options.length < 2) {
            await InteractionHelper.safeShowModal(interaction, buildPollModal(question || '', options, isAnonymous));
            return;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        await publishPoll(interaction, question, options, isAnonymous);
    },
};