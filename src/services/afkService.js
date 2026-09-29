import { deleteFromDb, getAFKKey, getFromDb, setInDb } from '../utils/database.js';

export async function getAfkStatus(guildId, userId) {
  return await getFromDb(getAFKKey(guildId, userId), null);
}

export async function setAfkStatus(guildId, userId, reason) {
  const status = {
    reason: reason || null,
    since: Date.now(),
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