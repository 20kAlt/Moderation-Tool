import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function createBugReportStatusRow(status = 'pending') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bugreport_status:pending')
            .setLabel('Mark Pending')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(status === 'pending'),
        new ButtonBuilder()
            .setCustomId('bugreport_status:complete')
            .setLabel('Mark Complete')
            .setStyle(ButtonStyle.Success)
            .setDisabled(status === 'complete'),
    );
}

export function updateBugReportStatusEmbed(sourceEmbed, status) {
    const embed = EmbedBuilder.from(sourceEmbed);
    const statusField = {
        name: 'Status',
        value: status === 'complete' ? '✅ Complete' : '🕓 Pending',
        inline: true,
    };
    const fields = embed.data.fields || [];
    const statusIndex = fields.findIndex(field => field.name === 'Status');

    if (statusIndex === -1) {
        fields.unshift(statusField);
    } else {
        fields[statusIndex] = statusField;
    }

    return embed.setFields(fields).setColor(status === 'complete' ? 0x3BA55D : 0xD64545);
}