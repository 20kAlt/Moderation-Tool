import { once } from 'node:events';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { ModerationToolError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';
import {
    buildNowPlayingEmbed,
    buildQueueEmbed,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const PLAYER_CONNECT_TIMEOUT_MS = 12_000;

function getConnectedLavalinkNodes(client) {
    if (!client.riffy?.nodeMap) {
        return [];
    }

    return [...client.riffy.nodeMap.values()].filter((node) => node.connected);
}

export function assertLavalinkNodeAvailable(client) {
    if (!getConnectedLavalinkNodes(client).length) {
        throw new ModerationToolError(
            'Lavalink unavailable',
            ErrorTypes.CONFIGURATION,
            'Music is temporarily unavailable — no Lavalink nodes are connected. Try again shortly or configure your own Lavalink server.',
        );
    }
}

function assertBotVoicePermissions(channel) {
    if (!channel) {
        throw new ModerationToolError(
            'Voice channel unavailable',
            ErrorTypes.CONFIGURATION,
            'Could not access that voice channel.',
        );
    }

    if (!botHasPermission(channel, [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
        throw new ModerationToolError(
            'Missing voice permissions',
            ErrorTypes.PERMISSION,
            'I need **Connect** and **Speak** permissions in your voice channel.',
        );
    }
}

async function waitForPlayerConnection(player) {
    if (player.connected) {
        return;
    }

    try {
        await player.connection.resolve();
    } catch {
        // Fall through to event-based wait below.
    }

    if (player.connected) {
        return;
    }

    try {
        await once(player, 'connectionRestored', {
            signal: AbortSignal.timeout(PLAYER_CONNECT_TIMEOUT_MS),
        });
    } catch {
        // Timed out waiting for Lavalink to confirm the voice session.
    }

    if (!player.connected) {
        throw new ModerationToolError(
            'Voice connection failed',
            ErrorTypes.CONFIGURATION,
            'Could not connect to the voice channel. Ensure Lavalink is online, the bot has Connect and Speak permissions, then try again.',
        );
    }
}

async function startPlayback(player) {
    await waitForPlayerConnection(player);
    await player.play();
}

export function getPlayer(client, guildId) {
    return client.riffy?.players?.get(guildId) || null;
}

export function assertRiffyAvailable(client) {
    if (!client.riffy) {
        throw new ModerationToolError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Music is unavailable — Lavalink is not configured.',
        );
    }
}

export function assertInVoice(member) {
    if (!requireVoiceChannel(member)) {
        throw new ModerationToolError(
            'Not in voice channel',
            ErrorTypes.USER_INPUT,
            'You need to be in a voice channel.',
        );
    }
}

export function assertCanControl(member, player) {
    if (!canControlMusic(member, player)) {
        throw new ModerationToolError(
            'Wrong voice channel',
            ErrorTypes.PERMISSION,
            VOICE_CHANNEL_DENIAL,
        );
    }
}

export async function resolveMusicSearch(client, query, requester) {
    if (/^https?:\/\//i.test(query)) {
        return client.riffy.resolve({ query, requester });
    }

    const sources = [...new Set([
        'ytsearch',
        'ytmsearch',
        'scsearch',
        client.riffy.defaultSearchPlatform,
    ].filter(Boolean))];
    let lastResult = null;
    const results = await Promise.all(sources.map(async (source) => {
        try {
            const result = await client.riffy.resolve({ query, source, requester });
            if (result) {
                lastResult = result;
            }
            return result;
        } catch (error) {
            return { error };
        }
    }));

    const successfulResults = results.filter((result) => result && !result.error);
    const tracks = successfulResults.flatMap((result) => result.tracks || []);
    if (tracks.length) {
        const seen = new Set();
        const uniqueTracks = tracks.filter((track) => {
            const key = track?.info?.uri || `${track?.info?.title || ''}:${track?.info?.author || ''}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        return {
            loadType: 'search',
            tracks: uniqueTracks,
            playlistInfo: null,
        };
    }

    if (successfulResults.length === 0) {
        const error = results.find((result) => result?.error)?.error;
        if (error) {
            throw error;
        }
    }

    return lastResult || { loadType: 'empty', tracks: [] };
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLocaleLowerCase()
        .replace(/\b(feat(?:uring)?|official|audio|video|lyrics?)\b/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

export function rankMusicTracks(query, tracks) {
    const normalizedQuery = normalizeSearchText(query);
    const queryWords = [...new Set(normalizedQuery.split(' ').filter(Boolean))];
    if (!queryWords.length) {
        return tracks;
    }

    return tracks
        .map((track, index) => {
            const title = normalizeSearchText(track?.info?.title);
            const author = normalizeSearchText(track?.info?.author);
            const combined = `${title} ${author}`.trim();
            const combinedWords = new Set(combined.split(' '));
            const titleWords = new Set(title.split(' '));
            const authorWords = new Set(author.split(' '));
            const matchedWords = queryWords.filter((word) => combinedWords.has(word)).length;
            const titleMatches = queryWords.filter((word) => titleWords.has(word)).length;
            const authorMatches = queryWords.filter((word) => authorWords.has(word)).length;
            const score = (matchedWords / queryWords.length) * 5
                + (titleMatches / queryWords.length) * 2
                + (authorMatches / queryWords.length) * 2
                + (combined === normalizedQuery ? 5 : 0)
                + (title === normalizedQuery || author === normalizedQuery ? 3 : 0);
            return { track, index, score };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(({ track }) => track);
}

export async function ensurePlayer(client, interaction) {
    assertRiffyAvailable(client);
    assertLavalinkNodeAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: interaction.member.voice.channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

function isDuplicateTrack(player, track) {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing.info?.uri === uri);
}

export async function joinVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    const channel = interaction.member.voice.channel;
    assertBotVoicePermissions(channel);
    let player = getPlayer(client, guildId);

    if (player && player.voiceChannel !== channel.id) {
        try {
            player.destroy();
        } catch {
            // player may already be gone
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: channel.id,
            textChannel: interaction.channel.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel.id;
    }

    player.setVolume(guildData.volume);

    return successEmbed(
        'Joined Voice Channel',
        `Connected to **${channel.name}**. Use /play to start music and the player buttons for playback controls.`,
    );
}

export async function playQuery(client, interaction, query, { selectedTrack } = {}) {
    const { player, guildData } = await ensurePlayer(client, interaction);

    const result = selectedTrack
        ? { loadType: 'track', tracks: [selectedTrack] }
        : await resolveMusicSearch(client, query, interaction.user);

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_LOADED') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.info.requester = interaction.user;
            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }
            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.paused) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                'Playlist Added',
                `**${playlistInfo?.name || 'Playlist'}**\nAdded ${added} of ${tracks.length} track(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_LOADED'
    ) {
        const track = selectedTrack || rankMusicTracks(query, tracks || [])[0];
        if (!track) {
            throw new ModerationToolError('No results', ErrorTypes.USER_INPUT, 'No results found for that query.');
        }

        if (isDuplicateTrack(player, track)) {
            throw new ModerationToolError(
                'Duplicate track',
                ErrorTypes.USER_INPUT,
                `**${track.info.title}** is already in the queue or playing.`,
            );
        }

        track.info.requester = interaction.user;

        const willPlayNow = !player.playing && !player.paused;
        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                willPlayNow ? 'Now Playing' : 'Track Added',
                willPlayNow
                    ? `**${track.info.title}**\n${track.info.author}`
                    : `**${track.info.title}**\n${track.info.author}\nPosition: #${queuePosition} in queue`,
            ),
        };
    }

    throw new ModerationToolError('No results', ErrorTypes.USER_INPUT, `No results found. (loadType: ${loadType})`);
}

export async function skipTrack(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);
    const title = player.current.info?.title || 'Unknown';
    // Under track-loop, stop() would replay the same track. Clear it so the skip
    // advances; trackStart re-applies the stored loop mode to the next track.
    if (player.loop === 'track') {
        player.setLoop('none');
    }
    player.stop();
    return successEmbed('Skipped', `Skipped **${title}**.`);
}

export async function applyPause(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || player.paused) {
        return false;
    }

    await setPlaybackPaused(player, true);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function applyResume(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || !player.paused) {
        return false;
    }

    await setPlaybackPaused(player, false);
    await refreshPlayerMessage(client, guildId);
    return true;
}

async function setPlaybackPaused(player, paused) {
    const updatePlayer = player.node?.rest?.updatePlayer;
    if (typeof updatePlayer !== 'function') {
        throw new ModerationToolError(
            'Music control unavailable',
            ErrorTypes.CONFIGURATION,
            'The music connection is unavailable. Please try again after the player reconnects.',
        );
    }

    await updatePlayer.call(player.node.rest, {
        guildId: player.guildId,
        data: { paused },
    });

    player.paused = paused;
    player.playing = !paused && Boolean(player.current);
}

export async function pausePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    if (player.paused) {
        throw new ModerationToolError('Already paused', ErrorTypes.USER_INPUT, 'Playback is already paused.');
    }

    await applyPause(client, interaction.guild.id);
    return successEmbed('Paused', 'Playback paused.');
}

export async function resumePlayback(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    if (!player.paused) {
        throw new ModerationToolError('Not paused', ErrorTypes.USER_INPUT, 'Playback is not paused.');
    }

    await applyResume(client, interaction.guild.id);
    return successEmbed('Resumed', 'Playback resumed.');
}

export async function shuffleQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new ModerationToolError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);
    player.queue.shuffle();
    getGuildMusicData(interaction.guild.id).shuffle = true;
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Shuffled', 'The queue has been shuffled.');
}

