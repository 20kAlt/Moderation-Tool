import axios from 'axios';

const SERVER_STATUS_MAP = {
  'shift training': 'Shift Training',
  'promotional shift': 'Promotional Shift',
  'show': 'Show',
  'canceled': 'Canceled',
  'cancelled': 'Canceled',
  'planned': 'Planned',
  'delayed': 'Delayed',
  'ongoing': 'Ongoing',
};

const SESSION_TYPE_MAP = {
  'shift training': 'Shift Training',
  'promotional shift': 'Promotional Shift',
  'show': 'Show',
  'canceled': 'Canceled',
  'cancelled': 'Canceled',
};

const STATUS_ALIASES = new Map(Object.entries(SERVER_STATUS_MAP));
const TYPE_ALIASES = new Map(Object.entries(SESSION_TYPE_MAP));
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const BOARD_TRACKERS = new Map();
let autoRefreshTimer = null;

function normalizeText(value = '') {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBoardReference(value = '') {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const urlMatch = trimmed.match(/trello\.com\/(?:b|board)\/([^/?#]+)/i)
    || trimmed.match(/trello\.com\/(?:b|board)\/([^\s]+)$/i);
  if (urlMatch) {
    return urlMatch[1].trim();
  }

  return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function canonicalStatus(value = '') {
  const normalized = normalizeText(value);
  const direct = STATUS_ALIASES.get(normalized);
  if (direct) {
    return direct;
  }

  for (const [key, label] of STATUS_ALIASES.entries()) {
    if (normalized.includes(key)) {
      return label;
    }
  }

  return 'Unknown';
}

function canonicalType(value = '') {
  const normalized = normalizeText(value);
  const direct = TYPE_ALIASES.get(normalized);
  if (direct) {
    return direct;
  }

  for (const [key, label] of TYPE_ALIASES.entries()) {
    if (normalized.includes(key)) {
      return label;
    }
  }

  return 'Unknown';
}

function parseCardFields(card = {}) {
  const text = [card.name ?? '', card.desc ?? '', card.shortUrl ?? '', card.url ?? '']
    .join('\n');

  const fieldMap = {
    host: 'Unknown',
    coHost: 'Not listed',
    userId: 'Not listed',
    time: 'Not listed',
    type: 'Unknown',
    status: 'Unknown',
  };

  const lines = text.split(/\r?\n|\|/g);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(?:host|co-host|co host|user id|time|status|due|due date)\s*[:=-]\s*(.+)$/i);
    if (!match) continue;

    const rawValue = match[1].trim();
    if (!rawValue) continue;

    const key = trimmed.split(/[:=-]/)[0].trim().toLowerCase();
    if (key.includes('co-host') || key.includes('co host')) {
      fieldMap.coHost = rawValue;
    } else if (key.includes('host')) {
      fieldMap.host = rawValue;
    } else if (key.includes('user')) {
      fieldMap.userId = rawValue;
    } else if (key.includes('time') || key.includes('due')) {
      fieldMap.time = rawValue;
    } else if (key.includes('status')) {
      fieldMap.status = canonicalStatus(rawValue);
    }
  }

  const inlineHost = /host\s*[:=-]\s*([^\n|]+)/i.exec(text);
  if (inlineHost && fieldMap.host === 'Unknown') {
    fieldMap.host = inlineHost[1].trim();
  }

  const inlineCoHost = /co-?host\s*[:=-]\s*([^\n|]+)/i.exec(text);
  if (inlineCoHost && fieldMap.coHost === 'Not listed') {
    fieldMap.coHost = inlineCoHost[1].trim();
  }

  const inlineUserId = /user(?:\s+id)?\s*[:=-]\s*([^\n|]+)/i.exec(text);
  if (inlineUserId && fieldMap.userId === 'Not listed') {
    fieldMap.userId = inlineUserId[1].trim();
  }

  const dueDate = card.due ? new Date(card.due) : null;
  if (fieldMap.time === 'Not listed' && dueDate && !Number.isNaN(dueDate.getTime())) {
    fieldMap.time = dueDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  const inlineTime = /(?:time|shift\s*time|session\s*time|start\s*time|start\s+at|due\s*date)\s*[:=-]\s*([^\n|]+)/i.exec(text);
  if (inlineTime && fieldMap.time === 'Not listed') {
    fieldMap.time = inlineTime[1].trim();
  }

  return fieldMap;
}

function resolveBoardType(card, listNameMap) {
  const listName = listNameMap.get(card.idList) || '';
  const typeFromList = canonicalType(listName);
  if (typeFromList !== 'Unknown') {
    return typeFromList;
  }

  const combinedText = `${card.name ?? ''} ${card.desc ?? ''}`.toLowerCase();
  for (const [key, label] of TYPE_ALIASES.entries()) {
    if (combinedText.includes(key)) {
      return label;
    }
  }

  if (combinedText.includes('shift')) {
    return 'Shift';
  }

  return 'Unknown';
}

function resolveBoardStatus(card, listNameMap) {
  const labelNames = Array.isArray(card.labels) ? card.labels.map((label) => label?.name).filter(Boolean) : [];
  for (const labelName of labelNames) {
    const labelStatus = canonicalStatus(labelName);
    if (labelStatus !== 'Unknown') {
      return labelStatus;
    }
  }

  const listName = listNameMap.get(card.idList) || '';
  const statusFromList = canonicalStatus(listName);
  if (statusFromList !== 'Unknown') {
    return statusFromList;
  }

  const fieldStatus = parseCardFields(card).status;
  if (fieldStatus !== 'Unknown') {
    return fieldStatus;
  }

  const combinedText = `${card.name ?? ''} ${card.desc ?? ''}`.toLowerCase();
  for (const [key, label] of STATUS_ALIASES.entries()) {
    if (combinedText.includes(key)) {
      return label;
    }
  }

  return 'Unknown';
}

function buildSessionBoardEmbed({ boardName, boardUrl, cards, lastUpdated }) {
  const trackedCards = cards.filter((card) => card.status !== 'Unknown');

  const safeBoardName = boardName || 'Trello Session Board';
  const description = trackedCards.length > 0
    ? `Live Trello session cards for ${safeBoardName}. Refreshes every 5 minutes.`
    : 'No shifts are planned. Check back later.';

  const lines = trackedCards.map((card) => {
    const fields = parseCardFields(card);
    const host = fields.host || 'Unknown';
    const coHost = fields.coHost || 'Not listed';
    const userId = fields.userId || 'Not listed';
    const time = fields.time || 'Not listed';
    const type = card.type || 'Unknown';
    const status = card.status || 'Unknown';
    const cardName = (card.name || 'Untitled card').replace(/\s+/g, ' ').trim();

    return `• **${cardName}**\n  Type: ${type} • Status: ${status} • Host: ${host} • Co-host: ${coHost} • User ID: ${userId} • Time: ${time}`;
  });

  const embed = {
    title: `📋 ${safeBoardName}`,
    description,
    color: trackedCards.length > 0 ? 0x2ecc71 : 0x95a5a6,
    fields: [
      {
        name: `Live cards (${trackedCards.length})`,
        value: lines.length > 0 ? lines.join('\n\n') : 'No matching session cards on this board right now.',
      },
    ],
    footer: {
      text: `Updated ${lastUpdated}`,
    },
  };

  if (boardUrl) {
    embed.url = boardUrl;
  }

  return embed;
}

async function resolveBoardReference(apiKey, token, boardId) {
  const reference = normalizeBoardReference(boardId);
  if (!reference) {
    return null;
  }

  try {
    const boardResponse = await axios.get(`https://api.trello.com/1/boards/${reference}`, {
      params: { key: apiKey, token, fields: 'id,name,url,shortLink,shortUrl' },
      timeout: 10000,
    });
    return boardResponse.data?.id || reference;
  } catch (error) {
    if (!token || error?.response?.status !== 404) {
      throw error;
    }

    try {
      const boardsResponse = await axios.get('https://api.trello.com/1/members/me/boards', {
        params: { key: apiKey, token, fields: 'id,name,url,shortLink,shortUrl' },
        timeout: 10000,
      });

      const boards = boardsResponse.data || [];
      const matchedBoard = boards.find((board) => {
        const candidateValues = [
          board.id,
          board.shortLink,
          board.shortUrl,
          board.url,
          board.name,
          normalizeBoardReference(board.shortUrl),
          normalizeBoardReference(board.url),
        ].filter(Boolean);

        return candidateValues.some((value) => value.toLowerCase() === reference.toLowerCase());
      });

      if (matchedBoard) {
        return matchedBoard.id;
      }
    } catch (lookupError) {
      throw error;
    }

    throw error;
  }
}

async function fetchTrelloBoardData(apiKey, token, boardId) {
  if (!apiKey || !boardId) {
    return null;
  }

  const resolvedBoardId = await resolveBoardReference(apiKey, token, boardId);
  if (!resolvedBoardId) {
    return null;
  }

  const params = { key: apiKey, token };

  const [boardResponse, listResponse, cardResponse] = await Promise.all([
    axios.get(`https://api.trello.com/1/boards/${resolvedBoardId}`, { params: { ...params, fields: 'name,url' }, timeout: 10000 }),
    axios.get(`https://api.trello.com/1/boards/${resolvedBoardId}/lists`, { params: { ...params, fields: 'name,id' }, timeout: 10000 }),
    axios.get(`https://api.trello.com/1/boards/${resolvedBoardId}/cards`, { params: { ...params, fields: 'name,desc,idList,url,shortUrl,labels,due' }, timeout: 10000 }),
  ]);

  const listNameMap = new Map((listResponse.data || []).map((list) => [list.id, list.name]));
  const cards = (cardResponse.data || []).map((card) => {
    const parsedFields = parseCardFields(card);
    return {
      ...card,
      ...parsedFields,
      type: resolveBoardType(card, listNameMap),
      status: resolveBoardStatus(card, listNameMap),
    };
  });

  return {
    boardName: boardResponse.data?.name || 'Trello Session Board',
    boardUrl: boardResponse.data?.url || boardResponse.data?.shortUrl || null,
    cards,
  };
}

function ensureAutoRefresh(client) {
  if (autoRefreshTimer) {
    return;
  }

  autoRefreshTimer = setInterval(async () => {
    for (const tracker of BOARD_TRACKERS.values()) {
      try {
        await refreshSessionBoardMessage(client, tracker);
      } catch (error) {
        console.error('Failed to refresh session board:', error.message || error);
      }
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}

export function getGuildSessionBoardConfig(guildConfig = {}) {
  const sessionBoard = guildConfig.sessionBoard || {};
  return {
    apiKey: sessionBoard.apiKey || null,
    token: sessionBoard.token || null,
    boardId: sessionBoard.boardId || null,
    channelId: sessionBoard.channelId || null,
    autoUpdate: Boolean(sessionBoard.autoUpdate),
    messageId: sessionBoard.messageId || null,
  };
}

export async function fetchSessionBoardStatus({ apiKey = process.env.TRELLO_API_KEY, token = process.env.TRELLO_TOKEN, boardId = process.env.TRELLO_BOARD_ID, guildConfig = null } = {}) {
  const guildSessionConfig = getGuildSessionBoardConfig(guildConfig);
  const resolvedApiKey = apiKey || guildSessionConfig.apiKey || null;
  const resolvedToken = token || guildSessionConfig.token || null;
  const resolvedBoardId = normalizeBoardReference(boardId || guildSessionConfig.boardId || process.env.TRELLO_BOARD_ID || null);

  if (!resolvedApiKey || !resolvedBoardId) {
    throw new Error('Trello API key and board ID are required for this server. Set them with /sessionboard or save them to this server configuration.');
  }

  let data;
  try {
    data = await fetchTrelloBoardData(resolvedApiKey, resolvedToken, resolvedBoardId);
  } catch (error) {
    const statusCode = error?.response?.status;
    const reason = statusCode === 404
      ? 'The board reference is invalid or the token does not have access to that Trello board.'
      : error?.message || 'Unknown Trello error';
    throw new Error(`Unable to load Trello board data. ${reason}`);
  }

  if (!data) {
    throw new Error('Unable to load Trello board data. The board reference may be wrong or the token may not have access to this board.');
  }

  const cards = (data.cards || []).filter((card) => card.status !== 'Unknown');
  return {
    boardName: data.boardName,
    boardUrl: data.boardUrl,
    cards,
    activeCards: cards,
    totalCards: cards.length,
    updatedAt: new Date().toISOString(),
  };
}

export async function refreshSessionBoardMessage(client, tracker) {
  const { guildId, channelId, boardId, apiKey, token, messageId } = tracker;
  if (!guildId || !channelId || !boardId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return null;
  }

  const status = await fetchSessionBoardStatus({ apiKey, token, boardId });
  const embed = buildSessionBoardEmbed({
    boardName: status.boardName,
    boardUrl: status.boardUrl,
    cards: status.cards,
    lastUpdated: new Date(status.updatedAt).toLocaleString(),
  });

  if (!messageId) {
    const sentMessage = await channel.send({ embeds: [embed] });
    tracker.messageId = sentMessage.id;
    return sentMessage;
  }

  const existingMessage = await channel.messages.fetch(messageId).catch(() => null);
  if (!existingMessage) {
    const sentMessage = await channel.send({ embeds: [embed] });
    tracker.messageId = sentMessage.id;
    return sentMessage;
  }

  await existingMessage.edit({ embeds: [embed] });
  return existingMessage;
}

export async function createLiveSessionBoard(client, { guildId, channelId, boardId, apiKey = process.env.TRELLO_API_KEY, token = process.env.TRELLO_TOKEN, autoUpdate = false, guildConfig = null } = {}) {
  if (!guildId || !channelId || !boardId) {
    throw new Error('Guild ID, channel ID, and board ID are required to install a live session board.');
  }

  const guildSessionConfig = getGuildSessionBoardConfig(guildConfig);
  const resolvedApiKey = apiKey || guildSessionConfig.apiKey || null;
  const resolvedToken = token || guildSessionConfig.token || null;
  const resolvedBoardId = normalizeBoardReference(boardId || guildSessionConfig.boardId || null);

  if (!resolvedApiKey || !resolvedBoardId) {
    throw new Error('This server is missing a Trello API key and board ID. Save them with /sessionboard.');
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error('The selected channel is not a valid text channel.');
  }

  const trackerKey = `${guildId}:${channelId}`;
  const tracker = {
    guildId,
    channelId,
    boardId: resolvedBoardId,
    apiKey: resolvedApiKey,
    token: resolvedToken,
    messageId: BOARD_TRACKERS.get(trackerKey)?.messageId || null,
  };

  BOARD_TRACKERS.set(trackerKey, tracker);

  const status = await fetchSessionBoardStatus({ apiKey: resolvedApiKey, token: resolvedToken, boardId: resolvedBoardId });
  const embed = buildSessionBoardEmbed({
    boardName: status.boardName,
    boardUrl: status.boardUrl,
    cards: status.cards,
    lastUpdated: new Date(status.updatedAt).toLocaleString(),
  });

  const sentMessage = await channel.send({ embeds: [embed] });
  tracker.messageId = sentMessage.id;
  BOARD_TRACKERS.set(trackerKey, tracker);

  if (autoUpdate) {
    ensureAutoRefresh(client);
  }

  return sentMessage;
}

export function stopLiveSessionBoard(guildId, channelId) {
  const trackerKey = `${guildId}:${channelId}`;
  BOARD_TRACKERS.delete(trackerKey);
}

export function getTrackedSessionBoards() {
  return [...BOARD_TRACKERS.values()];
}
