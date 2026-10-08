import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';

import purgeCommand, { purgeChannelMessages } from '../src/commands/Moderation/purge.js';
import { resolveCommandAlias } from '../src/config/commands/commandAliases.js';
import { getPrefixRestriction } from '../src/config/commands/prefixRestrictions.js';
import { resolvePrefixAccessKey, supportsPrefixExecution } from '../src/utils/messageAdapter.js';
import { resolveSubcommandAlias } from '../src/config/commands/commandAliases.js';

test('purge command supports an amount up to 500 and requires Manage Messages', () => {
  const command = purgeCommand.data.toJSON();
  const amount = command.options.find((option) => option.name === 'amount');

  assert.equal(amount.min_value, 1);
  assert.equal(amount.max_value, 500);
  assert.equal(command.default_member_permissions, '8192');
});

test('purge is available through prefix commands and resolves to the same command as slash', () => {
  assert.equal(resolveCommandAlias('purge'), 'purge');
  assert.equal(supportsPrefixExecution(purgeCommand), true);
  assert.equal(getPrefixRestriction(purgeCommand, [], resolveSubcommandAlias).blocked, false);
  assert.equal(resolvePrefixAccessKey(purgeCommand.data, ['25']), 'purge');
});

test('purge deletes the requested amount in batches no larger than 100', async () => {
  const messages = new Collection(
    Array.from({ length: 230 }, (_, index) => {
      const id = String(230 - index).padStart(3, '0');
      return [id, { id, createdTimestamp: Date.now() }];
    }),
  );
  const deletedBatchSizes = [];
  const channel = {
    messages: {
      async fetch({ limit, before }) {
        const available = [...messages.values()]
          .filter((message) => !before || message.id < before)
          .slice(0, limit);
        return new Collection(available.map((message) => [message.id, message]));
      },
    },
    async bulkDelete(batch) {
      deletedBatchSizes.push(batch.size);
      for (const id of batch.keys()) {
        messages.delete(id);
      }
      return batch;
    },
  };

  const result = await purgeChannelMessages(channel, 230);

  assert.equal(result.deletedCount, 230);
  assert.equal(result.skippedOldMessages, false);
  assert.deepEqual(deletedBatchSizes, [100, 100, 30]);
  assert.equal(messages.size, 0);
});

test('purge skips messages older than 14 days and reports that restriction', async () => {
  const recentMessage = { id: '002', createdTimestamp: Date.now() };
  const oldMessage = { id: '001', createdTimestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 };
  let bulkDeleteCalls = 0;
  const channel = {
    messages: {
      async fetch() {
        return new Collection([
          [recentMessage.id, recentMessage],
          [oldMessage.id, oldMessage],
        ]);
      },
    },
    async bulkDelete(batch) {
      bulkDeleteCalls += 1;
      return batch;
    },
  };

  const result = await purgeChannelMessages(channel, 2);

  assert.equal(result.deletedCount, 1);
  assert.equal(result.skippedOldMessages, true);
  assert.equal(bulkDeleteCalls, 1);
});