export async function setLoopMode(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.loop = mode;
    player.setLoop(mode);

    const labels = { none: 'Off', track: 'Track', queue: 'Queue' };
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Loop Updated', `Loop mode set to **${labels[mode] || mode}**.`);
}

export async function toggleLoop(client, interaction) {
    const guildData = getGuildMusicData(interaction.guild.id);
    const next = guildData.loop === 'none' ? 'track' : guildData.loop === 'track' ? 'queue' : 'none';
    return setLoopMode(client, interaction, next);
}

export async function setVolume(client, interaction, volume) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.member, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.volume = Math.max(0, Math.min(100, volume));
    player.setVolume(guildData.volume);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Volume Updated', `Volume set to **${guildData.volume}%**.`);
}

export async function adjustVolume(client, interaction, delta) {
    const guildData = getGuildMusicData(interaction.guild.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

export async function seekTrack(client, interaction, seconds) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.member, player);

    const info = player.current.info || {};
    if (info.isStream || info.isSeekable === false) {
        throw new ModerationToolError(
            'Not seekable',
            ErrorTypes.USER_INPUT,
            'This track cannot be seeked (it may be a live stream).',
        );
    }

    const position = Math.max(0, seconds * 1000);
    if (info.length && position > info.length) {
        throw new ModerationToolError(
            'Seek out of range',
            ErrorTypes.USER_INPUT,
            `You can only seek up to ${Math.floor(info.length / 1000)}s for this track.`,
        );
    }

    player.seek(position);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Seeked', `Seeked to **${seconds}s**.`);
}

