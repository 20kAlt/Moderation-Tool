import { deleteFromDb, getFromDb, setInDb } from './wrapper.js';
import {
    getGuildSharedTodoKey,
    getGuildTodoKey,
} from './keys.js';

const emptyTodoList = () => ({ tasks: [], nextId: 1 });

export async function getGuildTodoData(guildId, userId) {
    if (!guildId || !userId) return emptyTodoList();

    const scopedKey = getGuildTodoKey(guildId, userId);
    const scopedData = await getFromDb(scopedKey, null);
    if (scopedData) return scopedData;

    const legacyKey = `todo_${userId}`;
    const legacyData = await getFromDb(legacyKey, null);
    if (!legacyData || typeof legacyData !== 'object') return emptyTodoList();
    if (legacyData.guildId && legacyData.guildId !== guildId) return emptyTodoList();

    const claimedData = { ...legacyData, guildId };
    if (!(await setInDb(legacyKey, claimedData))) return emptyTodoList();
    if (await setInDb(scopedKey, claimedData)) {
        await deleteFromDb(legacyKey);
    }

    return claimedData;
}

export async function getGuildSharedTodoData(client, guildId, listId, userId) {
    if (!guildId || !listId || !userId || !client?.db) return null;

    const scopedKey = getGuildSharedTodoKey(guildId, listId);
    const scopedData = await getFromDb(scopedKey, null);
    if (scopedData) {
        return scopedData.guildId && scopedData.guildId !== guildId ? null : scopedData;
    }

    const legacyKey = `shared_todo_${listId}`;
    const legacyData = await getFromDb(legacyKey, null);
    if (
        !legacyData ||
        (legacyData.guildId && legacyData.guildId !== guildId) ||
        (legacyData.creatorId !== userId && !legacyData.members?.includes(userId))
    ) {
        return null;
    }

    const claimedData = { ...legacyData, guildId };
    if (!(await setInDb(legacyKey, claimedData))) return null;
    if (await setInDb(scopedKey, claimedData)) {
        await deleteFromDb(legacyKey);
    }

    return claimedData;
}