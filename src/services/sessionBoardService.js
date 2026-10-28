export const SESSION_BOARD_STATUSES = ['planned', 'ongoing', 'cancelled'];
export const SESSION_BOARD_CARD_TYPES = ['session', 'training', 'shift'];

export function normalizeSessionStatus(status = 'planned') {
    const normalized = String(status || 'planned').trim().toLowerCase();
    return SESSION_BOARD_STATUSES.includes(normalized) ? normalized : 'planned';
}

export function resolveCardType(cardName = '') {
    const label = String(cardName || '').trim().toLowerCase();

    if (!label) {
        return 'session';
    }

    if (/training/.test(label) || /class/.test(label)) {
        return 'training';
    }

    if (/shift/.test(label) || /schedule/.test(label) || /slot/.test(label)) {
        return 'shift';
    }

    return 'session';
}

export function parseRoleIds(rawRoles = '') {
    if (!rawRoles) {
        return [];
    }

    const stringValue = String(rawRoles).trim();
    if (!stringValue) {
        return [];
    }

    return [...new Set(
        stringValue
            .split(/[\s,]+/)
            .map((entry) => entry.replace(/<@&?|>/g, '').trim())
            .filter(Boolean)
    )];
}

export function canEditSessionBoard(member, guildConfig = {}) {
    if (!member) {
        return false;
    }

    const sessionBoardConfig = guildConfig.sessionBoard || guildConfig;
    const userRoleIds = new Set(member.roles?.cache ? [...member.roles.cache.keys()] : []);
    const hostRoleId = sessionBoardConfig.hostRoleId || null;
    const coHostRoleIds = Array.isArray(sessionBoardConfig.coHostRoleIds)
        ? sessionBoardConfig.coHostRoleIds
        : parseRoleIds(sessionBoardConfig.coHostRoleIds || '');

    if (!hostRoleId && coHostRoleIds.length === 0) {
        return true;
    }

    if (hostRoleId && userRoleIds.has(hostRoleId)) {
        return true;
    }

    return coHostRoleIds.some((roleId) => userRoleIds.has(roleId));
}

export function buildSessionCardDescription({
    title,
    status,
    notes,
    hostName,
    hostRoleName,
    updatedAt,
    sessionKey,
}) {
    const normalizedStatus = normalizeSessionStatus(status);
    const lines = [
        `Session: ${title || 'Roblox Session'}`,
        `Status: ${normalizedStatus}`,
    ];

    if (hostName) {
        lines.push(`Host: ${hostName}`);
    }

    if (hostRoleName) {
        lines.push(`Co-host rank: ${hostRoleName}`);
    }

    if (sessionKey) {
        lines.push(`Session ID: ${sessionKey}`);
    }

    if (notes) {
        lines.push('');
        lines.push(notes.trim());
    }

    lines.push('');
    lines.push(`Updated: ${updatedAt || new Date().toISOString()}`);

    return lines.join('\n');
}

export async function getTrelloBoardCards({ boardId, apiKey, token }) {
    const trelloApiKey = apiKey || process.env.TRELLO_API_KEY;
    const trelloToken = token || process.env.TRELLO_TOKEN;

    if (!boardId || !trelloApiKey || !trelloToken) {
        throw new Error('Missing Trello board configuration. Set TRELLO_API_KEY, TRELLO_TOKEN, and boardId.');
    }

    const boardUrl = `https://api.trello.com/1/boards/${encodeURIComponent(boardId)}/cards?key=${encodeURIComponent(trelloApiKey)}&token=${encodeURIComponent(trelloToken)}`;
    const response = await fetch(boardUrl);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch Trello cards: ${response.status} ${errorText}`);
    }

    const cards = await response.json();
    const listIds = [...new Set((cards || []).map((card) => card?.idList).filter(Boolean))];

    if (listIds.length === 0) {
        return [];
    }

    const listUrl = `https://api.trello.com/1/lists/${listIds.map((id) => encodeURIComponent(id)).join(',')}?key=${encodeURIComponent(trelloApiKey)}&token=${encodeURIComponent(trelloToken)}`;
    const listResponse = await fetch(listUrl);
    if (!listResponse.ok) {
        return (cards || []).map((card) => ({
            ...card,
            type: resolveCardType(card?.name),
            listName: null,
        }));
    }

    const listPayload = await listResponse.json();
    const listsById = Array.isArray(listPayload)
        ? Object.fromEntries(listPayload.map((list) => [list.id, list.name]))
        : { [listPayload.id]: listPayload.name };

    return (cards || []).map((card) => ({
        ...card,
        type: resolveCardType(card?.name),
        listName: listsById[card?.idList] || null,
    }));
}

