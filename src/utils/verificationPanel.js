import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import { botConfig, getColor } from '../config/bot.js';

export function normalizeVerificationImageUrl(value) {
    const imageUrl = value?.trim();
    if (!imageUrl) return null;

    let parsedUrl;
    try {
        parsedUrl = new URL(imageUrl);
    } catch {
        throw new Error('Enter a valid HTTPS image URL, or leave this field blank.');
    }

    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
        throw new Error('The verification image URL must use HTTPS and cannot contain credentials.');
    }

    return parsedUrl.href;
}

export function buildVerificationPanelPayload(config = {}) {
    const embed = new EmbedBuilder()
        .setTitle(config.title || botConfig.verification.defaultTitle)
        .setDescription(config.message || botConfig.verification.defaultMessage)
        .setColor(getColor('success'));
    const imageUrl = normalizeVerificationImageUrl(config.imageUrl);

    if (imageUrl) embed.setImage(imageUrl);

    const isRoblox = config.mode === 'roblox';
    const button = new ButtonBuilder()
        .setCustomId('verify_user')
        .setLabel(config.buttonText || botConfig.verification.defaultButtonText)
        .setStyle(isRoblox ? ButtonStyle.Primary : ButtonStyle.Success)
        .setEmoji(isRoblox ? '🌐' : '✅');

    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
    };
}
