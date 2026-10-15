import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import {
  cacheMessageSnapshot,
  createMessageSnapshot,
  getMessageSnapshot,
  formatMessageEmbed,
} from '../services/messageSnapshotService.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      let currentMessage = newMessage;
      if (currentMessage.partial) {
        try {
          currentMessage = await currentMessage.fetch();
        } catch (error) {
          logger.warn(`Could not fetch updated message ${currentMessage.id} for audit logging:`, error);
        }
      }
      if (!currentMessage.guild) return;
      if (currentMessage.author?.bot) return;

      const cachedSnapshot = getMessageSnapshot(currentMessage.id);
      const oldSnapshot = cachedSnapshot || createMessageSnapshot(oldMessage);
      const newSnapshot = createMessageSnapshot(currentMessage);
      cacheMessageSnapshot(currentMessage);

      const contentChanged = oldSnapshot.content !== newSnapshot.content;
      const attachmentsChanged = JSON.stringify(oldSnapshot.attachments) !== JSON.stringify(newSnapshot.attachments);
      const embedsChanged = JSON.stringify(oldSnapshot.embeds) !== JSON.stringify(newSnapshot.embeds);
      if (!contentChanged && !attachmentsChanged && !embedsChanged) return;

      const metaLines = [
        formatLogLine('Channel', currentMessage.channel ? `${currentMessage.channel.name} ${currentMessage.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${currentMessage.id}\``),
        formatLogLine(
          'Message author',
          currentMessage.author
            ? `${currentMessage.author.toString()} (${currentMessage.author.tag || currentMessage.author.username || currentMessage.author.id})`
            : oldSnapshot.authorId
              ? `<@${oldSnapshot.authorId}> (${oldSnapshot.authorTag || oldSnapshot.authorId})`
              : 'Unknown',
        ),
        formatLogLine('Message created', `<t:${Math.floor(currentMessage.createdTimestamp / 1000)}:R>`),
      ];

      const oldContent = oldSnapshot.content === null
        ? '*(previous content unavailable)*'
        : oldSnapshot.content || '*(empty message)*';
      const newContent = newSnapshot.content === null
        ? '*(updated content unavailable)*'
        : newSnapshot.content || '*(empty message)*';
      const oldContentTruncated = oldContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${oldContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : oldContent;
      const newContentTruncated = newContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${newContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : newContent;

      const comparisonFields = [];
      if (contentChanged) {
        comparisonFields.push(
          { name: 'Before', value: oldContentTruncated, inline: true },
          { name: 'After', value: newContentTruncated, inline: true },
        );
      }
      if (attachmentsChanged) {
        comparisonFields.push(
          {
            name: 'Attachments before',
            value: oldSnapshot.attachments.map((attachment) => `[${attachment.name}](${attachment.url})`).join('\n') || 'None',
            inline: false,
          },
          {
            name: 'Attachments after',
            value: newSnapshot.attachments.map((attachment) => `[${attachment.name}](${attachment.url})`).join('\n') || 'None',
            inline: false,
          },
        );
      }
      if (embedsChanged) {
        comparisonFields.push(
          {
            name: 'Embeds before',
            value: oldSnapshot.embeds.map(formatMessageEmbed).join('\n\n').slice(0, 1024) || 'None',
            inline: false,
          },
          {
            name: 'Embeds after',
            value: newSnapshot.embeds.map(formatMessageEmbed).join('\n\n').slice(0, 1024) || 'None',
            inline: false,
          },
        );
      }

      await logEvent({
        client: currentMessage.client,
        guildId: currentMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          title: 'Message edited',
          lines: metaLines,
          quoted: true,
          fields: comparisonFields,
          userId: currentMessage.author?.id || oldSnapshot.authorId,
          channelId: currentMessage.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
};
