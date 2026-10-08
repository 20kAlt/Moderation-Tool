import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

import welcomeCommand from '../src/commands/Welcome/welcome.js';
import { validateVerificationSetup } from '../src/services/verificationService.js';

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

  assert.equal(typeof welcomeCommand.prefixFallback, 'function');
  assert.deepEqual(welcomeCommand.prefixFallbackSubcommands, ['setup']);
  assert.equal(image.required, false);
  assert.equal(command.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
});
