import test from 'node:test';
import assert from 'node:assert/strict';

import { createBotInfoReply, getBotInfoTopic } from '../src/utils/botDmResponse.js';

test('recognizes questions asking who made the bot', () => {
  assert.equal(getBotInfoTopic('Who made this bot?'), 'credits');
  assert.equal(getBotInfoTopic('Who developed the bot'), 'credits');
  assert.equal(getBotInfoTopic('Who is the owner of this bot?'), 'credits');
  assert.equal(getBotInfoTopic('Can I see the credits?'), 'credits');
});

test('answers ownership questions without claiming individual authorship', () => {
  const response = createBotInfoReply('credits', { owner: '20k' });

  assert.match(response, /owned by \*\*20k\*\*/);
  assert.match(response, /do not identify individual developers/);
});

test('recognizes general questions about the bot', () => {
  assert.equal(getBotInfoTopic('What is this bot?'), 'about');
  assert.equal(getBotInfoTopic('What do you do?'), 'about');
});

test('does not treat unrelated messages as bot information questions', () => {
  assert.equal(getBotInfoTopic('Can you help me with a ticket?'), null);
});
