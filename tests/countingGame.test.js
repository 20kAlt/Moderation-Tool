import test from 'node:test';
import assert from 'node:assert/strict';

import { handleCountingGame } from '../src/events/messageCreate.js';
import {
  activateCountingGame,
  getCountingGameConfig,
  getCountingSystemChoices,
} from '../src/services/countingGameService.js';

function createClient() {
  const records = new Map();
  return {
    db: {
      get: async (key) => records.get(key),
      set: async (key, value) => records.set(key, value),
    },
  };
}

test('count setup offers ordinary number counting', () => {
  assert.ok(getCountingSystemChoices().some(({ name, value }) => (
    name === 'Numbers (1, 2, 3...)' && value === 'decimal'
  )));
});

test('correct counts receive a fire reaction and advance the sequence', async () => {
  const client = createClient();
  const guildId = 'guild-one';
  await activateCountingGame(client, guildId, 'counting-channel', 'decimal');
  const reactions = [];
  const message = {
    guild: { id: guildId },
    channel: {
      id: 'counting-channel',
      send: async () => ({ delete: async () => {} }),
    },
    author: { id: 'user-one' },
    content: '1',
    react: async (emoji) => reactions.push(emoji),
    delete: async () => {},
  };

  assert.equal(await handleCountingGame(message, client), true);
  assert.deepEqual(reactions, ['🔥']);
  assert.equal((await getCountingGameConfig(client, guildId)).nextNumber, 2);
});
