import test from 'node:test';
import assert from 'node:assert/strict';

import { getLoggingStatus, setLogChannel } from '../src/services/loggingService.js';
import { db } from '../src/utils/database/wrapper.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

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