export async function removeFromQueue(client, interaction, index) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new ModerationToolError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);

    const queueIndex = index - 1;
    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new ModerationToolError('Invalid index', ErrorTypes.USER_INPUT, `Invalid queue position. Queue has ${player.queue.length} track(s).`);
    }

    const removed = player.queue[queueIndex];
    player.queue.remove(queueIndex);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Removed', `Removed **${removed.info?.title || 'track'}** from the queue.`);
}

export async function moveInQueue(client, interaction, from, to) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new ModerationToolError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.member, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
        throw new ModerationToolError('Invalid index', ErrorTypes.USER_INPUT, 'Invalid queue positions.');
    }

    const track = player.queue[fromIndex];
    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Moved', `Moved **${track.info?.title || 'track'}** to position #${to}.`);
}

export async function clearQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new ModerationToolError('Empty queue', ErrorTypes.USER_INPUT, 'The queue is already empty.');
    }
    assertCanControl(interaction.member, player);
    player.queue.clear();
    await refreshPlayerMessage(client, interaction.guild.id);
    return successEmbed('Queue Cleared', 'All queued tracks were removed.');
}

export async function setTwentyFourSeven(client, interaction, enabled) {
    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.twentyFourSeven = enabled;
    return successEmbed(
        '24/7 Mode',
        enabled
            ? '24/7 mode enabled. The bot will stay in the voice channel when the queue ends.'
            : '24/7 mode disabled. The bot will leave after 30 seconds of idle time.',
    );
}

export function buildNowPlayingReply(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    const guildData = getGuildMusicData(guildId);
    return {
        embeds: [buildNowPlayingEmbed(player.current, player, guildData)],
    };
}

export function buildQueueReply(client, guildId, page = 0) {
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'No active music player.');
    }

    const totalPages = Math.max(1, Math.ceil((player.queue?.length || 0) / getQueuePageSize()));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);

    return {
        embeds: [buildQueueEmbed(player.queue, player.current, safePage)],
        components: totalPages > 1 ? [buildQueuePaginationRow(safePage, totalPages)] : [],
        page: safePage,
        totalPages,
    };
}

export async function destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect = false } = {}) {
    clearUpdateInterval(guildData);
    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    guildData.previousTracks = [];
    guildData.autoPaused = false;
    guildData.queuePages?.clear();

    if (guildData.playerMessageId && guildData.playerChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                const msg = await channel.messages.fetch(guildData.playerMessageId);
                await msg.delete();
            }
        } catch {
            // message already deleted
        }
    }

    guildData.playerMessageId = null;
    guildData.playerChannelId = null;

    if (player) {
        player.queue.clear();
        player.stop();
        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }
}

export async function leaveVoiceChannel(client, interaction) {
    assertRiffyAvailable(client);

    const guildId = interaction.guild.id;
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new ModerationToolError('No player', ErrorTypes.USER_INPUT, 'I am not in a voice channel.');
    }
    assertCanControl(interaction.member, player);

    const channel = interaction.guild.channels.cache.get(player.voiceChannel);
    const channelName = channel?.name || 'voice channel';
    const guildData = getGuildMusicData(guildId);

    await destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect: true });

    return successEmbed('Left Voice Channel', `Disconnected from **${channelName}**.`);
}

export async function replyMusicSuccess(interaction, embed) {
    const options = { embeds: [embed] };
    if (!interaction._isPrefixCommand) {
        options.flags = MessageFlags.Ephemeral;
    }
    await InteractionHelper.safeReply(interaction, options);
}
