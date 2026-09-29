import { BotConfig, getCommandPrefix } from '../bot.js';
import { DEFAULT_GUILD_CONFIG } from '../../utils/constants.js';

/**
 * Single source of truth for guild config default values.
 * Used by the guild config service and database read path.
 */
export const GUILD_CONFIG_DEFAULTS = {
    ...DEFAULT_GUILD_CONFIG,
    prefix: getCommandPrefix(),
    welcomeMessage: BotConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!',
    dmOnClose: true,
    disabledCommands: {},
    disabledCategories: {
        core: true,
        birthday: true,
        community: true,
        economy: true,
        fun: true,
        giveaway: true,
        jointocreate: true,
        leveling: true,
        logging: true,
        music: true,
        reaction_roles: true,
        search: true,
        serverstats: true,
        ticket: true,
        tools: true,
        utility: true,
        verification: true,
        welcome: true,
    },
};
