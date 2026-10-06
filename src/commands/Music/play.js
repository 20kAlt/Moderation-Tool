import { randomUUID } from 'node:crypto';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    playQuery,
    rankMusicTracks,
    replyMusicSuccess,
    resolveMusicSearch,
} from '../../services/music/musicActions.js';
import { ErrorTypes, ModerationToolError } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

const TRACK_SUGGESTION_PREFIX = 'music-track:';
const TRACK_SUGGESTION_TTL_MS = 10 * 60 * 1000;
const MAX_TRACK_SUGGESTIONS = 500;
const trackSuggestions = new Map();

function pruneTrackSuggestions() {
    const now = Date.now();
    for (const [token, suggestion] of trackSuggestions) {
        if (suggestion.expiresAt <= now) {
            trackSuggestions.delete(token);
        }
    }

    while (trackSuggestions.size > MAX_TRACK_SUGGESTIONS) {
        trackSuggestions.delete(trackSuggestions.keys().next().value);
    }
}

function createTrackSuggestion(track, interaction) {
    pruneTrackSuggestions();
    const token = `${TRACK_SUGGESTION_PREFIX}${randomUUID()}`;
    trackSuggestions.set(token, {
        track,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        expiresAt: Date.now() + TRACK_SUGGESTION_TTL_MS,
    });
    return token;
}

function consumeTrackSuggestion(token, interaction) {
    const suggestion = trackSuggestions.get(token);
    if (suggestion) {
        trackSuggestions.delete(token);
    }

    if (
        !suggestion
        || suggestion.expiresAt <= Date.now()
        || suggestion.userId !== interaction.user.id
        || suggestion.guildId !== interaction.guildId
    ) {
        throw new ModerationToolError(
            'Search suggestion expired',
            ErrorTypes.USER_INPUT,
            'That song suggestion expired. Search again and select a result.',
        );
    }

    return suggestion.track;
}

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

        const query = interaction.options.getString('query');
        const selectedTrack = query.startsWith(TRACK_SUGGESTION_PREFIX)
            ? consumeTrackSuggestion(query, interaction)
            : undefined;
        const result = await playQuery(client, interaction, query, { selectedTrack });
        await replyMusicSuccess(interaction, result.embed);
    },

    async autocomplete(interaction, client) {
        const query = interaction.options.getFocused().trim();
        if (query.length < 2 || query.includes('://') || !client.riffy) {
            await interaction.respond([]);
            return;
        }

        try {
            const result = await resolveMusicSearch(client, query, interaction.user);
            const choices = [];
            const seen = new Set();

            for (const track of rankMusicTracks(query, result?.tracks || [])) {
                const title = track?.info?.title?.trim();
                const author = track?.info?.author?.trim() || 'Unknown artist';
                if (!title) {
                    continue;
                }

                const key = track.info?.uri || `${title}:${author}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                choices.push({
                    name: `${title} — ${author}`.slice(0, 100),
                    value: createTrackSuggestion(track, interaction),
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
