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
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getCommandPrefix } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

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
    const guildConfig = guildId ? await getGuildConfig(client, guildId) : null;
    const prefix = guildConfig?.prefix || getCommandPrefix();
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
        description: `Set up your server, pick what to enable, then browse commands below. Prefix commands start with \`${prefix}\`.`,
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 Getting Started',
                value: [
                    `**1. Launch setup** — Run \`${prefix}configwizard\` to configure prefix, mod role, and logs.`,
                    `**2. Enable systems** — Use \`${prefix}commands dashboard\` to turn categories on or off.`,
                    '**3. Browse commands** — Use the menu below to view categories and commands.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ How It Works',
                value: [
                    '• Dashboard commands manage each feature visually',
                    '• Settings are saved per server',
                    `• Prefix commands use \`${prefix}\` and follow your server settings`,
                    '• Command access settings apply to both command styles',
                ].join('\n'),
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "Made with ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

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
                    title: "Help menu closed",
                    description: `Help menu has been closed, use \`${guildConfig?.prefix || getCommandPrefix()}help\` again.`,
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