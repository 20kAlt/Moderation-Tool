import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

import { recordAntiNukeAction } from '../src/services/protectionService.js';

test('anti-nuke alerts use the audit log channel when no protection alert channel is set', async () => {
  const sentMessages = [];
  const logChannel = {
    id: 'audit-channel',
    type: ChannelType.GuildAnnouncement,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (message) => sentMessages.push(message),
  };
  const guild = {
    id: 'guild-one',
    name: 'Test Guild',
    ownerId: 'owner',
    members: {
      me: {},
      fetch: async () => null,
    },
    channels: {
      cache: new Map([[logChannel.id, logChannel]]),
      fetch: async () => logChannel,
    },
  };
  const client = { user: { id: 'bot' } };
  const config = {
    protection: {
      enabled: true,
      alertChannelId: null,
      antiNuke: {
        enabled: true,
        actionThreshold: 2,
        windowSeconds: 10,
        timeoutMinutes: 30,
        trustedUserIds: [],
      },
    },
    logging: {
      channels: { audit: logChannel.id },
    },
  };

  assert.equal(await recordAntiNukeAction(client, guild, 'suspected-user', 'Role deleted', '', config), false);
  assert.equal(await recordAntiNukeAction(client, guild, 'suspected-user', 'Channel deleted', '', config), true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].embeds.length, 1);
});
