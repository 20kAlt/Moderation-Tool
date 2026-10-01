import { AuditLogEvent, Events } from 'discord.js';
import { recordAntiNukeAction } from '../services/protectionService.js';
import { logger } from '../utils/logger.js';

const ACTION_LABELS = new Map([
    [AuditLogEvent.ChannelDelete, 'Channel deleted'],
    [AuditLogEvent.ChannelOverwriteCreate, 'Channel permission override created'],
    [AuditLogEvent.RoleDelete, 'Role deleted'],
    [AuditLogEvent.MemberKick, 'Member kicked'],
    [AuditLogEvent.MemberBanAdd, 'Member banned'],
    [AuditLogEvent.MemberPrune, 'Members pruned'],
    [AuditLogEvent.WebhookDelete, 'Webhook deleted'],
    [AuditLogEvent.EmojiDelete, 'Emoji deleted'],
    [AuditLogEvent.StickerDelete, 'Sticker deleted'],
]);

export default {
    name: Events.GuildAuditLogEntryCreate,
    once: false,
    async execute(entry, guild, client) {
        try {
            if (!guild || !entry?.executorId) return;

            const actionLabel = ACTION_LABELS.get(entry.action);
            if (!actionLabel) return;

            const targetName = entry.target?.name || entry.targetId || 'unknown target';
            const details = `Target: ${targetName}`;

            const triggered = await recordAntiNukeAction(
                client,
                guild,
                entry.executorId,
                actionLabel,
                details,
            );

            if (triggered) {
                logger.warn(`Anti-nuke protection triggered for ${entry.executorId} in guild ${guild.id} after ${actionLabel}.`);
            }
        } catch (error) {
            logger.error('Error processing audit log anti-nuke protection:', error);
        }
    },
};
