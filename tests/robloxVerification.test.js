import test from 'node:test';
import assert from 'node:assert/strict';
import {
    cancelRobloxAuthorization,
    completeRobloxAuthorization,
    createRobloxAuthorizationUrl,
    formatRobloxNickname,
} from '../src/services/robloxVerificationService.js';
import { verifyUser } from '../src/services/verificationService.js';
import {
    buildVerificationPanelPayload,
    normalizeVerificationImageUrl,
} from '../src/utils/verificationPanel.js';

function withRobloxOAuthEnvironment(callback) {
    const original = {
        clientId: process.env.ROBLOX_OAUTH_CLIENT_ID,
        clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.ROBLOX_OAUTH_REDIRECT_URI,
    };

    process.env.ROBLOX_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.ROBLOX_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.ROBLOX_OAUTH_REDIRECT_URI = 'https://verify.example.com/oauth/roblox/callback';

    return Promise.resolve()
        .then(callback)
        .finally(() => {
            if (original.clientId === undefined) delete process.env.ROBLOX_OAUTH_CLIENT_ID;
            else process.env.ROBLOX_OAUTH_CLIENT_ID = original.clientId;
            if (original.clientSecret === undefined) delete process.env.ROBLOX_OAUTH_CLIENT_SECRET;
            else process.env.ROBLOX_OAUTH_CLIENT_SECRET = original.clientSecret;
            if (original.redirectUri === undefined) delete process.env.ROBLOX_OAUTH_REDIRECT_URI;
            else process.env.ROBLOX_OAUTH_REDIRECT_URI = original.redirectUri;
        });
}

test('Roblox authorization URL uses identity scopes and PKCE without exposing secrets', async () => {
    await withRobloxOAuthEnvironment(() => {
        const url = new URL(createRobloxAuthorizationUrl({
            guildId: 'guild-1',
            discordUserId: 'discord-1',
        }));

        assert.equal(url.origin, 'https://apis.roblox.com');
        assert.equal(url.pathname, '/oauth/v1/authorize');
        assert.equal(url.searchParams.get('scope'), 'openid profile');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]+$/);
        assert.equal(url.searchParams.get('client_secret'), null);
        cancelRobloxAuthorization(url.searchParams.get('state'));
    });
});

