import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SESSION_BOARD_STATUSES,
    buildSessionCardDescription,
    canEditSessionBoard,
    normalizeSessionStatus,
    parseRoleIds,
    syncSessionBoardCard,
} from '../src/services/sessionBoardService.js';

test('session board status values are normalized to the supported set', () => {
    assert.equal(normalizeSessionStatus('Planned'), 'planned');
    assert.equal(normalizeSessionStatus('ongoing'), 'ongoing');
    assert.equal(normalizeSessionStatus('cancelled'), 'cancelled');
    assert.equal(normalizeSessionStatus('unknown'), 'planned');
    assert.deepEqual(SESSION_BOARD_STATUSES, ['planned', 'ongoing', 'cancelled']);
});

test('role parsing and access control handle host and co-host roles', () => {
    assert.deepEqual(parseRoleIds('<@&100> , <@&200>'), ['100', '200']);

    const hostMember = {
        roles: {
            cache: new Map([
                ['100', {}],
                ['300', {}],
            ]),
        },
    };

    const coHostMember = {
        roles: {
            cache: new Map([
                ['200', {}],
            ]),
        },
    };

    const config = {
        sessionBoard: {
            hostRoleId: '100',
            coHostRoleIds: ['200'],
        },
    };

    assert.equal(canEditSessionBoard(hostMember, config), true);
    assert.equal(canEditSessionBoard(coHostMember, config), true);

    const guestMember = {
        roles: {
            cache: new Map([
                ['999', {}],
            ]),
        },
    };

    assert.equal(canEditSessionBoard(guestMember, config), false);
});

test('session card description captures the session metadata and status', () => {
    const description = buildSessionCardDescription({
        title: 'Friday Practice',
        status: 'ongoing',
        notes: 'Bring the Roblox track and confirm co-host order.',
        hostName: 'Sky',
        hostRoleName: 'Trusted Host',
        sessionKey: 'session-42',
        updatedAt: '2026-10-28T08:00:00.000Z',
    });

    assert.match(description, /Session: Friday Practice/);
    assert.match(description, /Status: ongoing/);
    assert.match(description, /Host: Sky/);
    assert.match(description, /Co-host rank: Trusted Host/);
    assert.match(description, /Session ID: session-42/);
    assert.match(description, /Bring the Roblox track/);
});

test('syncSessionBoardCard creates and updates Trello cards using the configured board and status list', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];

    globalThis.fetch = async (url, options = {}) => {
        requests.push({ url: String(url), method: options.method || 'GET' });

        if (String(url).startsWith('https://api.trello.com/1/boards/board-1/cards')) {
            return {
                ok: true,
                json: async () => [],
            };
        }

        if (String(url).startsWith('https://api.trello.com/1/cards')) {
            return {
                ok: true,
                json: async () => ({
                    id: 'card-1',
                    shortLink: 'abc123',
                    url: 'https://trello.com/c/abc123',
                }),
            };
        }

        throw new Error(`Unexpected fetch call: ${url}`);
    };

    try {
        const result = await syncSessionBoardCard({
            title: 'Friday Testing',
            status: 'cancelled',
            notes: 'The server is offline during maintenance.',
            boardId: 'board-1',
            listId: 'cancelled-list',
            apiKey: 'api-key',
            token: 'token',
            sessionKey: 'session-42',
            hostName: 'Sky',
            hostRoleName: 'Trusted Host',
        });

        assert.equal(result.status, 'cancelled');
        assert.equal(result.listId, 'cancelled-list');
        assert.equal(result.name, 'Friday Testing');
        assert.ok(requests.some((request) => request.url.includes('/boards/board-1/cards')));
        assert.ok(requests.some((request) => request.url.includes('idList=cancelled-list')));
    } finally {
        globalThis.fetch = originalFetch;
    }
});
