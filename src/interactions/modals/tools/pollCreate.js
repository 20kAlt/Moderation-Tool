import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { publishPoll } from '../../../services/pollService.js';

export default {
    name: 'poll_create_modal',
    async execute(interaction) {
        const question = interaction.fields.getTextInputValue('question').trim();
        const durationSeconds = Number(interaction.fields.getTextInputValue('duration').trim());
        const options = interaction.fields
            .getTextInputValue('options')
            .split(/\r?\n/)
            .map(option => option.trim())
            .filter(Boolean);
        const isAnonymous = interaction.fields.getCheckbox('anonymous');
        const channelId = interaction.fields.getField('channel')?.values?.[0];
        const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!question || question.length > 256) {
            throw new Error('Please enter a poll question up to 256 characters.');
        }
        if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 2592000) {
            throw new Error('Voting duration must be between 10 and 2,592,000 seconds.');
        }
        if (options.length < 2 || options.length > 10) {
            throw new Error('Enter between 2 and 10 choices, one per line.');
        }
        if (options.some(option => option.length > 100)) {
            throw new Error('Each choice must be 100 characters or fewer.');
        }
        if (!targetChannel?.isTextBased()) {
            throw new Error('Please select a text channel for the poll.');
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        await publishPoll(interaction, { question, options, isAnonymous, durationSeconds, targetChannel });
    },
};