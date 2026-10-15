import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

import messageDelete from '../src/events/messageDelete.js';
import messageUpdate from '../src/events/messageUpdate.js';
import {
  cacheMessageSnapshot,
  clearMessageSnapshots,
} from '../src/services/messageSnapshotService.js';
import { db } from '../src/utils/database/wrapper.js';
import { getGuildConfigKey } from '../src/utils/database/keys.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

function createLoggingContext() {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  const sentMessages = [];
  const channel = {
    id: 'audit-channel',
    name: 'audit',
    type: ChannelType.GuildText,
    isTextBased: () => true,
    toString: () => '<#audit-channel>',
    permissionsFor: () => ({ has: () => true }),
    send: async (message) => {
      sentMessages.push(message);
      return message;
    },
  };
  const guild = {
    id: '12345678901234567',
    name: 'Test Guild',
    iconURL: () => null,
    channels: {
      cache: new Map([[channel.id, channel]]),
      fetch: async () => channel,
    },
    members: { me: {} },
  };
  const client = {
    db,
    guilds: { cache: new Map([[guild.id, guild]]) },
  };

  return {
    originalState,
    sentMessages,
    channel,
    guild,
    client,
    async enableLogging() {
      await db.set(getGuildConfigKey(guild.id), {
        logging: {
          enabled: true,
          channels: { audit: channel.id },
          enabledEvents: {},
        },
      });
    },
    restore() {
      clearMessageSnapshots();
      db.initialized = originalState.initialized;
      db.db = originalState.database;
      db.useFallback = originalState.useFallback;
    },
  };
}

test('deleted messages are logged with their cached content and attachments', async () => {
  const context = createLoggingContext();
  await context.enableLogging();
  const author = {
    id: '23456789012345678',
    tag: 'member#0001',
    toString: () => '<@23456789012345678>',
  };

  try {
    cacheMessageSnapshot({
      id: '34567890123456789',
      guildId: context.guild.id,
      content: 'message before deletion',
      author,
      createdTimestamp: 1700000000000,
      attachments: new Map([['file-one', { name: 'image.png', url: 'https://example.com/image.png' }]]),
      embeds: [],
    });

    await messageDelete.execute({
      id: '34567890123456789',
      partial: true,
      content: '',
      guild: context.guild,
      client: context.client,
      channel: context.channel,
      author: null,
      createdTimestamp: 1700000000000,
      attachments: new Map(),
      embeds: [],
    });

    assert.equal(context.sentMessages.length, 1);
    const description = context.sentMessages[0].embeds[0].toJSON().description;
    assert.match(description, /message before deletion/);
    assert.match(description, /image\.png/);
    assert.match(description, /member#0001/);
  } finally {
    context.restore();
  }
});

test('edited messages log before and after content and attachment changes', async () => {
  const context = createLoggingContext();
  await context.enableLogging();
  const author = {
    id: '23456789012345678',
    tag: 'member#0001',
    toString: () => '<@23456789012345678>',
  };
  const messageId = '34567890123456789';
  const createdTimestamp = 1700000000000;

  try {
    cacheMessageSnapshot({
      id: messageId,
      guildId: context.guild.id,
      content: 'before edit',
      author,
      createdTimestamp,
      attachments: new Map([['old-file', { name: 'old.png', url: 'https://example.com/old.png' }]]),
      embeds: [{ title: 'Old preview', fields: [{ name: 'Old field', value: 'Old value' }] }],
    });

    await messageUpdate.execute(
      {
        id: messageId,
        partial: true,
        content: '',
        author,
        createdTimestamp,
      },
      {
        id: messageId,
        guild: context.guild,
        client: context.client,
        channel: context.channel,
        content: 'after edit',
        author,
        createdTimestamp,
        attachments: new Map([['new-file', { name: 'new.png', url: 'https://example.com/new.png' }]]),
        embeds: [{ title: 'New preview', fields: [{ name: 'New field', value: 'New value' }] }],
      },
    );

    assert.equal(context.sentMessages.length, 1);
    const loggedEmbed = context.sentMessages[0].embeds[0].toJSON();
    const loggedContent = [
      loggedEmbed.description,
      ...loggedEmbed.fields.map(({ name, value }) => `${name}: ${value}`),
    ].join('\n');
    assert.match(loggedContent, /before edit/);
    assert.match(loggedContent, /after edit/);
    assert.match(loggedContent, /old\.png/);
    assert.match(loggedContent, /new\.png/);
    assert.match(loggedContent, /Old field: Old value/);
    assert.match(loggedContent, /New field: New value/);
  } finally {
    context.restore();
  }
});
