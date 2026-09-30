import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { publishPoll } from '../../../commands/Tools/poll.js';

export default {
    name: 'poll_create_modal',
    async execute(interaction) {
        const question = interaction.fields.getTextInputValue('question').trim();
        const options = interaction.fields
            .getTextInputValue('options')
            .split(/\r?\n/)
            .map(option => option.trim())
            .filter(Boolean);
        const isAnonymous = interaction.fields.getCheckbox('anonymous');

        if (!question || question.length > 256) {
            throw new Error('Please enter a poll question up to 256 characters.');
        }
        if (options.length < 2 || options.length > 10) {
            throw new Error('Enter between 2 and 10 choices, one per line.');
        }
        if (options.some(option => option.length > 100)) {
            throw new Error('Each choice must be 100 characters or fewer.');
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        await publishPoll(interaction, question, options, isAnonymous);
    },
};