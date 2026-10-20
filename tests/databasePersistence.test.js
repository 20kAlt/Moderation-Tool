import test from 'node:test';
import assert from 'node:assert/strict';

import { db, initializeDatabase } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

test('database startup requires PostgreSQL unless volatile storage is explicitly enabled', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
    connectionType: db.connectionType,
    degradedReason: db.degradedReason,
    degradedModeWarningShown: db.degradedModeWarningShown,
    allowInMemoryStorage: process.env.ALLOW_IN_MEMORY_STORAGE,
    connect: pgDb.connect,
    getLastFailure: pgDb.getLastFailure,
  };

  db.initialized = false;
  db.db = null;
  db.useFallback = false;
  process.env.ALLOW_IN_MEMORY_STORAGE = 'false';
  pgDb.connect = async () => false;
  pgDb.getLastFailure = () => ({ reason: 'POSTGRES_CONNECTION_FAILED', message: 'Connection refused' });

  try {
    await assert.rejects(
      initializeDatabase(),
      /PostgreSQL is required for persistent storage/,
    );
    assert.equal(db.initialized, false);

    process.env.ALLOW_IN_MEMORY_STORAGE = 'true';
    await initializeDatabase();
    assert.equal(db.initialized, true);
    assert.equal(db.useFallback, true);
    assert.ok(db.db instanceof MemoryStorage);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
    db.connectionType = originalState.connectionType;
    db.degradedReason = originalState.degradedReason;
    db.degradedModeWarningShown = originalState.degradedModeWarningShown;
    pgDb.connect = originalState.connect;
    pgDb.getLastFailure = originalState.getLastFailure;
    if (originalState.allowInMemoryStorage === undefined) {
      delete process.env.ALLOW_IN_MEMORY_STORAGE;
    } else {
      process.env.ALLOW_IN_MEMORY_STORAGE = originalState.allowInMemoryStorage;
    }
  }
});
