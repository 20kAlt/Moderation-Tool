import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';
import { logger } from '../../utils/logger.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query')
                .setDescription('Search by song title or artist')
                .setRequired(true)
                .setAutocomplete(true),
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const result = await playQuery(client, interaction, interaction.options.getString('query'));
        await replyMusicSuccess(interaction, result.embed);
    },

    async autocomplete(interaction, client) {
        const query = interaction.options.getFocused().trim();
        if (query.length < 2 || query.includes('://') || !client.riffy) {
            await interaction.respond([]);
            return;
        }

        try {
            const result = await client.riffy.resolve({
                query,
                requester: interaction.user,
            });
            const choices = [];
            const seen = new Set();

            for (const track of result?.tracks || []) {
                const title = track?.info?.title?.trim();
                const author = track?.info?.author?.trim();
                if (!title || !author) {
                    continue;
                }

                const value = `${title.slice(0, Math.max(1, 99 - author.length))} ${author}`.slice(0, 100);
                if (seen.has(value)) {
                    continue;
                }
                seen.add(value);
                choices.push({
                    name: `${title.slice(0, Math.max(1, 97 - author.length))} — ${author}`.slice(0, 100),
                    value,
                });

                if (choices.length === 25) {
                    break;
                }
            }

            await interaction.respond(choices);
        } catch (error) {
            logger.warn('Music search autocomplete failed', {
                guildId: interaction.guildId,
                query,
                error: error.message,
            });
            await interaction.respond([]);
        }
    },
};
