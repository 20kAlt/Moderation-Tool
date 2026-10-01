import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const raidJoinHistory = new Map();
const antiNukeActionHistory = new Map();

function getAlertChannelForGuild(guild, channelId) {
    if (!guild || !channelId) return null;
    return guild.channels.cache.get(channelId) ?? null;
}

function pruneHistory(history, windowMs) {
    const now = Date.now();
    const next = [];

    for (const entry of history) {
        if (now - entry.timestamp <= windowMs) {
            next.push(entry);
        }
    }

    return next;
}

export async function evaluateRaidProtection(client, guild, user, configOverride = null) {
    if (!guild || !user || !guild.id) return false;

    const config = configOverride || await getGuildConfig(client, guild.id);
    const protection = config?.protection || {};
    if (!protection.enabled || !protection.raid?.enabled) {
        return false;
    }

    const threshold = Number(protection.raid.joinThreshold ?? 8);
    const windowMs = Number(protection.raid.windowSeconds ?? 10) * 1000;
    const guildHistory = raidJoinHistory.get(guild.id) || [];
    const nextHistory = [...guildHistory.filter((timestamp) => Date.now() - timestamp <= windowMs), Date.now()];
    raidJoinHistory.set(guild.id, nextHistory);

    if (nextHistory.length < threshold) {
        return false;
    }

    const alertChannel = getAlertChannelForGuild(guild, protection.alertChannelId);
    if (alertChannel?.isTextBased?.()) {
        const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🚨 Raid protection triggered')
            .setDescription(`A sudden join burst was detected in **${guild.name}**.`)
            .addFields(
                { name: 'Join threshold', value: `${threshold} joins`, inline: true },
                { name: 'Window', value: `${protection.raid.windowSeconds ?? 10}s`, inline: true },
                { name: 'Alert channel', value: `<#${protection.alertChannelId}>`, inline: false },
            )
            .setTimestamp();

        await alertChannel.send({ embeds: [embed] }).catch((error) => {
            logger.warn(`Failed to send raid alert for guild ${guild.id}:`, error);
        });
    }

    return true;
}

export async function recordAntiNukeAction(client, guild, actorId, actionLabel, details = '', configOverride = null) {
    if (!guild || !guild.id || !actorId) return false;

    const config = configOverride || await getGuildConfig(client, guild.id);
    const protection = config?.protection || {};
    if (!protection.enabled || !protection.antiNuke?.enabled) {
        return false;
    }

    const trustedUserIds = new Set((protection.antiNuke?.trustedUserIds || []).filter(Boolean));
    if (trustedUserIds.has(actorId) || actorId === guild.ownerId || actorId === client.user?.id) {
        return false;
    }

    const threshold = Number(protection.antiNuke.actionThreshold ?? 3);
    const windowMs = Number(protection.antiNuke.windowSeconds ?? 10) * 1000;
    const guildHistory = antiNukeActionHistory.get(guild.id) || [];
    const nextHistory = pruneHistory(guildHistory, windowMs);
    nextHistory.push({ timestamp: Date.now(), actorId, actionLabel, details });
    antiNukeActionHistory.set(guild.id, nextHistory);

    const actorHistory = nextHistory.filter((entry) => entry.actorId === actorId);
    if (actorHistory.length < threshold) {
        return false;
    }

    const alertChannel = getAlertChannelForGuild(guild, protection.alertChannelId);
    const timeoutMinutes = Number(protection.antiNuke.timeoutMinutes ?? 30);
    let timedOut = false;
    const targetMember = await guild.members.fetch(actorId).catch(() => null);

    if (targetMember && guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        try {
            await targetMember.timeout(
                new Date(Date.now() + timeoutMinutes * 60_000),
                `Anti-nuke protection triggered: ${threshold} destructive actions within ${Math.round(windowMs / 1000)} seconds.`
            );
            timedOut = true;
        } catch (error) {
            logger.warn(`Failed to timeout suspected nuke actor ${actorId} in guild ${guild.id}:`, error);
        }
    }

    if (alertChannel?.isTextBased?.()) {
        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🛡️ Anti-nuke protection triggered')
            .setDescription(`A destructive action burst was detected involving <@${actorId}> in **${guild.name}**.`)
            .addFields(
                { name: 'Action', value: actionLabel, inline: true },
                { name: 'Triggered after', value: `${actorHistory.length} actions`, inline: true },
                { name: 'Timeout', value: timedOut ? `✅ ${timeoutMinutes} minutes` : 'Not applied (missing permission)', inline: false },
                { name: 'Details', value: details || 'No additional details provided', inline: false },
            )
            .setTimestamp();

        await alertChannel.send({ embeds: [embed] }).catch((error) => {
            logger.warn(`Failed to send anti-nuke alert for guild ${guild.id}:`, error);
        });
    }

    antiNukeActionHistory.set(
        guild.id,
        nextHistory.filter((entry) => entry.actorId !== actorId)
    );

    return true;
}
