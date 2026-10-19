import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

import announcementsCommand from '../src/commands/Core/announcements.js';
import { getGuildConfig } from '../src/services/config/guildConfig.js';
import { db } from '../src/utils/database/wrapper.js';
import { getGuildConfigKey } from '../src/utils/database/keys.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import { supportsPrefixExecution } from '../src/utils/messageAdapter.js';

function useMemoryDatabase() {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();
  return () => {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  };
}

function createInteraction({ channel = null, isAdmin = true, prefix = false } = {}) {
  const replies = [];
  const guild = {
    id: 'test-guild',
    ownerId: 'server-owner',
    members: { me: {} },
    channels: {
      cache: channel ? new Map([[channel.id, channel]]) : new Map(),
      fetch: async (id) => id === channel?.id ? channel : null,
    },
  };
  const interaction = {
    id: 'announcement-config-interaction',
    createdTimestamp: Date.now(),
    guildId: guild.id,
    guild,
    user: { id: isAdmin ? 'server-admin' : 'regular-user' },
    memberPermissions: {
      has: (permission) => isAdmin && permission === PermissionFlagsBits.ManageGuild,
    },
    _isPrefixCommand: prefix,
    options: {
      getChannel: () => channel,
      getString: (name) => name === 'channel' && prefix ? (channel ? `<#${channel.id}>` : null) : null,
      getBoolean: () => false,
    },
    replied: false,
    deferred: false,
    async deferReply() {
      this.deferred = true;
    },
    async reply(payload) {
      replies.push(payload);
      this.replied = true;
    },
    async editReply(payload) {
      replies.push(payload);
    },
    async followUp(payload) {
      replies.push(payload);
    },
  };
  return { interaction, replies, guild };
}

test('server announcement subscriptions default to disabled', async () => {
  const restoreDatabase = useMemoryDatabase();
  try {
    const config = await getGuildConfig({ db }, 'test-guild');
    assert.deepEqual(config.announcements, {
      enabled: false,
      channelId: null,
    });
  } finally {
    restoreDatabase();
  }
});

test('server owner can configure an announcement channel', async () => {
  const restoreDatabase = useMemoryDatabase();
  const channel = {
    id: 'announcements',
    guildId: 'test-guild',
    type: ChannelType.GuildText,
    toString: () => '<#announcements>',
    permissionsFor: () => ({ has: () => true }),
  };
  const { interaction, replies, guild } = createInteraction({ channel, isAdmin: false });
  interaction.user.id = guild.ownerId;

  try {
    await announcementsCommand.execute(interaction, null, { db });

    const config = await db.get(getGuildConfigKey('test-guild'), null);
    assert.deepEqual(config.announcements, {
      enabled: true,
      channelId: 'announcements',
    });
    assert.match(replies.at(-1).content, /enabled in <#announcements>/);
  } finally {
    restoreDatabase();
  }
});

test('server admin can disable announcement delivery', async () => {
  const restoreDatabase = useMemoryDatabase();
  await db.set(getGuildConfigKey('test-guild'), {
    announcements: { enabled: true, channelId: 'announcements' },
  });
  const replies = [];
  const interaction = {
    id: 'announcement-config-interaction',
    createdTimestamp: Date.now(),
    guildId: 'test-guild',
    guild: { id: 'test-guild', ownerId: 'server-owner', members: { me: {} } },
    user: { id: 'server-admin' },
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    options: {
      getChannel: () => null,
      getString: () => null,
      getBoolean: () => true,
    },
    replied: false,
    deferred: false,
    async deferReply() {
      this.deferred = true;
    },
    async reply(payload) {
      replies.push(payload);
      this.replied = true;
    },
    async editReply(payload) {
      replies.push(payload);
    },
    async followUp(payload) {
      replies.push(payload);
    },
  };

  try {
    await announcementsCommand.execute(interaction, null, { db });

    assert.deepEqual((await getGuildConfig({ db }, 'test-guild')).announcements, {
      enabled: false,
      channelId: null,
    });
    assert.match(replies.at(-1).content, /now disabled/);
  } finally {
    restoreDatabase();
  }
});

test('non-admin non-owner cannot change announcement settings', async () => {
  const restoreDatabase = useMemoryDatabase();
  const channel = {
    id: 'announcements',
    guildId: 'test-guild',
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
  };
  const { interaction, replies } = createInteraction({ channel, isAdmin: false });
  interaction.guild.ownerId = 'different-owner';

  try {
    await announcementsCommand.execute(interaction, null, { db });

    assert.match(replies[0].content, /Only this server’s owner or a member with Manage Server/);
    assert.equal(await db.get(getGuildConfigKey('test-guild'), null), null);
  } finally {
    restoreDatabase();
  }
});

test('server announcement setup supports prefix commands', () => {
  assert.equal(supportsPrefixExecution(announcementsCommand), true);
  const options = mapArgumentsToOptions(['<#12345678901234567>'], announcementsCommand.data);
  assert.equal(options.getString('channel'), '<#12345678901234567>');
});
