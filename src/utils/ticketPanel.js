import { getColor } from '../config/bot.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';

export const MAX_TICKET_PANEL_BUTTONS = 5;
export const DEFAULT_FIRST_BUTTON_EMOJI = '📩';
const DEFAULT_BUTTON_LABEL = 'Create Ticket';
const DEFAULT_PANEL_MESSAGE = 'Click the button below to create a support ticket.';

function normalizePanelButtonEntry(entry, index = 0) {
    if (typeof entry === 'string') {
        const label = entry.trim();
        if (!label) return null;
        return {
            label,
            emoji: index === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null,
        };
    }

    if (entry && typeof entry === 'object') {
        const label = String(entry.label || '').trim();
        if (!label) return null;
        const emoji = String(entry.emoji || '').trim() || (index === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null);
        return { label, emoji };
    }

    return null;
}

export function getTicketPanelButtons(config) {
    if (Array.isArray(config?.ticketPanelButtons) && config.ticketPanelButtons.length > 0) {
        return config.ticketPanelButtons
            .map((entry, index) => normalizePanelButtonEntry(entry, index))
            .filter(Boolean)
            .slice(0, MAX_TICKET_PANEL_BUTTONS)
            .map((button, index) => ({
                label: button.label,
                emoji: button.emoji || (index === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null),
            }));
    }

    if (config?.ticketButtonLabel) {
        const legacy = String(config.ticketButtonLabel).trim();
        return [{ label: legacy || DEFAULT_BUTTON_LABEL, emoji: DEFAULT_FIRST_BUTTON_EMOJI }];
    }

    return [{ label: DEFAULT_BUTTON_LABEL, emoji: DEFAULT_FIRST_BUTTON_EMOJI }];
}

/** @deprecated Use getTicketPanelButtons */
export function getTicketPanelButtonLabels(config) {
    return getTicketPanelButtons(config).map((button) => button.label);
}

export function normalizeTicketPanelConfig(config) {
    const buttons = getTicketPanelButtons(config);
    config.ticketPanelButtons = buttons;
    config.ticketButtonLabel = buttons[0]?.label ?? DEFAULT_BUTTON_LABEL;
    return config;
}

export function getTicketPanelButtonCustomId(index, totalButtons) {
    if (totalButtons === 1 && index === 0) return 'create_ticket';
    return `create_ticket:${index}`;
}

export function isTicketPanelButtonCustomId(customId) {
    if (!customId) return false;
    if (customId === 'create_ticket') return true;
    return /^create_ticket:\d+$/.test(customId);
}

export const TICKET_PANEL_EMOJI_OPTIONS = [
    { label: 'Envelope', value: 'preset:envelope', emoji: '📩' },
    { label: 'Ticket', value: 'preset:ticket', emoji: '🎫' },
    { label: 'Chat', value: 'preset:chat', emoji: '💬' },
    { label: 'Shield', value: 'preset:shield', emoji: '🛡️' },
    { label: 'Card', value: 'preset:card', emoji: '💳' },
    { label: 'Question', value: 'preset:question', emoji: '❓' },
    { label: 'Bug', value: 'preset:bug', emoji: '🐛' },
    { label: 'Clipboard', value: 'preset:clipboard', emoji: '📋' },
    { label: 'SOS', value: 'preset:sos', emoji: '🆘' },
    { label: 'Gear', value: 'preset:gear', emoji: '⚙️' },
    { label: 'Wrench', value: 'preset:wrench', emoji: '🔧' },
    { label: 'Phone', value: 'preset:phone', emoji: '📞' },
    { label: 'Alert', value: 'preset:alert', emoji: '🚨' },
    { label: 'Star', value: 'preset:star', emoji: '⭐' },
    { label: 'No emoji', value: 'preset:none' },
];

export function emojiToPresetValue(emoji, buttonIndex = 0) {
    if (!emoji) {
        return buttonIndex === 0 ? 'preset:envelope' : 'preset:none';
    }

    const option = TICKET_PANEL_EMOJI_OPTIONS.find((entry) => entry.emoji === emoji);
    return option?.value ?? (buttonIndex === 0 ? 'preset:envelope' : 'preset:none');
}

