import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
<<<<<<< HEAD
import { handleInteractionError } from '../../utils/errorHandler.js';
=======
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
import { joinVoiceChannel, replyMusicSuccess } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel without starting playback'),

    async execute(interaction, config, client) {
<<<<<<< HEAD
        try {
            await deferMusicCommand(interaction);
            const embed = await joinVoiceChannel(client, interaction);
            await replyMusicSuccess(interaction, embed);
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'join' });
        }
=======
        await deferMusicCommand(interaction);
        const embed = await joinVoiceChannel(client, interaction);
        await replyMusicSuccess(interaction, embed);
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
    },
};
