import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
<<<<<<< HEAD
import { handleInteractionError } from '../../utils/errorHandler.js';
=======
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song name or URL').setRequired(true),
        ),

    async execute(interaction, config, client) {
<<<<<<< HEAD
        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            const result = await playQuery(client, interaction, interaction.options.getString('query'));
            await replyMusicSuccess(interaction, result.embed);
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'play' });
        }
=======
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const result = await playQuery(client, interaction, interaction.options.getString('query'));
        await replyMusicSuccess(interaction, result.embed);
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
    },
};
