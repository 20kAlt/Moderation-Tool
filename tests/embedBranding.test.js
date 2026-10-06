import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from 'discord.js';

import { createEmbed } from '../src/utils/embeds.js';

test('embed serialization adds the configured moderation team footer', () => {
  const embed = new EmbedBuilder().setTitle('Menu');

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Tool');
});

test('embed serialization keeps existing footer details alongside the team name', () => {
  const embed = new EmbedBuilder()
    .setTitle('Command list')
    .setFooter({ text: 'Page 1 of 2' });

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Tool • Page 1 of 2');
});

test('embed serialization does not duplicate the team name', () => {
  const embed = createEmbed({
    title: 'Help menu',
    footer: 'Powered by Moderation Tool',
  });

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Tool');
});

test('embed serialization includes the current time in the footer', () => {
  const beforeSerialization = Date.now();
  const serialized = new EmbedBuilder().setTitle('Menu').toJSON();
  const afterSerialization = Date.now();

  const timestamp = Date.parse(serialized.timestamp);
  assert.ok(timestamp >= beforeSerialization);
  assert.ok(timestamp <= afterSerialization);
});

test('embed serialization preserves an explicitly set timestamp', () => {
  const timestamp = new Date('2026-01-10T13:11:00.000Z');
  const embed = createEmbed({ title: 'Menu', timestamp });

  assert.equal(embed.toJSON().timestamp, timestamp.toISOString());
});
