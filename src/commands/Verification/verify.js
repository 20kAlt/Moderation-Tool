import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { createRobloxAuthorizationUrl } from '../../services/robloxVerificationService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself and gain access to the server'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;
        const guildConfig = await getGuildConfig(client, guild.id);

        if (guildConfig.verification?.mode === 'roblox') {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            const verification = guildConfig.verification;

            if (!verification.enabled) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: 'Roblox verification is currently disabled on this server.',
                });
            }

            const member = await guild.members.fetch(interaction.user.id);
            if (verification.roleId && member.roles.cache.has(verification.roleId)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('Already Verified', 'You already have the verified role.')],
                });
            }

            const authorizationUrl = createRobloxAuthorizationUrl({
                guildId: guild.id,
                discordUserId: interaction.user.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    infoEmbed(
                        'Link your Roblox account',
                        'Continue to Roblox and approve the official account-linking request. We never ask for or receive your Roblox password.',
                    ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Continue with Roblox')
                            .setStyle(ButtonStyle.Link)
                            .setURL(authorizationUrl),
                    ),
                ],
            });
        }

        const result = await verifyUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [infoEmbed('Already Verified', "You are already verified.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed(
                "Verification Complete",
                `You have been verified and given the **${result.roleName}** role! Welcome to the server! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};