export function resolveTicketPanelEmojiPreset(value, buttonIndex = 0) {
    if (!value || value === 'preset:none') {
        return buttonIndex === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null;
    }

    const option = TICKET_PANEL_EMOJI_OPTIONS.find((entry) => entry.value === value);
    return option?.emoji ?? (buttonIndex === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null);
}

export const TICKET_PANEL_EMOJI_KEYWORDS = {
    ticket: '🎫',
    mail: '📩',
    envelope: '📩',
    support: '💬',
    chat: '💬',
    billing: '💳',
    card: '💳',
    help: '❓',
    question: '❓',
    bug: '🐛',
    staff: '🛡️',
    shield: '🛡️',
    sos: '🆘',
    alert: '🚨',
    gear: '⚙️',
    settings: '⚙️',
    wrench: '🔧',
    phone: '📞',
    star: '⭐',
    clipboard: '📋',
};

const LEADING_EMOJI_PATTERN =
    /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+(.+)$/u;

export function formatPanelButtonCombinedValue(button) {
    if (!button?.label) return '';
    if (!button.emoji) return button.label;
    return `${button.emoji} ${button.label}`;
}

export function parsePanelButtonCombinedField(raw, buttonIndex = 0) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
        if (buttonIndex === 0) {
            return { ok: false, error: 'Button 1 is required.' };
        }
        return { ok: true, skip: true };
    }

    const keywordParts = trimmed.split(/\s+/);
    const keyword = keywordParts[0]?.toLowerCase();
    if (keywordParts.length > 1 && TICKET_PANEL_EMOJI_KEYWORDS[keyword]) {
        const label = keywordParts.slice(1).join(' ').trim();
        if (!label) {
            return { ok: false, error: `Button ${buttonIndex + 1} needs text after the emoji keyword.` };
        }
        if (label.length > 80) {
            return { ok: false, error: `Button ${buttonIndex + 1} label must be **80 characters** or fewer.` };
        }
        return {
            ok: true,
            label,
            emoji: TICKET_PANEL_EMOJI_KEYWORDS[keyword],
        };
    }

    const emojiMatch = trimmed.match(LEADING_EMOJI_PATTERN);
    if (emojiMatch) {
        const label = emojiMatch[2].trim();
        if (!label) {
            return { ok: false, error: `Button ${buttonIndex + 1} needs text after the emoji.` };
        }
        if (label.length > 80) {
            return { ok: false, error: `Button ${buttonIndex + 1} label must be **80 characters** or fewer.` };
        }
        return { ok: true, label, emoji: emojiMatch[1] };
    }

    if (trimmed.length > 80) {
        return { ok: false, error: `Button ${buttonIndex + 1} label must be **80 characters** or fewer.` };
    }

    return {
        ok: true,
        label: trimmed,
        emoji: buttonIndex === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null,
    };
}

export function parsePanelButtonCombinedFields(fields) {
    const buttons = [];

    for (let index = 1; index <= MAX_TICKET_PANEL_BUTTONS; index += 1) {
        const parsed = parsePanelButtonCombinedField(fields.getTextInputValue(`btn_${index}_combined`), index - 1);
        if (!parsed.ok) {
            return parsed;
        }
        if (parsed.skip) continue;
        buttons.push({ label: parsed.label, emoji: parsed.emoji });
    }

    if (buttons.length === 0) {
        return { ok: false, error: 'Enter at least one panel button.' };
    }

    return { ok: true, buttons };
}

export function buildTicketPanelEmojiSelectMenu(buttonIndex, buttonLabel, currentEmoji) {
    const currentValue = emojiToPresetValue(currentEmoji, buttonIndex);

    const options = TICKET_PANEL_EMOJI_OPTIONS.map((entry) => {
        const option = new StringSelectMenuOptionBuilder()
            .setLabel(entry.label)
            .setValue(entry.value);

        if (entry.emoji) {
            option.setEmoji(entry.emoji);
        }

        if (entry.value === currentValue) {
            option.setDefault(true);
        }

        return option;
    });

    return {
        options,
    };
}

