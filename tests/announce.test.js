import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

import announceCommand, {
  buildAnnouncementEmbed,
  sendGlobalAnnouncement,
} from '../src/commands/Core/announce.js';
import botConfig from '../src/config/bot.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import { supportsPrefixExecution } from '../src/utils/messageAdapter.js';

function createGuild(id, channels) {
  const general = {
    id: `${id}-general`,
    name: 'general',
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => {
      channels.push(payload);
    },
  };

  return {
    id,
    members: { me: {} },
    channels: {
      fetch: async () => new Map([[general.id, general]]),
    },
  };
}

test('announcement embeds distinguish server and global announcements', () => {
  assert.equal(buildAnnouncementEmbed('server', 'Change details').toJSON().title, 'Server Announcement');
  assert.equal(buildAnnouncementEmbed('global', 'Change details').toJSON().title, 'Global Announcement');
});

test('global announcements are delivered to each guild #general channel', async () => {
  const postedPayloads = [];
  const client = {
    guilds: {
      cache: new Map([
        ['guild-1', createGuild('guild-1', postedPayloads)],
        ['guild-2', createGuild('guild-2', postedPayloads)],
      ]),
    },
  };

  const result = await sendGlobalAnnouncement(client, 'A change is now live.');

  assert.deepEqual(result, { sent: 2, skipped: 0 });
  assert.equal(postedPayloads.length, 2);
  for (const payload of postedPayloads) {
    assert.equal(payload.embeds[0].toJSON().title, 'Global Announcement');
    assert.equal(payload.embeds[0].toJSON().description, 'A change is now live.');
    assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  }
});

test('announcement command supports prefix execution and parses prefix announcement text', () => {
  assert.equal(supportsPrefixExecution(announceCommand), true);
  assert.equal(announceCommand.data.toJSON().name, 'announce');
  const options = mapArgumentsToOptions(
    ['global', 'A change is now live'],
    announceCommand.data,
  );

  assert.equal(options.getString('scope'), 'global');
  assert.equal(options.getString('message'), 'A change is now live');
});

test('announcement command is rejected for users not configured as bot owners', async () => {
  const previousOwners = botConfig.commands.owners;
  botConfig.commands.owners = ['configured-owner'];
  const replies = [];
  const interaction = {
    user: { id: 'not-an-owner' },
    options: {
      getString: () => 'global',
    },
    reply: async (payload) => replies.push(payload),
    followUp: async (payload) => replies.push(payload),
    editReply: async (payload) => replies.push(payload),
    id: 'interaction-id',
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
  };

  try {
    await announceCommand.execute(interaction, null, {});

    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /Only configured bot owners/);
  } finally {
    botConfig.commands.owners = previousOwners;
  }
});

test('configured bot owners can post a server announcement in the current channel', async () => {
  const previousOwners = botConfig.commands.owners;
  botConfig.commands.owners = ['configured-owner'];
  const postedAnnouncements = [];
  const replies = [];
  const channel = {
    id: 'server-channel',
    type: ChannelType.GuildText,
    toString: () => '<#server-channel>',
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => postedAnnouncements.push(payload),
  };
  const interaction = {
    user: { id: 'configured-owner' },
    options: {
      getString: (name) => ({
        scope: 'server',
        message: 'The server has a new update.',
      })[name],
    },
    channel,
    guild: { id: 'guild-1', members: { me: {} } },
    id: 'interaction-id',
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    deferReply: async () => {
      interaction.deferred = true;
    },
    editReply: async (payload) => replies.push(payload),
  };

  try {
    await announceCommand.execute(interaction, null, {});

    assert.equal(postedAnnouncements.length, 1);
    assert.equal(postedAnnouncements[0].embeds[0].toJSON().title, 'Server Announcement');
    assert.equal(postedAnnouncements[0].embeds[0].toJSON().description, 'The server has a new update.');
    assert.match(replies[0].content, /Server announcement posted/);
  } finally {
    botConfig.commands.owners = previousOwners;
  }
});