export async function getTrainingOrShiftCards({ boardId, apiKey, token }) {
    const cards = await getTrelloBoardCards({ boardId, apiKey, token });
    return cards.filter((card) => {
        const type = resolveCardType(card?.name);
        return type === 'training' || type === 'shift';
    });
}

export async function syncSessionBoardCard({
    title,
    status,
    notes,
    boardId,
    listId,
    apiKey,
    token,
    sessionKey,
    hostName,
    hostRoleName,
}) {
    const normalizedStatus = normalizeSessionStatus(status);
    const trelloApiKey = apiKey || process.env.TRELLO_API_KEY;
    const trelloToken = token || process.env.TRELLO_TOKEN;

    if (!boardId || !listId || !trelloApiKey || !trelloToken) {
        throw new Error('Missing Trello board configuration. Set TRELLO_API_KEY, TRELLO_TOKEN, boardId, and listId.');
    }

    const cardName = title?.trim() || 'Roblox Session';
    const cardDescription = buildSessionCardDescription({
        title: cardName,
        status: normalizedStatus,
        notes,
        hostName,
        hostRoleName,
        sessionKey,
        updatedAt: new Date().toISOString(),
    });

    const cardsUrl = `https://api.trello.com/1/boards/${encodeURIComponent(boardId)}/cards`;
    const cardsResponse = await fetch(`${cardsUrl}?key=${encodeURIComponent(trelloApiKey)}&token=${encodeURIComponent(trelloToken)}`);
    if (!cardsResponse.ok) {
        const errorText = await cardsResponse.text();
        throw new Error(`Failed to fetch Trello cards: ${cardsResponse.status} ${errorText}`);
    }

    const boardCards = await cardsResponse.json();
    const existingCard = boardCards.find((card) => {
        if (!card) {
            return false;
        }
        const cardMatchesSessionKey = sessionKey && (card.id === sessionKey || (card.desc || '').includes(`Session ID: ${sessionKey}`));
        const cardMatchesName = card.name === cardName;
        return cardMatchesSessionKey || cardMatchesName;
    });

    const params = new URLSearchParams({
        key: trelloApiKey,
        token: trelloToken,
        name: cardName,
        desc: cardDescription,
    });

    if (existingCard) {
        params.set('idList', listId);
        const updateUrl = `https://api.trello.com/1/cards/${existingCard.id}`;
        const updateResponse = await fetch(`${updateUrl}?${params.toString()}`, { method: 'PUT' });
        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Failed to update Trello card: ${updateResponse.status} ${errorText}`);
        }

        const updatedCard = await updateResponse.json();
        return {
            cardId: updatedCard.id,
            shortLink: updatedCard.shortLink,
            url: updatedCard.url,
            status: normalizedStatus,
            listId,
            name: cardName,
        };
    }

    params.set('idList', listId);
    const createResponse = await fetch(`https://api.trello.com/1/cards?${params.toString()}`, { method: 'POST' });
    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create Trello card: ${createResponse.status} ${errorText}`);
    }

    const createdCard = await createResponse.json();
    return {
        cardId: createdCard.id,
        shortLink: createdCard.shortLink,
        url: createdCard.url,
        status: normalizedStatus,
        listId,
        name: cardName,
    };
}
