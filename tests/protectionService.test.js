import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';

import { botConfig } from '../src/config/bot.js';
import { isAntiNukeEnabled, recordAntiNukeAction } from '../src/services/protectionService.js';
import { normalizeGuildConfig } from '../src/utils/schemas.js';

test('anti-nuke is disabled by default until enabled in guild configuration', () => {
  const config = normalizeGuildConfig({});

  assert.equal(config.protection.enabled, false);
  assert.equal(config.protection.antiNuke.enabled, false);
  assert.equal(isAntiNukeEnabled(config), false);
});

test('anti-nuke requires both guild switches and honors the global kill switch', () => {
  const config = {
    protection: {
      enabled: true,
      antiNuke: { enabled: true },
    },
  };
  const globalSwitch = botConfig.antiNuke.enabled;

  try {
    botConfig.antiNuke.enabled = true;
    assert.equal(isAntiNukeEnabled(config), true);
    assert.equal(isAntiNukeEnabled({ protection: { ...config.protection, enabled: false } }), false);
    assert.equal(isAntiNukeEnabled({
      protection: { ...config.protection, antiNuke: { enabled: false } },
    }), false);
    botConfig.antiNuke.enabled = false;
    assert.equal(isAntiNukeEnabled(config), false);
  } finally {
    botConfig.antiNuke.enabled = globalSwitch;
  }
});

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
