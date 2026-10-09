import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgreSQLDatabase } from '../src/utils/postgresDatabase.js';
import { getHighestTicketNumber, incrementTicketCounter } from '../src/utils/database/tickets.js';
import { db } from '../src/utils/database/wrapper.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';
import { getTicketCounterKey } from '../src/utils/database/keys.js';

test('memory ticket counters increment atomically and honor the existing high-water mark', async () => {
  const storage = new MemoryStorage();
  const key = getTicketCounterKey('guild-one');

  const numbers = await Promise.all(
    Array.from({ length: 20 }, () => storage.incrementAtLeast(key, 5)),
  );

  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 6));
  assert.equal(await storage.get(key), 25);
});

test('PostgreSQL ticket counter uses one atomic per-guild upsert', async () => {
  const postgres = new PostgreSQLDatabase();
  const storedCounters = new Map();
  const queries = [];
  postgres.isConnected = true;
  postgres.pool = {
    async query(sql, [key, minimum, amount]) {
      queries.push(sql);
      const nextValue = Math.max(storedCounters.get(key) || 0, minimum) + amount;
      storedCounters.set(key, nextValue);
      return { rows: [{ value: String(nextValue) }] };
    },
  };

  const firstGuildKey = getTicketCounterKey('guild-one');
  const secondGuildKey = getTicketCounterKey('guild-two');
  const numbers = await Promise.all(
    Array.from({ length: 10 }, () => postgres.incrementAtLeast(firstGuildKey, 0)),
  );

  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.equal(await postgres.incrementAtLeast(secondGuildKey, 0), 1);
  assert.equal(queries.length, 11);
  assert.ok(queries.every((sql) => sql.includes('ON CONFLICT (key) DO UPDATE')));
});

test('ticket counter helper uses the guild key, preserves the high-water mark, and propagates write failures', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  const counters = new Map();
  db.initialized = true;
  db.useFallback = false;
  db.db = {
    async incrementAtLeast(key, minimum, amount) {
      const nextValue = Math.max(counters.get(key) || 0, minimum) + amount;
      counters.set(key, nextValue);
      return nextValue;
    },
  };

  try {
    assert.equal(await incrementTicketCounter('guild-one', 9), '010');
    assert.equal(await incrementTicketCounter('guild-one'), '011');
    assert.equal(await incrementTicketCounter('guild-two'), '001');

    db.db.incrementAtLeast = async () => {
      throw new Error('database write failed');
    };
    await assert.rejects(incrementTicketCounter('guild-three'), /database write failed/);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});

test('ticket counter recovers its high-water mark from stored ticket records', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  const storage = new MemoryStorage();
  db.initialized = true;
  db.useFallback = false;
  db.db = storage;

  try {
    await storage.set('guild:guild-one:ticket:channel-one', { ticketNumber: '018' });
    await storage.set('guild:guild-one:ticket:channel-two', { ticketNumber: '004' });
    assert.equal(await getHighestTicketNumber('guild-one'), 18);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});

test('ticket counter refuses to issue non-persistent numbers in degraded mode', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  try {
    await assert.rejects(
      incrementTicketCounter('guild-one'),
      (error) => error.userMessage?.includes('persistent storage is offline'),
    );
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  }
});
