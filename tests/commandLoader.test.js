import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';

import { registerCommands } from '../src/handlers/loaders/commandLoader.js';

function buildCommand(name) {
  return {
    data: {
      name,
      description: `Description for ${name}`,
      toJSON() {
        return { name, description: `Description for ${name}` };
      },
    },
    execute() {},
  };
}

test('registerCommands keeps a non-empty global command set so Discord can show the command badge', async () => {
  const calls = [];
  const client = {
    commands: new Collection(),
    guilds: {
      cache: {
        size: 2,
        values: () => [{ id: 'guild-1' }, { id: 'guild-2' }],
      },
    },
    rest: {
      put: async (path, payload) => {
        calls.push({ path, body: payload.body });
      },
    },
    config: {
      bot: {
        clientId: '1234567890',
      },
    },
    application: {
      id: '1234567890',
    },
  };

  client.commands.set('ping', buildCommand('ping'));
  client.commands.set('help', buildCommand('help'));
  client.commands.set('stats', buildCommand('stats'));

  await registerCommands(client);

  assert.ok(calls.some(({ path }) => path === '/applications/1234567890/commands'));
  const globalCall = calls.find(({ path }) => path === '/applications/1234567890/commands');
  assert.ok(Array.isArray(globalCall.body), 'Global registration should send an array of commands');
  assert.ok(globalCall.body.length > 0, 'Global registration should keep at least one command for the Discord badge');
  assert.deepEqual(globalCall.body.map((command) => command.name).slice(0, 3), ['ping', 'help', 'stats']);
});
