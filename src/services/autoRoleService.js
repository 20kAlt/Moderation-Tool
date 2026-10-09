import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export async function assignAutoRole(member, roleId) {
    const guild = member.guild;
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn(`Cannot auto-assign role ${roleId} in guild ${guild.id}: bot is missing Manage Roles permission`);
        return false;
    }

    const role = await guild.roles.fetch(roleId).catch((error) => {
        logger.warn(`Could not fetch configured auto-role ${roleId} in guild ${guild.id}:`, error);
        return null;
    });
    if (!role) {
        logger.warn(`Configured auto-role ${roleId} no longer exists in guild ${guild.id}`);
        return false;
    }

    if (role.managed || role.position >= botMember.roles.highest.position) {
        logger.warn(`Cannot auto-assign role ${roleId} in guild ${guild.id}: role is managed or is above the bot's highest role`);
        return false;
    }

    if (!member.manageable) {
        logger.warn(`Cannot auto-assign role ${roleId} to member ${member.id} in guild ${guild.id}: member is above the bot's role hierarchy`);
        return false;
    }

    try {
        await member.roles.add(role, 'Automatic role on member join');
        logger.info(`Auto-assigned role ${roleId} to member ${member.id} in guild ${guild.id}`);
        return true;
    } catch (error) {
        logger.warn(`Failed to auto-assign role ${roleId} to member ${member.id} in guild ${guild.id}:`, error);
        return false;
    }
}