test('Roblox callback exchanges the one-time code with PKCE and reads the authenticated profile', async () => {
    await withRobloxOAuthEnvironment(async () => {
        const originalFetch = globalThis.fetch;
        const requests = [];
        globalThis.fetch = async (url, options) => {
            requests.push({ url: String(url), options });
            if (String(url).endsWith('/token')) {
                return {
                    ok: true,
                    json: async () => ({ access_token: 'temporary-access-token' }),
                };
            }
            return {
                ok: true,
                json: async () => ({ sub: '123456', preferred_username: 'RobloxUser' }),
            };
        };

        try {
            const authorizeUrl = new URL(createRobloxAuthorizationUrl({
                guildId: 'guild-1',
                discordUserId: 'discord-1',
            }));
            const state = authorizeUrl.searchParams.get('state');
            const result = await completeRobloxAuthorization({ state, code: 'one-time-code' });
            const tokenBody = new URLSearchParams(requests[0].options.body);

            assert.equal(result.guildId, 'guild-1');
            assert.equal(result.discordUserId, 'discord-1');
            assert.equal(result.robloxUserId, '123456');
            assert.equal(result.robloxUsername, 'RobloxUser');
            assert.equal(result.robloxDisplayName, 'RobloxUser');
            assert.equal(tokenBody.get('code_verifier')?.length, 43);
            assert.equal(tokenBody.get('grant_type'), 'authorization_code');
            assert.equal(requests[1].options.headers.Authorization, 'Bearer temporary-access-token');
            await assert.rejects(
                () => completeRobloxAuthorization({ state, code: 'replayed-code' }),
                /expired or was already used/,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

test('verification panel supports custom branding and an optional HTTPS image', () => {
    const payload = buildVerificationPanelPayload({
        mode: 'roblox',
        title: 'Sunset Point Verification',
        message: 'Link your Roblox account to access the server.',
        buttonText: 'Link Roblox',
        imageUrl: 'https://example.com/banner.png',
    });
    const embed = payload.embeds[0].toJSON();
    const button = payload.components[0].components[0].toJSON();

    assert.equal(embed.title, 'Sunset Point Verification');
    assert.equal(embed.description, 'Link your Roblox account to access the server.');
    assert.equal(embed.image.url, 'https://example.com/banner.png');
    assert.equal(button.label, 'Link Roblox');
    assert.equal(button.custom_id, 'verify_user');
    assert.equal(button.style, 1);
    assert.equal(normalizeVerificationImageUrl(''), null);
    assert.throws(() => normalizeVerificationImageUrl('http://example.com/banner.png'), /HTTPS/);
    assert.equal(formatRobloxNickname('Craiz', 'olivier97766'), 'Craiz (@olivier97766)');
    assert.equal(formatRobloxNickname('A very long Roblox display name', 'olivier97766').length, 32);
});

test('direct verification cannot bypass Roblox linking mode', async () => {
    const member = {
        id: 'discord-user',
        roles: { cache: new Map() },
    };
    const guild = {
        id: 'guild-1',
        members: { fetch: async () => member },
    };
    const client = {
        guilds: { cache: new Map([[guild.id, guild]]) },
        db: {
            get: async () => ({
                verification: {
                    enabled: true,
                    mode: 'roblox',
                    roleId: 'verified-role',
                },
            }),
        },
    };

    await assert.rejects(
        () => verifyUser(client, guild.id, member.id, { source: 'command_self' }),
        (error) => error.userMessage?.includes('requires Roblox account linking'),
    );
});

test('verification adds the verified role and removes the configured unverified role', async () => {
    for (const { mode, source } of [
        { mode: 'standard', source: 'button_click' },
        { mode: 'roblox', source: 'roblox_oauth' },
    ]) {
        const verifiedRole = { id: `verified-${mode}`, name: 'Verified', position: 2 };
        const unverifiedRole = { id: `unverified-${mode}`, name: 'Unverified', position: 1 };
        const memberRoleIds = new Set([unverifiedRole.id]);
        const roleChanges = [];
        const member = {
            id: `member-${mode}`,
            roles: {
                cache: { has: (roleId) => memberRoleIds.has(roleId) },
                add: async (roleId) => {
                    roleChanges.push(['add', roleId]);
                    memberRoleIds.add(roleId);
                },
                remove: async (roleId) => {
                    roleChanges.push(['remove', roleId]);
                    memberRoleIds.delete(roleId);
                },
            },
        };
        const botMember = {
            permissions: { has: () => true },
            roles: { highest: { position: 10 } },
        };
        const guild = {
            id: `guild-${mode}`,
            members: {
                me: botMember,
                fetch: async () => member,
            },
            roles: {
                cache: new Map([
                    [verifiedRole.id, verifiedRole],
                    [unverifiedRole.id, unverifiedRole],
                ]),
            },
        };
        const client = {
            guilds: { cache: new Map([[guild.id, guild]]) },
            db: {
                get: async () => ({
                    verification: {
                        enabled: true,
                        mode,
                        roleId: verifiedRole.id,
                        unverifiedRoleId: unverifiedRole.id,
                    },
                }),
            },
        };

        const result = await verifyUser(client, guild.id, member.id, { source });

        assert.equal(result.status, 'verified');
        assert.deepEqual(roleChanges, [
            ['add', verifiedRole.id],
            ['remove', unverifiedRole.id],
        ]);
        assert.equal(memberRoleIds.has(verifiedRole.id), true);
        assert.equal(memberRoleIds.has(unverifiedRole.id), false);
    }
});
