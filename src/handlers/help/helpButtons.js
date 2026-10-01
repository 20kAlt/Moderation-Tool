import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import { createInitialHelpMenu } from '../../commands/Core/help.js';
import { logger } from '../../utils/logger.js';
import configWizard from '../../commands/Core/configWizard.js';
import { openCommandAccessDashboard } from '../../commands/Core/commands.js';

const BACK_BUTTON_ID = "help-back-to-main";
const PAGINATION_PREFIX = "help-page";
const SERVER_SETTINGS_BUTTON_ID = "help-server-settings";
const COMMAND_ACCESS_BUTTON_ID = "help-command-access";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client, interaction.guildId);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help back button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};

export const helpServerSettingsButton = {
    name: SERVER_SETTINGS_BUTTON_ID,
    async execute(interaction, client) {
        await configWizard.execute(interaction, null, client);
    },
};

export const helpCommandAccessButton = {
    name: COMMAND_ACCESS_BUTTON_ID,
    async execute(interaction, client) {
        await openCommandAccessDashboard(interaction, client);
    },
};

export const helpReportBugButton = {
    name: 'help-report-bug',
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return InteractionHelper.safeReply(interaction, {
                content: 'Please open `/help` in a server to report a bug.',
            });
        }

        const bugInput = new TextInputBuilder()
            .setCustomId('bug')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('What happened, and what did you expect to happen?')
            .setMinLength(10)
            .setMaxLength(1800)
            .setRequired(true);
        const proofInput = new TextInputBuilder()
            .setCustomId('proof')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Optional image URL or link to a screenshot/video')
            .setMaxLength(1000)
            .setRequired(false);
        const modal = new ModalBuilder()
            .setCustomId('help_bug_report_modal')
            .setTitle('Report a Bug')
            .addLabelComponents(
                new LabelBuilder().setLabel('Bug details').setDescription('Include what you did and what went wrong.').setTextInputComponent(bugInput),
                new LabelBuilder().setLabel('Proof (optional)').setDescription('Paste an image URL for a preview, or any link to open as proof.').setTextInputComponent(proofInput),
            );

        await InteractionHelper.safeShowModal(interaction, modal);
    },
};

function getPaginationInfo(components) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = component.label || '';
                const match = label.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
                if (match) {
                    return {
                        currentPage: Number(match[1]),
                        totalPages: Number(match[2]),
                    };
                }
            }
        }
    }

    return { currentPage: 1, totalPages: 1 };
}

export const helpPaginationButton = {
    name: `${PAGINATION_PREFIX}_next`,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components);

            let nextPage = currentPage;
            switch (interaction.customId) {
                case `${PAGINATION_PREFIX}_first`:
                    nextPage = 1;
                    break;
                case `${PAGINATION_PREFIX}_prev`:
                    nextPage = Math.max(1, currentPage - 1);
                    break;
                case `${PAGINATION_PREFIX}_next`:
                    nextPage = Math.min(totalPages, currentPage + 1);
                    break;
                case `${PAGINATION_PREFIX}_last`:
                    nextPage = totalPages;
                    break;
                default:
                    nextPage = currentPage;
                    break;
            }

            const { embeds, components } = await createAllCommandsMenu(nextPage, client, interaction.guildId);
            await interaction.editReply({ embeds, components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help pagination interaction already acknowledged or expired.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};