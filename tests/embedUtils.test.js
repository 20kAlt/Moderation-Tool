import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbed } from '../src/utils/embeds.js';

test('createEmbed should ignore unimportant footer text and should not add a timestamp by default', () => {
  const embed = createEmbed({
    title: 'Test',
    description: 'Hello world',
    footer: 'Footer text should move into description'
  });

  const data = embed.toJSON();
  assert.equal(data.footer, undefined);
  assert.equal(data.timestamp, undefined);
  assert.equal(data.description, 'Hello world');
});

test('createEmbed should append important footer text to description when footer is important', () => {
  const embed = createEmbed({
    title: 'Test',
    description: 'Hello world',
    footer: 'Dashboard closes after 10 minutes of inactivity'
  });

  const data = embed.toJSON();
  assert.equal(data.footer, undefined);
  assert.equal(data.timestamp, undefined);
  assert.equal(data.description, 'Hello world\n\n-# Dashboard closes after 10 minutes of inactivity');
});

test('setFooter should append important footer text to description and suppress actual footer', () => {
  const embed = createEmbed({
    title: 'Footer Test',
    description: 'Base description.'
  });

  embed.setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' });
  const data = embed.toJSON();

  assert.equal(data.footer, undefined);
  assert.equal(data.description, 'Base description.\n\n-# Dashboard closes after 10 minutes of inactivity');
});

test('setFooter should ignore unimportant footer text', () => {
  const embed = createEmbed({
    title: 'Footer Test',
    description: 'Base description.'
  });

  embed.setFooter({ text: 'Requested by mrpinkify' });
  const data = embed.toJSON();

  assert.equal(data.footer, undefined);
  assert.equal(data.description, 'Base description.');
});
