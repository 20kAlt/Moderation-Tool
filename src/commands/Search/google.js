import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('google')
        .setDescription('Search Google')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('What would you like to search for?')
                .setRequired(true)),
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        const embed = createEmbed({
            title: 'Google Search',
            description: `[Search for "${query}"](${searchUrl})`,
            color: 'info'
        })
        .setFooter({ text: 'Google Search Results' });

        await InteractionHelper.safeReply(interaction, { embeds: [embed] });

        logger.info('Google search link generated', {
            userId: interaction.user.id,
            query: query,
            guildId: interaction.guildId,
            commandName: 'google'
        });
    },
};