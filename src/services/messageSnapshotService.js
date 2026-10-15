const MAX_MESSAGE_SNAPSHOTS = 10000;
const messageSnapshots = new Map();

function createSnapshot(message) {
  return {
    content: message.partial && !message.content ? null : message.content || '',
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || message.author?.username || null,
    createdTimestamp: message.createdTimestamp || null,
    attachments: [...(message.attachments?.values?.() || [])].map((attachment) => ({
      name: attachment.name || 'Attachment',
      url: attachment.url,
    })),
    embeds: (message.embeds || []).map((embed) => (
      typeof embed.toJSON === 'function' ? embed.toJSON() : { ...embed }
    )),
  };
}

export function cacheMessageSnapshot(message) {
  if (!message?.guildId || !message.id) return;

  if (message.partial && !message.content && messageSnapshots.has(message.id)) return;

  if (!messageSnapshots.has(message.id) && messageSnapshots.size >= MAX_MESSAGE_SNAPSHOTS) {
    messageSnapshots.delete(messageSnapshots.keys().next().value);
  }

  messageSnapshots.delete(message.id);
  messageSnapshots.set(message.id, createSnapshot(message));
}

export function getMessageSnapshot(messageId) {
  return messageSnapshots.get(messageId) || null;
}

export function removeMessageSnapshot(messageId) {
  messageSnapshots.delete(messageId);
}

export function clearMessageSnapshots() {
  messageSnapshots.clear();
}

export function createMessageSnapshot(message) {
  return createSnapshot(message);
}

export function formatMessageEmbed(embed) {
  const lines = [
    embed.author?.name,
    embed.title,
    embed.description,
    ...(embed.fields || []).map((field) => `${field.name}: ${field.value}`),
    embed.url,
    embed.image?.url,
    embed.thumbnail?.url,
    embed.footer?.text,
  ].filter(Boolean);

  return lines.join('\n');
}
