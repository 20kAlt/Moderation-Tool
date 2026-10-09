import test from 'node:test';
import assert from 'node:assert/strict';

import mergeCommand from '../src/commands/Ticket/merge.js';

test('merge command is available as a slash command with a required destination ticket', () => {
  const command = mergeCommand.data.toJSON();
  const destination = command.options.find((option) => option.name === 'destination');

  assert.equal(command.name, 'merge');
  assert.equal(destination.required, true);
  assert.deepEqual(destination.channel_types, [0]);
});
