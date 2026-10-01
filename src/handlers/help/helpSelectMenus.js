import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ActionRowBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getCommandPrefix } from '../../config/bot.js';
import { supportsPrefixExecution } from '../../utils/messageAdapter.js';
import { getPrefixRestriction } from '../../config/commands/prefixRestrictions.js';
import { resolveSubcommandAlias } from '../../config/commands/commandAliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Made with ❤️";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
    Config: "⚙️",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildHelpEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];

    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
                category,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            const nestedOptions = option.options || [];
            for (const nested of nestedOptions) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;

                entries.push({
                    baseName,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: nested.description || option.description || baseDescription,
                    category,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            displayName: baseName,
            description: baseDescription,
            category,
        });
    }

    return entries;
}

function buildPrefixHelpEntries(command, category) {
    if (!supportsPrefixExecution(command)) {
        return [];
    }

    const entries = buildHelpEntries(command, category).filter((entry) => {
        const args = entry.displayName === entry.baseName
            ? []
            : entry.displayName.slice(entry.baseName.length).trim().split(/\s+/);
        return !getPrefixRestriction(command, args, resolveSubcommandAlias).blocked;
    });

    return entries.map((entry) => entry.baseName === 'configwizard'
        ? {
            ...entry,
            invocation: 'slash',
            description: 'Configure server settings, including raid and anti-nuke protection.',
        }
        : entry);
}

function formatCommandInvocation(command, prefix) {
    return command.invocation === 'slash'
        ? `/${command.displayName}`
        : `${prefix}${command.displayName}`;
}

async function getConfiguredPrefix(client, guildId) {
    return getCommandPrefix();
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) {
        return null;
    }

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}

async function createCategoryCommandsMenu(category, client, guildId) {
    const prefix = await getConfiguredPrefix(client, guildId);
    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryCommands = [];

    try {
        const categoryPath = path.join(__dirname, "../../commands", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter((file) => file.endsWith(".js"))
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData) {
                if (
                    commandData.name === "help" ||
                    commandData.name === "commandlist"
                )
                    continue;

                categoryCommands.push(...buildPrefixHelpEntries(command, categoryName));
            }
        }
    } catch (error) {
        logger.error(
            `Error reading commands from category ${category}:`,
            error,
        );
    }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `Use \`${prefix}\` for prefix commands; slash commands start with \`/\`.`
            : `No commands found in the **${categoryName}** category.`
    });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands
            .map((cmd) => `\`${formatCommandInvocation(cmd, prefix)}\` · ${cmd.description}`)
            .join("\n");

        const maxLength = 1000;
        if (commandMentions.length <= maxLength) {
            embed.addFields({
                name: "Commands",
                value: commandMentions,
                inline: false,
            });
        } else {
            const chunks = [];
            let currentChunk = "";
            const lines = commandMentions.split("\n");

            for (const line of lines) {
                if ((currentChunk + "\n" + line).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? "\n" : "") + line;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: `Commands (Part ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function createAllCommandsMenu(page = 1, client, guildId) {
    const prefix = await getConfiguredPrefix(client, guildId);
    const commandsPerPage = 45;
    const allCommands = [];

    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    for (const category of categoryDirs) {
        try {
            const categoryPath = path.join(
                __dirname,
                "../../commands",
                category,
            );
            const commandFiles = (await fs.readdir(categoryPath))
                .filter((file) => file.endsWith(".js"))
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData) {
                    if (
                        commandData.name === "help" ||
                        commandData.name === "commandlist"
                    )
                        continue;

                    const categoryName = formatCategoryName(category);

                    allCommands.push(...buildPrefixHelpEntries(command, categoryName));
                }
            }
        } catch (error) {
            logger.error(
                `Error reading commands from category ${category}:`,
                error,
            );
        }
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    const totalPages = Math.ceil(allCommands.length / commandsPerPage);
    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, endIndex);

    const embed = createEmbed({
        title: "📋 All Commands",
        description: `Browse commands. Prefix commands start with \`${prefix}\`; slash commands start with \`/\`.`,
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands.map((cmd) => `\`${formatCommandInvocation(cmd, prefix)}\` · ${cmd.category}`);

        const columnCount = pageCommands.length > 20 ? 3 : (pageCommands.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(commandMentions.length / columnCount);

        for (let i = 0; i < columnCount; i++) {
            const chunk = commandMentions
                .slice(i * chunkSize, (i + 1) * chunkSize)
                .join("\n");

            if (!chunk) continue;

            embed.addFields({
                name: i === 0 ? `Commands (Page ${page})` : "Commands (cont.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            page,
            totalPages,
        );
        components.push(paginationRow);
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);
    components.push(buttonRow);

    return {
        embeds: [embed],
        components,
        currentPage: page,
        totalPages,
    };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client, interaction.guildId);
                await interaction.editReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client, interaction.guildId);
                await interaction.editReply({
                    embeds,
                    components,
                });
            }
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
};