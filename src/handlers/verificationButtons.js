import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { createRobloxAuthorizationUrl } from '../services/robloxVerificationService.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This button can only be used in a server.' });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;
        const guildConfig = await getGuildConfig(client, guild.id);
        const verification = guildConfig.verification;

        logger.debug('User clicked verify button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        if (verification?.mode === 'roblox') {
            if (!verification.enabled) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: 'Roblox verification is currently disabled in this server.',
                });
            }

            const member = await guild.members.fetch(userId);
            if (verification.roleId && member.roles.cache.has(verification.roleId)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('Already Verified', 'You already have the verified role.')],
                });
            }

            const authorizationUrl = createRobloxAuthorizationUrl({
                guildId: guild.id,
                discordUserId: userId,
            });
            const continueButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Continue with Roblox')
                    .setStyle(ButtonStyle.Link)
                    .setURL(authorizationUrl),
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    infoEmbed(
                        'Link your Roblox account',
                        'Continue to Roblox and approve the official account-linking request. We never ask for or receive your Roblox password.',
                    ),
                ],
                components: [continueButton],
            });
        }

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You are already verified and have access to all server channels.' });
        }

        logger.info('User verified via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Verification Successful!",
                `You have been verified and given the **${result.roleName}** role!\n\nYou now have access to all server channels and features. Welcome! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};