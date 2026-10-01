import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`Not set`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Not set`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Not configured`';
    }

    const typeLabels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primary \`${colors.primary}\` · Success \`${colors.success}\``,
        `⚠️ Warning \`${colors.warning}\` · Error \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    return createEmbed({
        title: '⚙️ Server Configuration',
        description: `Core settings for **${guild.name}**. Select a setting below to edit it.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Command Prefix',
                value: `\`${getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator Role',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Log Channel',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '🛡️ Protection',
                value: `Enabled: **${config.protection?.enabled ? 'Yes' : 'No'}**\nAlert: ${formatChannelMention(guild, config.protection?.alertChannelId)}\nRaid: **${config.protection?.raid?.joinThreshold ?? 8} / ${config.protection?.raid?.windowSeconds ?? 10}s**\nAnti-nuke: **${config.protection?.antiNuke?.actionThreshold ?? 3} / ${config.protection?.antiNuke?.windowSeconds ?? 10}s**`,
                inline: false,
            },
            {
                name: '💚 Bot Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed Theme',
                value: `${getThemeColorLines()}\n-# Colors are set in bot config and apply globally.`,
                inline: false,
            },
            {
                name: '⚡ Command Access',
                value: `Optional command categories start disabled on new servers. Use \`${getCommandPrefix()}commands dashboard\` to enable the features you want. Setup controls stay available.`,
                inline: false,
            },
        ],
        footer: 'Dashboard closes after 10 minutes of inactivity',
    });
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildSettingsSelect(guild.id)];
    await rootInteraction.editReply({ embeds: [embed], components }).catch(() => {});
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Select a setting to edit...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator Role')
                    .setDescription('Role used for moderation commands')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log Channel')
                    .setDescription('Channel for system log messages')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Protection')
                    .setDescription('Raid and anti-nuke server protection')
                    .setValue('protectionEnabled')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Protection Alert Channel')
                    .setDescription('Where raid and nuke alerts are sent')
                    .setValue('protectionAlertChannel')
                    .setEmoji('🚨'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Raid Join Threshold')
                    .setDescription('Rapid joins inside the raid window')
                    .setValue('raidJoinThreshold')
                    .setEmoji('👥'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Raid Window')
                    .setDescription('Seconds to watch for raid joins')
                    .setValue('raidWindowSeconds')
                    .setEmoji('⏱️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Anti-Nuke Threshold')
                    .setDescription('Destructive actions before a timeout')
                    .setValue('antiNukeActionThreshold')
                    .setEmoji('⚠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Anti-Nuke Timeout')
                    .setDescription('Minutes to timeout a suspicious user')
                    .setValue('antiNukeTimeoutMinutes')
                    .setEmoji('🧊'),
            ),
    );
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Update Log Channel');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Select a text channel...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Log Channel')
            .setDescription('Channel where system log messages will be sent')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Update Moderator Role');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Select a moderator role...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Moderator Role')
            .setDescription('Role used for moderation commands')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'protectionAlertChannel') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🚨 Update Protection Alert Channel');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('protection_alert_channel')
            .setPlaceholder('Select a text channel...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Alert Channel')
            .setDescription('Where raid and anti-nuke alerts are posted')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const numericSettings = new Set([
        'raidJoinThreshold',
        'raidWindowSeconds',
        'antiNukeActionThreshold',
        'antiNukeWindowSeconds',
        'antiNukeTimeoutMinutes',
    ]);

    if (setting === 'protectionEnabled' || numericSettings.has(setting)) {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle(
                setting === 'protectionEnabled'
                    ? '🛡️ Toggle Protection'
                    : '⚙️ Update Protection Setting'
            );

        const input = new TextInputBuilder()
            .setCustomId(setting)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(setting === 'protectionEnabled' ? 'true or false' : 'Enter a number')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(setting === 'protectionEnabled' ? 5 : 4);

        const label = new LabelBuilder()
            .setLabel(setting === 'protectionEnabled' ? 'Enable Protection' : 'Value')
            .setDescription(setting === 'protectionEnabled' ? 'Use true to enable server protection' : 'Set the numeric value for this protection setting')
            .setTextInputComponent(input);

        modal.addLabelComponents(label);
        await selectInteraction.showModal(modal);
        return;
    }

    throw new Error('Unknown server setting.');
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Please select a log channel.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Please select a moderator role.');
        }
        return roleId;
    }

    if (setting === 'protectionAlertChannel') {
        const channelId = submitted.fields.getField('protection_alert_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Please select an alert channel.');
        }
        return channelId;
    }

    if (setting === 'protectionEnabled') {
        const value = submitted.fields.getTextInputValue(setting)?.trim().toLowerCase();
        if (value !== 'true' && value !== 'false') {
            throw new Error('Protection must be set to true or false.');
        }
        return value === 'true';
    }

    if (
        setting === 'raidJoinThreshold' ||
        setting === 'raidWindowSeconds' ||
        setting === 'antiNukeActionThreshold' ||
        setting === 'antiNukeWindowSeconds' ||
        setting === 'antiNukeTimeoutMinutes'
    ) {
        const raw = Number(submitted.fields.getTextInputValue(setting));
        if (!Number.isInteger(raw)) {
            throw new Error('This setting must be a whole number.');
        }
        return raw;
    }

    throw new Error('Unknown server setting.');
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Log channel set to ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Moderator role set to ${role ?? `<@&${value}>`}.`;
    }

    if (setting === 'protectionAlertChannel') {
        const channel = guild.channels.cache.get(value);
        return `Protection alerts will be sent to ${channel ?? `<#${value}>`}.`;
    }

    if (setting === 'protectionEnabled') {
        return `Protection is now ${value ? 'enabled' : 'disabled'}.`;
    }

    if (setting === 'raidJoinThreshold') {
        return `Raid join threshold set to ${value}.`;
    }

    if (setting === 'raidWindowSeconds') {
        return `Raid window set to ${value} seconds.`;
    }

    if (setting === 'antiNukeActionThreshold') {
        return `Anti-nuke threshold set to ${value} actions.`;
    }

    if (setting === 'antiNukeWindowSeconds') {
        return `Anti-nuke window set to ${value} seconds.`;
    }

    if (setting === 'antiNukeTimeoutMinutes') {
        return `Anti-nuke timeout set to ${value} minutes.`;
    }

    throw new Error('Unknown server setting.');
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        const currentConfig = await getGuildConfig(client, guildId);
        const nextProtection = { ...currentConfig.protection };

        if (setting === 'protectionEnabled') {
            nextProtection.enabled = value;
        } else if (setting === 'protectionAlertChannel') {
            nextProtection.alertChannelId = value;
        } else if (setting === 'raidJoinThreshold') {
            nextProtection.raid = { ...nextProtection.raid, joinThreshold: value };
        } else if (setting === 'raidWindowSeconds') {
            nextProtection.raid = { ...nextProtection.raid, windowSeconds: value };
        } else if (setting === 'antiNukeActionThreshold') {
            nextProtection.antiNuke = { ...nextProtection.antiNuke, actionThreshold: value };
        } else if (setting === 'antiNukeWindowSeconds') {
            nextProtection.antiNuke = { ...nextProtection.antiNuke, windowSeconds: value };
        } else if (setting === 'antiNukeTimeoutMinutes') {
            nextProtection.antiNuke = { ...nextProtection.antiNuke, timeoutMinutes: value };
        } else {
            await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);
            await submitted.reply({
                embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))],
                flags: MessageFlags.Ephemeral,
            });
            const updatedConfig = await getGuildConfig(client, guildId);
            await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
            return;
        }

        await patchGuildConfig(client, guildId, { protection: nextProtection });

        await submitted.reply({
            embeds: [successEmbed('Configuration Updated', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Config wizard modal submit error:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Please try again.',
        }).catch(() => {});
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Open the server configuration dashboard')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'You need the **Manage Server** permission to use this command.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildSettingsSelect(interaction.guildId)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId === `${DASHBOARD_CUSTOM_ID}:${interaction.guildId}`;

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Config dashboard interaction error:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Failed to process your selection. Please try again.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Config command error:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Failed to open configuration dashboard. Please try again.',
            });
        }
    },
};
