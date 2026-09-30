import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ensureGiveawayPermission, createGiveawayFromInput } from '../../../commands/Giveaway/gcreate.js';
import { botConfig } from '../../../config/bot.js';

const DEFAULT_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;

export default {
    name: 'giveaway_create_modal',
    async execute(interaction) {
        ensureGiveawayPermission(interaction);

        const durationString = interaction.fields.getTextInputValue('duration').trim();
        const prize = interaction.fields.getTextInputValue('prize').trim();
        const winnerValue = interaction.fields.getTextInputValue('winners').trim();
        const winnerCount = winnerValue ? Number(winnerValue) : DEFAULT_WINNERS;
        const channelId = interaction.fields.getField('channel')?.values?.[0];
        const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!targetChannel) {
            throw new Error('Please select a channel for the giveaway.');
        }

        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        await createGiveawayFromInput(interaction, {
            durationString,
            winnerCount,
            prize,
            targetChannel,
        });
    },
};