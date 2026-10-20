import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

import { createTicket } from '../src/services/ticket.js';
import { db } from '../src/utils/database/wrapper.js';
import { getTicketCounterKey } from '../src/utils/database/keys.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

test('ticket creation works in degraded mode without assigning a ticket number', async () => {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
    connectionType: db.connectionType,
    degradedReason: db.degradedReason,
  };
  const storage = new MemoryStorage();
  db.initialized = true;
  db.db = storage;
  db.useFallback = true;

  const category = { id: 'category-id', name: 'Tickets', type: ChannelType.GuildCategory };
  const channelCache = Object.assign(new Map([[category.id, category]]), {
    find: (predicate) => [category].find(predicate),
  });
  let createOptions;
  let sentMessageOptions;
  const createdChannel = {
    id: 'ticket-channel-id',
    async send(options) {
      sentMessageOptions = options;
      return { async pin() {} };
    },
  };
  const guild = {
    id: 'guild-id',
    channels: {
      cache: channelCache,
      async create(options) {
        createOptions = options;
        return createdChannel;
      },
    },
  };
  const client = {
    db,
    guilds: {
      cache: {
        get: (guildId) => guildId === guild.id ? guild : null,
      },
    },
  };
  guild.client = client;

  const member = {
    id: 'member-id',
    user: { username: 'Example_User' },
    toString: () => '<@member-id>',
  };

  try {
    const result = await createTicket(guild, member, null, 'Help please');

    assert.equal(createOptions.name, 'ticket-example_user');
    assert.equal(sentMessageOptions.embeds[0].toJSON().title, 'Support Ticket');
    assert.equal(result.ticketData.status, 'open');
    assert.equal(Object.hasOwn(result.ticketData, 'ticketNumber'), false);
    assert.equal(await storage.get(getTicketCounterKey(guild.id), null), null);
  } finally {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
    db.connectionType = originalState.connectionType;
    db.degradedReason = originalState.degradedReason;
  }
});
