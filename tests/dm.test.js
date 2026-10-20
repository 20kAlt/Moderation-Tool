import test from 'node:test';
import assert from 'node:assert/strict';

import dmCommand from '../src/commands/Moderation/dm.js';
import botConfig from '../src/config/bot.js';

test('DM command rejects users who are not configured bot owners', async () => {
  const previousOwners = botConfig.commands.owners;
  botConfig.commands.owners = ['configured-owner'];
  const replies = [];
  let deferred = false;
  let targetLookupAttempted = false;
  const interaction = {
    user: { id: 'not-an-owner' },
    options: {
      getUser: () => {
        targetLookupAttempted = true;
        return { bot: false };
      },
    },
    reply: async (payload) => replies.push(payload),
    followUp: async (payload) => replies.push(payload),
    editReply: async (payload) => replies.push(payload),
    deferReply: async () => {
      deferred = true;
    },
    id: 'interaction-id',
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
  };

  try {
    await dmCommand.execute(interaction, null, {});

    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /Only configured bot owners/);
    assert.equal(deferred, false);
    assert.equal(targetLookupAttempted, false);
  } finally {
    botConfig.commands.owners = previousOwners;
  }
});
