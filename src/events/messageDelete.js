import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Cleaned up reaction role database entry for manually deleted message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                title: 'Reaction Role Removed',
                lines: [
                  formatLogLine('Channel', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Unknown'),
                  formatLogLine('Message ID', `\`${message.id}\``),
                  formatLogLine('Cleanup', 'Database entry removed automatically'),
                ],
                quoted: true,
              }
            });
          } catch (logCleanupError) {
            logger.warn('Failed to log reaction role cleanup after manual message deletion:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Failed to clean up reaction role data for deleted message ${message.id}:`, reactionRoleCleanupError);
      }

      const deletedAt = new Date();
      const metaLines = [
        formatLogLine('Channel', message.channel ? `${message.channel.name} ${message.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${message.id}\``),
        formatLogLine(
          'Message author',
          message.author
            ? `${message.author.toString()} (${message.author.tag || message.author.username || message.author.id})`
            : 'Unknown (message was not cached)',
        ),
        formatLogLine('Message created', `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`),
        formatLogLine('Deleted at', `<t:${Math.floor(deletedAt.getTime() / 1000)}:F> (<t:${Math.floor(deletedAt.getTime() / 1000)}:R>)`),
      ];

      const messageBody = (message.content || '').length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH
        ? `${message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3)}...`
        : message.content || '*(empty message)*';
      const attachments = [...(message.attachments?.values?.() || [])]
        .map((attachment) => `[${attachment.name || 'Attachment'}](${attachment.url})`)
        .join('\n');
      const embeddedLinks = (message.embeds || [])
        .map((embed) => embed.url || embed.title)
        .filter(Boolean)
        .map((urlOrTitle) => `• ${urlOrTitle}`)
        .join('\n');
      const sections = [
        { title: 'Message', body: messageBody },
        attachments ? { title: 'Attachments', body: attachments } : null,
        embeddedLinks ? { title: 'Embeds / Links', body: embeddedLinks } : null,
      ].filter(Boolean);

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          title: 'Message deleted',
          lines: metaLines,
          quoted: true,
          section: {
            title: 'Deleted message details',
            body: sections.map((section) => `**${section.title}**\n${section.body}`).join('\n\n'),
          },
          userId: message.author?.id,
          channelId: message.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};
