export function getBotInfoTopic(content) {
  const normalized = content.trim().toLowerCase();

  if (
    /\bcredits?\b/.test(normalized)
    || /\bwho\s+(?:made|created|built|developed|owns?)\b/.test(normalized)
    || /\bwho\s+(?:is|are)\s+(?:the\s+)?(?:creator|owner|developer|author)\b/.test(normalized)
    || /\b(?:creator|owner|developer|author)\s+(?:of|for)\s+(?:this|the|your)?\s*bot\b/.test(normalized)
  ) {
    return 'credits';
  }

  if (
    /\b(?:what|who)\s+(?:is|are)\s+(?:this|the|your)?\s*bot\b/.test(normalized)
    || /\bwhat\s+do\s+you\s+do\b/.test(normalized)
    || /\btell\s+me\s+about\s+(?:this|the|your)?\s*bot\b/.test(normalized)
  ) {
    return 'about';
  }

  return null;
}

export function createBotInfoReply(topic, credits) {
  const owner = typeof credits?.owner === 'string' && credits.owner.trim()
    ? credits.owner.trim()
    : null;
  const ownership = owner
    ? `According to the bot's credits, Moderation Tool is owned by **${owner}**.`
    : 'The bot’s credits do not currently list an owner.';

  if (topic === 'credits') {
    return `${ownership} The credits do not identify individual developers.`;
  }

  if (topic === 'about') {
    return `I’m the Moderation Tool Discord bot, built to provide moderation and community tools for servers. ${ownership}`;
  }

  throw new TypeError(`Unsupported bot information topic: ${topic}`);
}
