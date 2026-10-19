import test from 'node:test';
import assert from 'node:assert/strict';

import afkCommand from '../src/commands/Utility/afk.js';
import {
  createAfkNickname,
  getAfkStatus,
  restoreAfkNickname,
} from '../src/services/afkService.js';
import { db, getAFKKey } from '../src/utils/database.js';
import { MemoryStorage } from '../src/utils/memoryStorage.js';

function useMemoryDatabase() {
  const originalState = {
    initialized: db.initialized,
    database: db.db,
    useFallback: db.useFallback,
  };
  db.initialized = true;
  db.useFallback = true;
  db.db = new MemoryStorage();

  return () => {
    db.initialized = originalState.initialized;
    db.db = originalState.database;
    db.useFallback = originalState.useFallback;
  };
}

test('AFK nickname keeps the previous display name within Discord nickname limits', () => {
  assert.equal(createAfkNickname('Member Name'), 'AFK | Member Name');
  assert.equal(createAfkNickname('A'.repeat(40)).length, 32);
});

test('setting AFK stores the original nickname and changes the member nickname', async () => {
  const restoreDatabase = useMemoryDatabase();
  const replies = [];
  const member = {
    nickname: 'Old Server Name',
    displayName: 'Old Server Name',
    async setNickname(nickname) {
      this.nickname = nickname;
    },
  };
  const interaction = {
    id: 'afk-interaction',
    createdTimestamp: Date.now(),
    user: { id: 'afk-user', username: 'User' },
    guildId: 'afk-guild',
    member,
    options: { getString: () => 'Back later' },
    replied: false,
    deferred: false,
    async reply(payload) {
      replies.push(payload);
      this.replied = true;
    },
    async editReply(payload) {
      replies.push(payload);
    },
    async followUp(payload) {
      replies.push(payload);
    },
  };

  try {
    await afkCommand.execute(interaction);

    assert.equal(member.nickname, 'AFK | Old Server Name');
    assert.equal(replies.length, 1);
    assert.match(replies[0].embeds[0].toJSON().description, /restored when you return/);
    assert.deepEqual(await getAfkStatus('afk-guild', 'afk-user'), {
      reason: 'Back later',
      originalNickname: 'Old Server Name',
      since: (await db.get(getAFKKey('afk-guild', 'afk-user'))).since,
    });
  } finally {
    restoreDatabase();
  }
});

test('returning members get their original nickname restored', async () => {
  const changedNicknames = [];
  const member = {
    nickname: 'AFK | Old Server Name',
    async setNickname(nickname) {
      changedNicknames.push(nickname);
      this.nickname = nickname;
    },
  };

  assert.equal(
    await restoreAfkNickname(member, { originalNickname: 'Old Server Name' }),
    true,
  );
  assert.deepEqual(changedNicknames, ['Old Server Name']);
  assert.equal(member.nickname, 'Old Server Name');
});

test('AFK cleanup does not overwrite a nickname changed manually while away', async () => {
  let nicknameChanged = false;
  const member = {
    nickname: 'New Name',
    async setNickname() {
      nicknameChanged = true;
    },
  };

  assert.equal(await restoreAfkNickname(member, { originalNickname: 'Old Name' }), false);
  assert.equal(nicknameChanged, false);
});
