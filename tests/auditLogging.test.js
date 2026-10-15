import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';

import guildMemberUpdate from '../src/events/guildMemberUpdate.js';
import { db } from '../src/utils/database/wrapper.js';
import { getGuildConfigKey } from '../src/utils/database/keys.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

test('audit logging records member role additions and removals', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  const sentMessages = [];
  const auditChannel = {
    id: 'audit-channel',
    type: 0,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (message) => {
      sentMessages.push(message);
      return message;
    },
  };
  const guild = {
    id: 'guild-one',
    name: 'Test Guild',
    iconURL: () => null,
    channels: {
      cache: new Map([[auditChannel.id, auditChannel]]),
      fetch: async () => auditChannel,
    },
    members: { me: {} },
  };
  const client = {
    db,
    guilds: { cache: new Map([[guild.id, guild]]) },
  };
  const addedRole = { id: 'role-added', name: 'Member', toString: () => '<@&role-added>' };
  const removedRole = { id: 'role-removed', name: 'Old Role', toString: () => '<@&role-removed>' };

  try {
    await db.set(getGuildConfigKey(guild.id), {
      logging: {
        enabled: true,
        channels: { audit: auditChannel.id },
        enabledEvents: {},
      },
    });

    const user = {
      id: 'user-one',
      tag: 'user#0001',
      toString: () => '<@user-one>',
    };
    await guildMemberUpdate.execute(
      {
        nickname: null,
        roles: { cache: new Collection([[removedRole.id, removedRole]]) },
      },
      {
        client,
        guild,
        user,
        nickname: null,
        roles: { cache: new Collection([[addedRole.id, addedRole]]) },
      },
    );

    assert.equal(sentMessages.length, 2);
    const descriptions = sentMessages.map(({ embeds }) => embeds[0].toJSON().description);
    assert.ok(descriptions.some((description) => description.includes('Roles added') && description.includes('role-added')));
    assert.ok(descriptions.some((description) => description.includes('Roles removed') && description.includes('role-removed')));
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});
