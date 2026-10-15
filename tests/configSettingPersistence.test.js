import test from 'node:test';
import assert from 'node:assert/strict';

import ConfigService from '../src/services/config/configService.js';
import { getGuildConfig } from '../src/services/config/guildConfig.js';
import { db } from '../src/utils/database/wrapper.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

test('config wizard role and log channel settings persist and reload', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  const role = { id: 'moderator-role', position: 1 };
  const channel = {
    id: 'audit-channel',
    isTextBased: () => true,
  };
  const guild = {
    roles: { cache: new Map([[role.id, role]]) },
    channels: { cache: new Map([[channel.id, channel]]) },
    members: {
      me: { roles: { highest: { position: 10 } } },
    },
  };
  const client = {
    db,
    guilds: { cache: new Map([['guild-one', guild]]) },
  };

  try {
    await ConfigService.updateSetting(client, 'guild-one', 'modRole', role.id, 'admin');
    await ConfigService.updateSetting(client, 'guild-one', 'logChannelId', channel.id, 'admin');

    const config = await getGuildConfig(client, 'guild-one');
    assert.equal(config.modRole, role.id);
    assert.equal(config.logging.channels.audit, channel.id);
    assert.equal(config.logging.enabled, true);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});
