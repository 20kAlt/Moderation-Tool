import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const WORD_LIMIT = 500;
const WORD_LENGTH_LIMIT = 64;

function normalizeWord(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const compact = value
        .normalize('NFKC')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
        .trim()
        .toLowerCase();

    if (!compact) {
        return null;
    }

    const sanitized = compact.replace(/\s+/g, ' ');
    if (sanitized.length > WORD_LENGTH_LIMIT) {
        return null;
    }

    return sanitized;
}

export function sanitizeBlockedWords(words = []) {
    if (!Array.isArray(words)) {
        return [];
    }

    const uniqueWords = new Set();

    for (const word of words) {
        const normalized = normalizeWord(word);
        if (!normalized) {
            continue;
        }

        uniqueWords.add(normalized);
    }

    return [...uniqueWords].slice(0, WORD_LIMIT);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findBlockedWord(content, blockedWords) {
    if (!content || !Array.isArray(blockedWords) || blockedWords.length === 0) {
        return null;
    }

    const normalizedContent = content
        .normalize('NFKC')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
        .toLowerCase();

    for (const blockedWord of blockedWords) {
        const candidate = normalizeWord(blockedWord);
        if (!candidate) {
            continue;
        }

        const escaped = escapeRegex(candidate);
        const regex = /\s/.test(candidate)
            ? new RegExp(escaped, 'i')
            : new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');

        if (regex.test(normalizedContent)) {
            return candidate;
        }
    }

    return null;
}

export async function getBlockedWordConfig(client, guildId) {
    try {
        const guildConfig = await getGuildConfig(client, guildId);
        const wordBlocker = guildConfig?.wordBlocker ?? { enabled: true, words: [] };

        return {
            enabled: wordBlocker.enabled !== false,
            words: sanitizeBlockedWords(wordBlocker.words),
        };
    } catch (error) {
        logger.error(`Failed to load blocked word config for guild ${guildId}:`, error);
        return { enabled: true, words: [] };
    }
}

export async function getBlockedWords(client, guildId) {
    const config = await getBlockedWordConfig(client, guildId);
    return config.words;
}

export async function addBlockedWord(client, guildId, word) {
    const normalized = normalizeWord(word);
    if (!normalized) {
        return { added: false, reason: 'invalid_word', words: [] };
    }

    const guildConfig = await getGuildConfig(client, guildId);
    const existingWords = sanitizeBlockedWords(guildConfig?.wordBlocker?.words ?? []);

    if (existingWords.includes(normalized)) {
        return { added: false, reason: 'already_exists', words: existingWords };
    }

    const updatedWords = [...existingWords, normalized].slice(0, WORD_LIMIT);
    const updatedConfig = {
        ...guildConfig,
        wordBlocker: {
            ...(guildConfig?.wordBlocker ?? {}),
            enabled: true,
            words: updatedWords,
        },
    };

    await setGuildConfig(client, guildId, updatedConfig);
    return { added: true, reason: null, words: updatedWords };
}

export async function removeBlockedWord(client, guildId, word) {
    const normalized = normalizeWord(word);
    if (!normalized) {
        return { removed: false, reason: 'invalid_word', words: [] };
    }

    const guildConfig = await getGuildConfig(client, guildId);
    const existingWords = sanitizeBlockedWords(guildConfig?.wordBlocker?.words ?? []);
    const filteredWords = existingWords.filter((entry) => entry !== normalized);

    if (filteredWords.length === existingWords.length) {
        return { removed: false, reason: 'not_found', words: existingWords };
    }

    const updatedConfig = {
        ...guildConfig,
        wordBlocker: {
            ...(guildConfig?.wordBlocker ?? {}),
            enabled: true,
            words: filteredWords,
        },
    };

    await setGuildConfig(client, guildId, updatedConfig);
    return { removed: true, reason: null, words: filteredWords };
}
