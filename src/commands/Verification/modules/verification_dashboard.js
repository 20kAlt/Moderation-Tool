import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { ModerationToolError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';
import { buildVerificationPanelPayload, normalizeVerificationImageUrl } from '../../../utils/verificationPanel.js';
import { isRobloxOAuthConfigured } from '../../../services/robloxVerificationService.js';

async function updateLivePanel(guild, cfg) {
    if (!cfg.channelId || !cfg.messageId) return;
    try {
        const channel = guild.channels.cache.get(cfg.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        await msg.edit(buildVerificationPanelPayload(cfg));
    } catch (error) {
        logger.warn('Could not update live verification panel:', error.message);
    }
}

function buildDashboardEmbed(cfg, guild, verifiedUserCount = 0, conflictSummary = '', panelStatus = null) {
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`Not set`';
    const role = cfg.roleId ? `<@&${cfg.roleId}>` : '`Not set`';
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelTitle = cfg.title || botConfig.verification.defaultTitle;
    const panelStatusValue = cfg.channelId ? formatPanelStatusField(panelStatus) : '`Not configured`';

    const embed = new EmbedBuilder()
        .setTitle('✅ Verification System Dashboard')
        .setDescription(`Manage verification settings for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Panel Status', value: panelStatusValue, inline: false },
            { name: 'Verification Channel', value: channel, inline: true },
            { name: 'Verified Role', value: role, inline: true },
            { name: 'System Status', value: cfg.enabled !== false ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Verification Mode', value: cfg.mode === 'roblox' ? 'Roblox account linking' : 'Standard', inline: true },
            { name: 'Panel Title', value: `\`${panelTitle}\``, inline: true },
            { name: 'Button Text', value: `\`${buttonText}\``, inline: true },
            { name: 'Verified Users', value: `${verifiedUserCount} users`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Verification Message', value: msgPreview, inline: false },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Setup Conflicts', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Use Standard Verification')
                .setDescription('Verify members with one button click')
                .setValue('mode_standard')
                .setEmoji('✅'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Use Roblox Account Linking')
                .setDescription('Require members to sign in to Roblox')
                .setValue('mode_roblox')
                .setEmoji('🌐'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Panel Title')
                .setDescription('Change the title at the top of the panel')
                .setValue('title')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Verification Channel')
                .setDescription('Set the channel where the verification panel is posted')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Verified Role')
                .setDescription('Set the role assigned when a user verifies')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Verification Message')
                .setDescription('Customise the message shown on the verification panel embed')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Button Text')
                .setDescription('Change the label on the verify button')
                .setValue('button_text')
                .setEmoji('🔘'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Panel Image')
                .setDescription('Set or remove the optional panel image')
                .setValue('image_url')
                .setEmoji('🖼️'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false, panelStatus = null) {
    const systemOn = cfg.enabled !== false;
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)
                .setLabel('Repost Panel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)
            .setLabel('Verification')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🔒')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function repostVerificationPanel(guild, cfg) {
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel) {
        throw new ModerationToolError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'The configured verification channel no longer exists. Set a new channel from the dashboard.',
        );
    }

    return channel.send(buildVerificationPanelPayload(cfg));
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let verifiedUserCount = 0;
        let conflictSummary = '';
        let panelStatus = null;

        if (cfg.channelId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild, cfg);
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;
                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);
            }
        }
        
        try {
            const verifiedRole = rootInteraction.guild.roles.cache.get(cfg.roleId);
            if (verifiedRole) {
                verifiedUserCount = verifiedRole.members.size;
            }
            
            const guildConfig = await getGuildConfig(client, guildId);
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                autoVerifyEnabled ? 'AutoVerify is enabled' : null,
                autoRoleConfigured ? 'AutoRole is configured' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Could not fetch verification dashboard details:', error.message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, verifiedUserCount, conflictSummary, panelStatus)],
            components: [
                buildButtonRow(cfg, guildId, false, panelStatus),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Could not refresh verification dashboard (interaction may have expired):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = guildConfig.verification;

            if (!cfg?.channelId) {
                throw new ModerationToolError(
                    'Verification not configured',
                    ErrorTypes.CONFIGURATION,
                    'The verification system has not been set up yet. Run `/verification setup` first.',
                );
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let verifiedUserCount = 0;
            let conflictSummary = '';
            let panelStatus = null;

            if (cfg.channelId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild, cfg);
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;
                    guildConfig.verification = cfg;
                    await setGuildConfig(client, guildId, guildConfig);
                }
            }
            
            try {
                const verifiedRole = interaction.guild.roles.cache.get(cfg.roleId);
                if (verifiedRole) {
                    verifiedUserCount = verifiedRole.members.size;
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    autoVerifyEnabled ? 'AutoVerify is enabled' : null,
                    autoRoleConfigured ? 'AutoRole is configured' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Could not fetch verification dashboard details:', error.message);
            }

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild, verifiedUserCount, conflictSummary, panelStatus)],
                components: [
                    buildButtonRow(cfg, guildId, false, panelStatus),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],
                flags: MessageFlags.Ephemeral,
                selectMenuId: `verif_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `verif_cfg_toggle_${guildId}` || customId === `verif_cfg_repost_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'role':
                            await handleRole(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleTextSetting(selectInteraction, interaction, cfg, guildId, client, {
                                key: 'message',
                                customId: 'verif_cfg_message',
                                modalTitle: 'Edit Verification Description',
                                label: 'Description shown on the panel',
                                value: cfg.message || botConfig.verification.defaultMessage,
                                maxLength: 2000,
                                style: TextInputStyle.Paragraph,
                                successTitle: 'Description Updated',
                                successMessage: 'The verification panel description has been updated.',
                            });
                            break;
                        case 'button_text':
                            await handleTextSetting(selectInteraction, interaction, cfg, guildId, client, {
                                key: 'buttonText',
                                customId: 'verif_cfg_button_text',
                                modalTitle: 'Edit Button Text',
                                label: 'Button label (max 80 characters)',
                                value: cfg.buttonText || botConfig.verification.defaultButtonText,
                                maxLength: 80,
                                style: TextInputStyle.Short,
                                successTitle: 'Button Text Updated',
                                successMessage: () => `The verify button now reads **${cfg.buttonText}**.`,
                            });
                            break;
                        case 'title':
                            await handleTextSetting(selectInteraction, interaction, cfg, guildId, client, {
                                key: 'title',
                                customId: 'verif_cfg_title',
                                modalTitle: 'Edit Verification Panel Title',
                                label: 'Panel title (max 256 characters)',
                                value: cfg.title || botConfig.verification.defaultTitle,
                                maxLength: 256,
                                style: TextInputStyle.Short,
                                successTitle: 'Panel Title Updated',
                                successMessage: () => `The panel title is now **${cfg.title}**.`,
                            });
                            break;
                        case 'image_url':
                            await handleTextSetting(selectInteraction, interaction, cfg, guildId, client, {
                                key: 'imageUrl',
                                customId: 'verif_cfg_image_url',
                                modalTitle: 'Edit Verification Panel Image',
                                label: 'HTTPS image URL (blank removes the image)',
                                value: cfg.imageUrl || '',
                                maxLength: 500,
                                minLength: 0,
                                style: TextInputStyle.Short,
                                successTitle: 'Panel Image Updated',
                                successMessage: () => cfg.imageUrl
                                    ? 'The verification panel image has been updated.'
                                    : 'The verification panel image has been removed.',
                                validate: normalizeVerificationImageUrl,
                            });
                            break;
                        case 'mode_standard':
                        case 'mode_roblox':
                            await handleVerificationMode(
                                selectInteraction,
                                interaction,
                                cfg,
                                guildId,
                                client,
                                selectedOption === 'mode_roblox' ? 'roblox' : 'standard',
                            );
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                        await btnInteraction.deferUpdate();
                        const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                        cfg.messageId = newMsg.id;
                        const latestConfig = await getGuildConfig(client, guildId);
                        latestConfig.verification = cfg;
                        await setGuildConfig(client, guildId, latestConfig);
                        await btnInteraction.followUp({
                            embeds: [successEmbed('Panel Reposted', `Verification panel restored in ${newMsg.channel}.`)],
                            flags: MessageFlags.Ephemeral,
                        });
                        await refreshDashboard(interaction, cfg, guildId, client);
                        return;
                    }

                    await btnInteraction.deferUpdate().catch(() => null);

                    const wasEnabled = cfg.enabled !== false;
                    const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

                    if (!wasEnabled && autoVerifyEnabled) {
                        await replyUserError(btnInteraction, {
                            type: ErrorTypes.CONFIGURATION,
                            message: 'AutoVerify is currently enabled. Please disable AutoVerify first before enabling the manual Verification system.\n\nRun `/autoverify` to access the AutoVerify dashboard.',
                        });
                        return;
                    }

                    cfg.enabled = !wasEnabled;

                    if (!cfg.enabled && cfg.channelId && cfg.messageId) {
                        const channel = interaction.guild.channels.cache.get(cfg.channelId);
                        if (channel) {
                            const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
                            if (msg) await msg.delete().catch(() => {});
                        }
                    }

                    if (cfg.enabled && cfg.channelId) {
                        try {
                            const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                            cfg.messageId = newMsg.id;
                        } catch (error) {
                            logger.warn('Could not re-post verification panel on re-enable:', error.message);
                        }
                    }

                    const latestConfig = await getGuildConfig(client, guildId);
                    latestConfig.verification = cfg;
                    await setGuildConfig(client, guildId, latestConfig);

                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ System Updated',
                                `The verification system is now **${cfg.enabled ? 'enabled' : 'disabled'}**.`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });

                    await refreshDashboard(interaction, cfg, guildId, client);
                },
                onTimeout: async (rootInteraction) => {
                    await InteractionHelper.safeEditReply(rootInteraction, {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Dashboard Timed Out')
                                .setDescription('This dashboard has been closed due to inactivity. Please run the command again to continue.')
                                .setColor(getColor('error')),
                        ],
                        components: [],
                        flags: MessageFlags.Ephemeral,
                    });
                },
            });
        } catch (error) {
            if (error instanceof ModerationToolError) throw error;
            logger.error('Unexpected error in verification_dashboard:', error);
            throw new ModerationToolError(
                `Verification dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the verification dashboard.',
            );
        }
    },
};

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('verif_cfg_channel')
        .setPlaceholder('Select a text channel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Change Verification Channel')
                .setDescription(
                    `**Current:** ${cfg.channelId ?`<#${cfg.channelId}>`: '`Not set`'}\n\nSelect the channel where the verification panel will be posted.\n\n> ⚠️ The existing panel will be deleted and re-posted in the new channel.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();
        const newChannel = chanInteraction.channels.first();

        if (!botHasPermission(newChannel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
            await replyUserError(chanInteraction, {
                type: ErrorTypes.PERMISSION,
                message: `I need **View Channel**, **Send Messages**, and **Embed Links** permissions in ${newChannel}.`,
            });
            return;
        }

        if (cfg.channelId && cfg.messageId) {
            const oldChannel = rootInteraction.guild.channels.cache.get(cfg.channelId);
            if (oldChannel) {
                try {
                    const oldMsg = await oldChannel.messages.fetch(cfg.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const newMsg = await newChannel.send(buildVerificationPanelPayload(cfg));
                cfg.messageId = newMsg.id;
            } catch (error) {
                logger.warn('Could not post verification panel in new channel:', error.message);
            }
        }

        cfg.channelId = newChannel.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await chanInteraction.followUp({
            embeds: [successEmbed('Channel Updated', `Verification panel moved to ${newChannel}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No channel was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('verif_cfg_role')
        .setPlaceholder('Select a role...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Change Verified Role')
                .setDescription(
                    `**Current:** ${cfg.roleId ?`<@&${cfg.roleId}>`: '`Not set`'}\n\nSelect the role to assign when a user verifies.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();
        const guild = rootInteraction.guild;
        const botMember = guild.members.me;

        if (role.id === guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'Please choose a normal assignable role (not @everyone or a bot-managed role).',
            });
            return;
        }

        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'The verified role must be below my highest role in the server role hierarchy.',
            });
            return;
        }

        cfg.roleId = role.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Role Updated', `Verified role set to ${role}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No role was selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleTextSetting(selectInteraction, rootInteraction, cfg, guildId, client, {
    key,
    customId,
    modalTitle,
    label,
    value,
    maxLength,
    minLength = 1,
    style,
    successTitle,
    successMessage,
    validate = (input) => input.trim(),
}) {
    const input = new TextInputBuilder()
        .setCustomId('setting_input')
        .setLabel(label)
        .setStyle(style)
        .setMaxLength(maxLength)
        .setMinLength(minLength)
        .setRequired(minLength > 0);
    if (value) input.setValue(value);

    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(modalTitle)
        .addComponents(new ActionRowBuilder().addComponents(input));

    await selectInteraction.showModal(modal);
    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === customId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    let valueToSave;
    try {
        valueToSave = validate(submitted.fields.getTextInputValue('setting_input'));
    } catch (error) {
        await replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: error.message,
        });
        return;
    }

    cfg[key] = valueToSave;
    const latestConfig = await getGuildConfig(client, guildId);
    latestConfig.verification = cfg;
    await setGuildConfig(client, guildId, latestConfig);
    await updateLivePanel(rootInteraction.guild, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                successTitle,
                typeof successMessage === 'function' ? successMessage() : successMessage,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });
    await refreshDashboard(rootInteraction, cfg, guildId, client);
}

async function handleVerificationMode(selectInteraction, rootInteraction, cfg, guildId, client, mode) {
    await selectInteraction.deferUpdate();

    if (mode === 'roblox' && !isRobloxOAuthConfigured()) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.CONFIGURATION,
            message: 'Roblox linking needs the bot host to configure ROBLOX_OAUTH_CLIENT_ID, ROBLOX_OAUTH_CLIENT_SECRET, and ROBLOX_OAUTH_REDIRECT_URI first.',
        });
        return;
    }

    if (
        mode === 'roblox' &&
        !rootInteraction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames)
    ) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.PERMISSION,
            message: "I need the 'Manage Nicknames' permission to set verified members' server nicknames to their Roblox display name and username.",
        });
        return;
    }

    cfg.mode = mode;
    const latestConfig = await getGuildConfig(client, guildId);
    latestConfig.verification = cfg;
    await setGuildConfig(client, guildId, latestConfig);
    await updateLivePanel(rootInteraction.guild, cfg);
    await selectInteraction.followUp({
        embeds: [
            successEmbed(
                'Verification Mode Updated',
                `The panel now uses **${mode === 'roblox' ? 'Roblox account linking' : 'standard server verification'}**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });
    await refreshDashboard(rootInteraction, cfg, guildId, client);
}