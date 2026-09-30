import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { Mutex } from '../utils/mutex.js';
import { unwrapReplitData } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

const MAX_TIMEOUT_MS = 2147000000;
const OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const pollTimers = new Map();

function pollStorageKey(guildId) {
    return `guild:${guildId}:polls`;
}

async function getGuildPolls(client, guildId) {
    const stored = unwrapReplitData(await client.db.get(pollStorageKey(guildId), {}));
    if (Array.isArray(stored)) {
        return Object.fromEntries(stored.filter(poll => poll?.messageId).map(poll => [poll.messageId, poll]));
    }
    return stored && typeof stored === 'object' ? stored : {};
}

async function savePoll(client, poll) {
    const polls = await getGuildPolls(client, poll.guildId);
    polls[poll.messageId] = poll;
    await client.db.set(pollStorageKey(poll.guildId), polls);
}

async function getPoll(client, guildId, messageId) {
    const polls = await getGuildPolls(client, guildId);
    return polls[messageId] || null;
}

function getVoteCounts(poll) {
    return poll.options.map((_, index) =>
        Object.values(poll.votes || {}).filter(vote => vote === index).length,
    );
}

export function createPollEmbed(poll) {
    const counts = getVoteCounts(poll);
    const description = poll.options
        .map((option, index) => `${OPTION_EMOJIS[index]} **${option}**  ·  ${counts[index]} vote${counts[index] === 1 ? '' : 's'}`)
        .join('\n');
    const totalVotes = counts.reduce((total, count) => total + count, 0);
    const embed = new EmbedBuilder()
        .setColor(0x278a75)
        .setTitle(poll.isAnonymous ? '📊 Anonymous Poll' : '📊 Poll')
        .setDescription(`**${poll.question}**\n\n${description}`)
        .addFields(
            { name: 'Poll ID', value: poll.messageId, inline: true },
            { name: 'Votes', value: String(totalVotes), inline: true },
            { name: poll.ended ? 'Status' : 'Time left', value: poll.ended ? 'Voting closed' : `<t:${Math.floor(poll.endsAt / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: poll.isAnonymous ? 'Votes are not linked to public usernames.' : 'You can change your vote before the poll closes.' })
        .setTimestamp();
    return embed;
}

export function createPollButtons(poll) {
    const rows = [];
    for (let offset = 0; offset < poll.options.length; offset += 5) {
        const row = new ActionRowBuilder().addComponents(
            poll.options.slice(offset, offset + 5).map((option, index) => new ButtonBuilder()
                .setCustomId(`poll_vote:${poll.messageId}:${offset + index}`)
                .setLabel(`${OPTION_EMOJIS[offset + index]} ${option}`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(poll.ended)),
        );
        rows.push(row);
    }
    return rows;
}

async function finalizePoll(client, poll) {
    if (poll.ended) return;
    const timerKey = `${poll.guildId}:${poll.messageId}`;
    clearTimeout(pollTimers.get(timerKey));
    pollTimers.delete(timerKey);
    poll.ended = true;
    await savePoll(client, poll);

    const guild = client.guilds.cache.get(poll.guildId);
    const channel = await guild?.channels.fetch(poll.channelId).catch(() => null);
    const message = await channel?.messages.fetch(poll.messageId).catch(() => null);
    if (message) {
        await message.edit({ embeds: [createPollEmbed(poll)], components: createPollButtons(poll) });
    }
}

export function schedulePollEnd(client, poll) {
    const timerKey = `${poll.guildId}:${poll.messageId}`;
    clearTimeout(pollTimers.get(timerKey));
    const delay = Math.min(Math.max(0, poll.endsAt - Date.now()), MAX_TIMEOUT_MS);
    const timer = setTimeout(async () => {
        try {
            await Mutex.runExclusive(`poll:${timerKey}`, async () => {
                const currentPoll = await getPoll(client, poll.guildId, poll.messageId);
                if (!currentPoll || currentPoll.ended) {
                    pollTimers.delete(timerKey);
                } else if (currentPoll.endsAt > Date.now()) {
                    schedulePollEnd(client, currentPoll);
                } else {
                    await finalizePoll(client, currentPoll);
                }
            }
            );
        } catch (error) {
            logger.error(`Failed to close poll ${poll.messageId}:`, error);
            schedulePollEnd(client, { ...poll, endsAt: Date.now() + 30000 });
        }
    }, delay);
    timer.unref?.();
    pollTimers.set(timerKey, timer);
}

export async function resumePolls(client) {
    if (!client.db) return;
    for (const guild of client.guilds.cache.values()) {
        const polls = await getGuildPolls(client, guild.id).catch(error => {
            logger.error(`Failed to load polls for guild ${guild.id}:`, error);
            return {};
        });
        for (const poll of Object.values(polls)) {
            if (!poll.ended) schedulePollEnd(client, poll);
        }
    }
}

export async function publishPoll(interaction, { question, options, isAnonymous, durationSeconds, targetChannel }) {
    const endsAt = Date.now() + durationSeconds * 1000;
    const poll = {
        messageId: 'pending',
        guildId: interaction.guildId,
        channelId: targetChannel.id,
        question,
        options,
        isAnonymous,
        endsAt,
        votes: {},
        ended: false,
        createdAt: new Date().toISOString(),
    };
    const message = await targetChannel.send({ embeds: [createPollEmbed(poll)] });
    poll.messageId = message.id;
    await message.edit({ embeds: [createPollEmbed(poll)], components: createPollButtons(poll) });
    await savePoll(interaction.client, poll);
    schedulePollEnd(interaction.client, poll);
    await InteractionHelper.safeEditReply(interaction, { content: `Poll created in ${targetChannel}. ID: ${message.id}` });
}

export async function handlePollVote(interaction, client) {
    const [, messageId, optionValue] = interaction.customId.split(':');
    const optionIndex = Number(optionValue);
    const timerKey = `${interaction.guildId}:${messageId}`;
    if (!(await InteractionHelper.safeDefer(interaction))) return;

    await Mutex.runExclusive(`poll:${timerKey}`, async () => {
        const poll = await getPoll(client, interaction.guildId, messageId);
        if (!poll || poll.messageId !== interaction.message.id) {
            return InteractionHelper.safeEditReply(interaction, { content: 'This poll is no longer available.' });
        }
        if (poll.ended || Date.now() >= poll.endsAt) {
            await finalizePoll(client, poll);
            return InteractionHelper.safeEditReply(interaction, { content: 'Voting for this poll has closed.' });
        }
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
            return InteractionHelper.safeEditReply(interaction, { content: 'That poll choice is invalid.' });
        }

        poll.votes[interaction.user.id] = optionIndex;
        await savePoll(client, poll);
        await interaction.message.edit({ embeds: [createPollEmbed(poll)], components: createPollButtons(poll) });
        await InteractionHelper.safeEditReply(interaction, {
            content: `Your vote for **${poll.options[optionIndex]}** has been recorded${poll.isAnonymous ? ' anonymously' : ''}.`,
        });
    });
}