export function buildTicketPanelEmojiPickerRows(guildId, labels, guildConfig) {
    const currentButtons = getTicketPanelButtons(guildConfig);
    const rows = [];

    for (let index = 0; index < labels.length; index += 1) {
        const menuConfig = buildTicketPanelEmojiSelectMenu(
            index,
            labels[index],
            currentButtons[index]?.emoji,
        );

        const select = new StringSelectMenuBuilder()
            .setCustomId(`ticket_panel_emoji_${index}_${guildId}`)
            .setPlaceholder(`Emoji for "${labels[index].slice(0, 80)}"`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(menuConfig.options);

        rows.push(new ActionRowBuilder().addComponents(select));
    }

    return rows;
}

export function buildTicketPanelEmojiSaveRow(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_panel_emoji_save_${guildId}`)
            .setLabel('Save Buttons')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
    );
}

export function parseTicketPanelEmojiSelectCustomId(customId) {
    const match = String(customId || '').match(/^ticket_panel_emoji_(\d+)_/);
    if (!match) return null;
    return Number.parseInt(match[1], 10);
}

export function buildTicketPanelEmbed(config) {
    const embed = new EmbedBuilder()
        .setTitle('Support Tickets')
        .setDescription(config.ticketPanelMessage || DEFAULT_PANEL_MESSAGE)
        .setColor(getColor('info'));

    if (config.ticketPanelImage) {
        embed.setImage(config.ticketPanelImage);
    }

    return embed;
}

export function buildTicketPanelEmbeds(config) {
    return [buildTicketPanelEmbed(config)];
}

function applyButtonEmoji(button, emoji, index) {
    const resolved = emoji || (index === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null);
    if (resolved) {
        button.setEmoji(resolved);
    }
    return button;
}

export function buildTicketPanelButtonRows(config) {
    const buttons = getTicketPanelButtons(config);
    const rows = [];
    let currentRow = new ActionRowBuilder();

    buttons.forEach((entry, index) => {
        const button = applyButtonEmoji(
            new ButtonBuilder()
                .setCustomId(getTicketPanelButtonCustomId(index, buttons.length))
                .setLabel(entry.label.slice(0, 80))
                .setStyle(ButtonStyle.Primary),
            entry.emoji,
            index,
        );

        currentRow.addComponents(button);

        if (currentRow.components.length >= MAX_TICKET_PANEL_BUTTONS) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

export function validatePanelImageUrl(imageUrl) {
    if (!imageUrl) return { ok: true, url: null };
    try {
        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { ok: false, error: 'Image URL must start with `http://` or `https://`.' };
        }
        return { ok: true, url: imageUrl };
    } catch {
        return { ok: false, error: 'Please provide a valid image URL.' };
    }
}

export function formatTicketPanelButtonsDisplay(config) {
    const buttons = getTicketPanelButtons(config);
    if (buttons.length === 1) {
        const emojiPrefix = buttons[0].emoji ? `${buttons[0].emoji} ` : '';
        return `${emojiPrefix}\`${buttons[0].label}\``;
    }

    return buttons
        .map((button, index) => {
            const emojiPrefix = button.emoji ? `${button.emoji} ` : '';
            return `${index + 1}. ${emojiPrefix}\`${button.label}\``;
        })
        .join('\n');
}

export function parsePanelButtonLabelFields(fields) {
    const labels = [];

    for (let index = 1; index <= MAX_TICKET_PANEL_BUTTONS; index += 1) {
        const raw = fields.getTextInputValue(`btn_${index}_label`).trim();
        if (!raw) {
            if (index === 1) {
                return { ok: false, error: 'Button 1 label is required.' };
            }
            continue;
        }

        if (raw.length > 80) {
            return { ok: false, error: `Button ${index} label must be **80 characters** or fewer.` };
        }

        labels.push(raw);
    }

    return { ok: true, labels };
}

export function parsePanelButtonEmojiSelectFields(fields, labelCount) {
    const emojis = [];

    for (let index = 1; index <= labelCount; index += 1) {
        const [selectedValue] = fields.getStringSelectValues(`btn_${index}_emoji`);
        emojis.push(resolveTicketPanelEmojiPreset(selectedValue, index - 1));
    }

    return { ok: true, emojis };
}

export function mergePanelButtons(labels, emojis = []) {
    return labels.map((label, index) => ({
        label,
        emoji: emojis[index] || (index === 0 ? DEFAULT_FIRST_BUTTON_EMOJI : null),
    }));
}
