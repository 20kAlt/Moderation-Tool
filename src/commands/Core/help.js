import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import { getCommandPrefix } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const SERVER_SETTINGS_BUTTON_ID = "help-server-settings";
const COMMAND_ACCESS_BUTTON_ID = "help-command-access";
const HELP_MENU_TIMEOUT_MS = 10 * 60 * 1000;

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
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createInitialHelpMenu(client, guildId = null) {
    const prefix = getCommandPrefix();
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands",
            description: "Browse every available command in a single list",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({
        title: `📖 ${botName} Help`,
        description: `Find commands for this server below. Prefix commands start with \`${prefix}\`; for slash commands, type \`/\` in chat and choose a command from the list.`,
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '📚 Finding Commands',
                value: [
                    '**Browse by category** — Choose a category below to see available commands and examples.',
                    `**Use a prefix command** — Type the server prefix first, then the command (for example, \`${prefix}help\`).`,
                    '**Use a slash command** — Type `/` in chat and select a command from the Discord command list.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ Server Access',
                value: [
                    'Some command categories may be disabled by this server. Ask a server admin to enable them with `/commands dashboard`.',
                    'Server Settings and Command Access below are admin controls; members can still browse and use enabled commands.',
                ].join('\n'),
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "Made with ❤️" 
    });
    embed.setTimestamp();

    const serverSettingsButton = new ButtonBuilder()
        .setCustomId(SERVER_SETTINGS_BUTTON_ID)
        .setLabel("Server Settings (Admins)")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Primary);

    const commandAccessButton = new ButtonBuilder()
        .setCustomId(COMMAND_ACCESS_BUTTON_ID)
        .setLabel("Command Access (Admins)")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Secondary);

    const reportBugButton = new ButtonBuilder()
        .setCustomId('help-report-bug')
        .setLabel('Report bot bug to bot owner')
        .setEmoji('🐞')
        .setStyle(ButtonStyle.Danger);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents(serverSettingsButton, commandAccessButton, reportBugButton);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client, interaction.guildId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "Help menu expired",
                    description: `This menu closes after 10 minutes. To browse commands again, run \`${getCommandPrefix()}help\` or use \`/help\`.\n\nYour server settings and commands are unchanged.`,
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', error?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};