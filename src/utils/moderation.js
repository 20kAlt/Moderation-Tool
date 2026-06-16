// moderation.js

import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from './logger.js';
import { getFromDb, setInDb } from './database.js';
import { getColor } from '../config/bot.js';

export async function logEvent({ client, guild, guildId, event }) {
  try {
    if (!guild && guildId) {
      guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      logger.warn('logEvent invoked without valid guild or guildId');
      return;
    }
    const config = await getGuildConfig(client, guild.id);
    const loggingDisabled = config?.logging?.enabled === false || config?.enableLogging === false;
    const logChannelId = config?.logging?.channelId || config?.logChannelId;
    if (!logChannelId || loggingDisabled) {
      logger.debug(`Logging disabled or no log channel configured for guild ${guild.id}`);
      return;
    }

    const ignoredUsers = config.logIgnore?.users || [];
    if (event.metadata?.userId && ignoredUsers.includes(event.metadata.userId)) {
      return;
    }

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) {
      logger.warn(`Log channel ${logChannelId} not found in guild ${guild.id}`);
      return;
    }

    const actionStyles = {
      'Member Banned': { color: getColor('error'), icon: '🔨' },
      'Member Kicked': { color: getColor('warning'), icon: '👢' },
      'Member Timed Out': { color: getColor('warning'), icon: '⏳' },
      'Member Untimeouted': { color: getColor('success'), icon: '✅' },
      'User Warned': { color: getColor('warning'), icon: '⚠️' },
      'Warnings Viewed': { color: getColor('info'), icon: '👁️' },
      'Messages Purged': { color: getColor('moderation'), icon: '🗑️' },
      'Channel Locked': { color: getColor('moderation'), icon: '🔒' },
      'Channel Unlocked': { color: getColor('success'), icon: '🔓' },
      'Case Created': { color: getColor('info'), icon: '📋' },
      'Case Updated': { color: getColor('moderation'), icon: '📝' },
      'DM Sent': { color: getColor('info'), icon: '✉️' },
      'Log Channel Activated': { color: getColor('success'), icon: '📝' }
    };

    const style = actionStyles[event.action] || { color: getColor('primary'), icon: '🔨' };

    const targetIdMatch = event.target?.match(/\((\d+)\)/);
    const targetId = targetIdMatch?.[1];
    const executorIdMatch = event.executor?.match(/\((\d+)\)/);
    const executorId = executorIdMatch?.[1];

    const lines = [];
    if (event.target) {
      lines.push(`**User:** ${event.target}`);
    }
    if (targetId) {
      lines.push(`**ID:** \`${targetId}\``);
    }
    if (event.reason) {
      const reason = event.reason.length > 900
        ? `${event.reason.substring(0, 897)}...`
        : event.reason;
      lines.push(`**Reason:** ${reason}`);
    }
    if (event.duration) {
      lines.push(`**Duration:** ${event.duration}`);
    }
    if (event.caseId) {
      lines.push(`**Case:** \`${event.caseId}\``);
    }

    const meta = [];
    if (event.metadata) {
      Object.entries(event.metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          meta.push([key.charAt(0).toUpperCase() + key.slice(1), String(value)]);
        }
      });
    }

    const description = [
      lines.join('\n'),
      meta.length ? meta.map(([k, v]) => `**${k}:** ${v}`).join(' • ') : '',
    ].filter(Boolean).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(event.color || style.color)
      .setTitle(`${style.icon} ${event.action}${event.caseId ? ` \`${event.caseId}\`` : ''}`)
      .setDescription(description.slice(0, 4096))
      .setTimestamp();

    if (executorId) {
      embed.setFooter({
        text: event.executor?.split(' (')[0] || 'Moderator',
        iconURL: guild.iconURL({ dynamic: true }) || undefined,
      });
    }

    if (targetId) {
      embed.setThumbnail(`https://cdn.discordapp.com/embed/avatars/${Number(targetId) % 5}.png`);
    }

    await logChannel.send({ embeds: [embed] });
    
    logger.info(`Moderation action logged: ${event.action} by ${event.executor} on ${event.target} in guild ${guild.id}`);
    
  } catch (error) {
    logger.error("Error logging moderation event:", error);
  }
}

export async function generateCaseId(client, guildId) {
  try {
    const caseKey = `moderation_cases_${guildId}`;
    const currentCase = await getFromDb(caseKey, 0);
    const nextCase = currentCase + 1;
    await setInDb(caseKey, nextCase);
    return nextCase;
  } catch (error) {
    logger.error("Error generating case ID:", error);
return Date.now();
  }
}

export async function storeModerationCase({ guildId, caseId, caseData }) {
  try {
    const caseKey = `moderation_case_${guildId}_${caseId}`;
    const caseDataWithTimestamp = {
      ...caseData,
      createdAt: new Date().toISOString(),
      caseId
    };
    
    await setInDb(caseKey, caseDataWithTimestamp);
    
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    caseList.push(caseDataWithTimestamp);
    
    if (caseList.length > 1000) {
      caseList.splice(0, caseList.length - 1000);
    }
    
    await setInDb(caseListKey, caseList);
    return true;
  } catch (error) {
    logger.error("Error storing moderation case:", error);
    return false;
  }
}

export async function getModerationCases(guildId, filters = {}) {
  try {
    const { userId, moderatorId, action, limit = 50, offset = 0 } = filters;
    
    const allCases = [];
    
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    
    let filteredCases = caseList;
    
    if (userId) {
      filteredCases = filteredCases.filter(case_ => case_.targetUserId === userId);
    }
    
    if (moderatorId) {
      filteredCases = filteredCases.filter(case_ => case_.moderatorId === moderatorId);
    }
    
    if (action) {
      filteredCases = filteredCases.filter(case_ => case_.action === action);
    }
    
    filteredCases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return filteredCases.slice(offset, offset + limit);
  } catch (error) {
    logger.error("Error getting moderation cases:", error);
    return [];
  }
}

export async function logModerationAction({ client, guild, event }) {
  const caseId = await generateCaseId(client, guild.id);
  
  await storeModerationCase({
    guildId: guild.id,
    caseId,
    caseData: {
      action: event.action,
      target: event.target,
      executor: event.executor,
      reason: event.reason,
      duration: event.duration,
      metadata: event.metadata,
      targetUserId: event.metadata?.userId,
      moderatorId: event.metadata?.moderatorId
    }
  });
  
  await logEvent({
    client,
    guild,
    event: {
      ...event,
      caseId
    }
  });
  
  return caseId;
}