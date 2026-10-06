import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder } from 'discord.js';

import { createEmbed } from '../src/utils/embeds.js';

test('embed serialization adds the configured moderation team footer', () => {
  const embed = new EmbedBuilder().setTitle('Menu');

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Team');
});

test('embed serialization keeps existing footer details alongside the team name', () => {
  const embed = new EmbedBuilder()
    .setTitle('Command list')
    .setFooter({ text: 'Page 1 of 2' });

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Team • Page 1 of 2');
});

test('embed serialization does not duplicate the team name', () => {
  const embed = createEmbed({
    title: 'Help menu',
    footer: 'Powered by Moderation Team',
  });

  assert.equal(embed.toJSON().footer.text, 'Powered by Moderation Team');
});
