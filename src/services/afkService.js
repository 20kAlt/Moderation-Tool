import { deleteFromDb, getAFKKey, getFromDb, setInDb } from '../utils/database.js';

export const AFK_NICKNAME_PREFIX = 'AFK | ';

export function createAfkNickname(displayName) {
  return `${AFK_NICKNAME_PREFIX}${displayName}`.slice(0, 32);
}

export async function restoreAfkNickname(member, status) {
  if (
    !member?.setNickname
    || !member.nickname?.startsWith(AFK_NICKNAME_PREFIX)
  ) {
    return false;
  }

  await member.setNickname(status?.originalNickname ?? null, 'Member returned from AFK');
  return true;
}

export async function getAfkStatus(guildId, userId) {
  return await getFromDb(getAFKKey(guildId, userId), null);
}

export async function setAfkStatus(guildId, userId, reason, originalNickname = null) {
  const status = {
    reason: reason || null,
    since: Date.now(),
    originalNickname,
  };

  const saved = await setInDb(getAFKKey(guildId, userId), status);
  return saved ? status : null;
}

export async function clearAfkStatus(guildId, userId) {
  const status = await getAfkStatus(guildId, userId);
  if (!status) return null;

  const deleted = await deleteFromDb(getAFKKey(guildId, userId));
  return deleted ? status : null;
}