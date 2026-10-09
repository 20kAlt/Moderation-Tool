import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

import welcomeCommand from '../src/commands/Welcome/welcome.js';
import goodbyeCommand from '../src/commands/Welcome/goodbye.js';
import { validateVerificationSetup } from '../src/services/verificationService.js';
import { formatWelcomeMessage } from '../src/utils/welcome.js';
import { resolveLogChannel } from '../src/services/loggingService.js';

test('verification role validation does not depend on the panel channel', async () => {
  const role = { id: 'verified-role' };
  const guild = {
    id: 'guild-1',
    members: {
      me: {},
    },
    roles: {
      cache: new Map([[role.id, role]]),
    },
    channels: {
      cache: new Map(),
    },
  };

  await assert.doesNotReject(() =>
    validateVerificationSetup(guild, {
      roleId: role.id,
      channelId: 'deleted-or-inaccessible-channel',
    }),
  );
});

test('bare ?welcome can open the welcome dashboard and image URLs are optional', () => {
  const command = welcomeCommand.data.toJSON();
  const setup = command.options.find((option) => option.name === 'setup');
  const image = setup.options.find((option) => option.name === 'image');
  const dashboard = command.options.find((option) => option.name === 'dashboard');

  assert.equal(typeof welcomeCommand.prefixFallback, 'function');
  assert.deepEqual(welcomeCommand.prefixFallbackSubcommands, ['setup']);
  assert.equal(image.required, false);
  assert.ok(dashboard);
  assert.equal(command.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.ok(goodbyeCommand.data.toJSON().options.some((option) => option.name === 'dashboard'));
  assert.equal(typeof goodbyeCommand.prefixFallback, 'function');
});

test('welcome member-count placeholders use the event count snapshot', () => {
  const message = formatWelcomeMessage(
    'Welcome! {memberCount} / {guild.memberCount}',
    { user: {}, guild: { memberCount: 12 }, memberCount: 11 },
  );

  assert.equal(message, 'Welcome! 11 / 11');
});

test('logging channel resolution preserves legacy configured channel IDs', () => {
  assert.equal(resolveLogChannel({ logChannelId: 'legacy-audit' }, 'audit'), 'legacy-audit');
});
