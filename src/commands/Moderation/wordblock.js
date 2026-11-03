import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { addBlockedWord, getBlockedWords, removeBlockedWord } from '../../services/wordBlockerService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('wordblock')
        .setDescription('Manage restricted words for this server')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('add')
                .setDescription('Add a word or phrase to the restricted list')
                .addStringOption((option) =>
                    option
                        .setName('word')
                        .setDescription('The word or phrase to block')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove a restricted word from the list')
                .addStringOption((option) =>
                    option
                        .setName('word')
                        .setDescription('The word or phrase to remove')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('Display all restricted words for this server'),
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'Moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'add') {
            const word = interaction.options.getString('word');
            const result = await addBlockedWord(client, guildId, word);

            if (!result.added) {
                if (result.reason === 'already_exists') {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [warningEmbed('Restricted Term Already Active', `The word \`${word}\` is already blocked for this server.`)],
                    });
                    return;
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [warningEmbed('Invalid Restricted Term', 'Please provide a valid word or phrase to block.')],
                });
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Restricted Term Added', `\`${word}\` has been added to the blocked word list for this server.`)],
            });
            return;
        }

        if (subcommand === 'remove') {
            const word = interaction.options.getString('word');
            const result = await removeBlockedWord(client, guildId, word);

            if (!result.removed) {
                if (result.reason === 'not_found') {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [warningEmbed('Restricted Term Not Found', `\`${word}\` is not currently on the blocked word list.`)],
                    });
                    return;
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [warningEmbed('Invalid Restricted Term', 'Please provide a valid word or phrase to remove.')],
                });
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Restricted Term Removed', `\`${word}\` has been removed from the blocked word list.`)],
            });
            return;
        }

        const blockedWords = await getBlockedWords(client, guildId);
        const embed = createEmbed({
            title: 'Blocked Word List',
            description: blockedWords.length > 0
                ? blockedWords.map((entry) => `• ${entry}`).join('\n')
                : 'No restricted words are currently configured for this server.',
            color: blockedWords.length > 0 ? 'info' : 'primary',
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
};
