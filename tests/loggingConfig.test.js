import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_TYPES, getLoggingStatus, logEvent, setLogChannel } from '../src/services/loggingService.js';
import { db } from '../src/utils/database/wrapper.js';
import { getGuildConfigKey } from '../src/utils/database/keys.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';
import { ChannelType } from 'discord.js';

test('logging channel changes remain visible when using the available in-memory fallback', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();
  const client = { db };

  try {
    assert.equal(await setLogChannel(client, 'guild-one', 'audit', 'channel-one'), true);
    const status = await getLoggingStatus(client, 'guild-one');
    assert.equal(status.enabled, true);
    assert.equal(status.channels.audit, 'channel-one');
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});

test('legacy log channel settings re-enable logging after a restart without a nested logging flag', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  try {
    await db.set(getGuildConfigKey('guild-legacy'), {
      logChannelId: 'legacy-audit-channel',
      reportChannelId: 'legacy-report-channel',
    });

    const config = await getGuildConfigValueFromDb('guild-legacy');
    assert.equal(config.logging.enabled, true);
    assert.equal(config.logging.channels.audit, 'legacy-audit-channel');
    assert.equal(config.logging.channels.reports, 'legacy-report-channel');
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});

test('event logging accepts configured announcement channels', async () => {
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
    id: 'announcement-channel',
    type: ChannelType.GuildAnnouncement,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (message) => {
      sentMessages.push(message);
      return message;
    },
  };
  const guild = {
    id: 'guild-two',
    name: 'Test Guild',
    iconURL: () => null,
    members: { me: {} },
    channels: {
      cache: new Map([[channel.id, channel]]),
      fetch: async () => channel,
    },
  };
  const client = {
    db,
    guilds: { cache: new Map([[guild.id, guild]]) },
  };

  try {
    await db.set(getGuildConfigKey(guild.id), {
      logging: {
        enabled: true,
        channels: { audit: channel.id },
      },
    });

    const sent = await logEvent({
      client,
      guildId: guild.id,
      eventType: EVENT_TYPES.MESSAGE_DELETE,
    });

    assert.ok(sent);
    assert.equal(sentMessages.length, 1);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});

async function getGuildConfigValueFromDb(guildId) {
  const raw = await db.get(getGuildConfigKey(guildId));
  return (await import('../src/utils/schemas.js')).normalizeGuildConfig(raw);
}
