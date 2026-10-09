import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

import { assignAutoRole } from '../src/services/autoRoleService.js';

function createMember({ role, hasManageRoles = true, manageable = true } = {}) {
  const assigned = [];
  const botMember = {
    permissions: { has: (permission) => permission === PermissionFlagsBits.ManageRoles && hasManageRoles },
    roles: { highest: { position: 10 } },
  };
  const member = {
    id: 'member-one',
    manageable,
    roles: {
      async add(assignedRole, reason) {
        assigned.push({ role: assignedRole, reason });
      },
    },
    guild: {
      id: 'guild-one',
      members: { me: botMember },
      roles: {
        async fetch(roleId) {
          return roleId === role.id ? role : null;
        },
      },
    },
  };

  return { member, assigned };
}

test('auto-role assignment fetches and assigns a role even when it is not cached', async () => {
  const role = { id: 'role-one', position: 2, managed: false };
  const { member, assigned } = createMember({ role });

  assert.equal(await assignAutoRole(member, role.id), true);
  assert.deepEqual(assigned, [{
    role,
    reason: 'Automatic role on member join',
  }]);
});

test('auto-role assignment rejects missing permission and roles above the bot hierarchy', async () => {
  const role = { id: 'role-one', position: 12, managed: false };
  const withoutPermission = createMember({ role, hasManageRoles: false });
  const aboveBot = createMember({ role });

  assert.equal(await assignAutoRole(withoutPermission.member, role.id), false);
  assert.equal(await assignAutoRole(aboveBot.member, role.id), false);
  assert.deepEqual(withoutPermission.assigned, []);
  assert.deepEqual(aboveBot.assigned, []);
});
