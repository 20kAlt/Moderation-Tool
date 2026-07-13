import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
<<<<<<< HEAD
import { withErrorHandling } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
=======
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself and gain access to the server'),

    async execute(interaction, config, client) {
<<<<<<< HEAD
        const wrappedExecute = withErrorHandling(async () => {
            const guild = interaction.guild;

            const result = await verifyUser(client, guild.id, interaction.user.id, {
                source: 'command_self',
                moderatorId: null
            });

            if (!result.success) {
                if (result.alreadyVerified) {
                    return await InteractionHelper.safeReply(interaction, {
                        embeds: [infoEmbed('Already Verified', "You are already verified.")],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred during verification. Please try again or contact an administrator.' });
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    "Verification Complete",
                    `You have been verified and given the **${result.roleName}** role! Welcome to the server! 🎉`
                )],
                flags: MessageFlags.Ephemeral
            });
        }, { command: 'verify' });

        return await wrappedExecute(interaction, config, client);
    }
};
=======
        const guild = interaction.guild;

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
>>>>>>> 771ebe2 (Reorganize project structure, wire bot config, and fix dependency vulnerabilities)
