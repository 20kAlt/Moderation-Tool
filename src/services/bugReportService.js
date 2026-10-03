import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function formatBugReportProof(proof) {
    if (!proof) return { value: 'Not provided', imageUrl: null };

    const matches = [...proof.matchAll(/https?:\/\/[^\s<>"']+/gi)];
    const links = matches.flatMap(match => {
        let rawUrl = match[0];
        while (/[.,!?;:]$/.test(rawUrl)) rawUrl = rawUrl.slice(0, -1);
        try {
            const url = new URL(rawUrl);
            return [{ start: match.index, end: match.index + rawUrl.length, href: url.href, pathname: url.pathname }];
        } catch {
            return [];
        }
    });

    if (!links.length) return { value: proof, imageUrl: null };

    let value = '';
    let cursor = 0;
    for (const [index, link] of links.entries()) {
        value += proof.slice(cursor, link.start);
        const label = links.length === 1 ? 'Open proof' : `Open proof ${index + 1}`;
        value += `[${label}](<${link.href}>)`;
        cursor = link.end;
    }
    value += proof.slice(cursor);

    const imageLink = links.find(link => /\.(?:png|jpe?g|gif|webp|avif)$/i.test(link.pathname));
    return {
        value: value.length <= 1024 ? value : proof,
        imageUrl: imageLink?.href || null,
    };
}

export function createBugReportButton() {
    return new ButtonBuilder()
        .setCustomId('help-report-bug')
        .setLabel('Report Bot Bug')
        .setEmoji('🐞')
        .setStyle(ButtonStyle.Danger);
}

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
        value: status === 'complete' ? '✅ Complete' : '🕓 Pending review',
        inline: true,
    };
    const fields = embed.data.fields || [];
    const statusIndex = fields.findIndex(field => field.name === 'Status');

    if (statusIndex === -1) {
        fields.unshift(statusField);
    } else {
        fields[statusIndex] = statusField;
    }

    return embed.setFields(fields).setColor(status === 'complete' ? 0x3BA55D : 0xE0A23B);
}